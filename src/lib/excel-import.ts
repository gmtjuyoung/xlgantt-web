import * as XLSX from 'xlsx'
import type { Task, DependencyType, CalendarType } from './types'

/**
 * Parse XLGantt v6.0.0 Excel file and extract data.
 */
export interface ImportResult {
  projectName: string
  projectStart: string
  projectEnd: string
  tasks: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'project_id'>[]
  dependencies: { predecessorSortOrder: number; successorSortOrder: number; depType: DependencyType }[]
  holidays: { date: string; name: string; calendarType: CalendarType }[]
}

export function importXLGanttFile(fileBuffer: ArrayBuffer): ImportResult {
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true })

  // Parse Settings sheet for project info
  const settingsSheet = workbook.Sheets['Settings']
  let projectName = 'Imported Project'
  let projectStart = ''
  let projectEnd = ''

  if (settingsSheet) {
    // Settings has key-value pairs - scan for project info
    const settingsData = XLSX.utils.sheet_to_json<Record<string, unknown>>(settingsSheet, { header: 1 })
    for (const row of settingsData) {
      const values = Object.values(row)
      if (values[0] === 'projectName' && values[1]) {
        projectName = String(values[1])
      }
      if (values[0] === 'projectStartDate' && values[1]) {
        projectStart = formatExcelDate(values[1])
      }
      if (values[0] === 'projectEndDate' && values[1]) {
        projectEnd = formatExcelDate(values[1])
      }
    }
  }

  // Parse Schedule sheet
  const scheduleSheet = workbook.Sheets['Schedule']
  if (!scheduleSheet) {
    throw new Error('Schedule sheet not found in the Excel file')
  }

  const tasks: ImportResult['tasks'] = []
  const dependencies: ImportResult['dependencies'] = []
  const rowToSortOrder: Record<number, number> = {}

  // Read rows 5-56 (task data area), columns A-AE
  for (let row = 5; row <= 200; row++) {
    // Read key columns
    const depCell = getCellValue(scheduleSheet, 0, row) // Col A: dependency
    const groupCell = getCellValue(scheduleSheet, 1, row) // Col B: group flag
    const levelCell = getCellValue(scheduleSheet, 2, row) // Col C: WBS level
    const wbsCell = getCellValue(scheduleSheet, 3, row)   // Col D: WBS code

    // Skip empty rows
    if (!wbsCell && !levelCell) continue

    const wbsCode = String(wbsCell || '')
    const wbsLevel = Number(levelCell) || 1
    const isGroup = groupCell === 'G'

    // Read task name from the appropriate column (E + level - 1)
    // Task names span columns E(4) through N(13)
    let taskName = ''
    for (let col = 4; col <= 13; col++) {
      const val = getCellValue(scheduleSheet, col, row)
      if (val) {
        taskName = String(val)
        break
      }
    }

    // If no task name and no WBS code, skip
    if (!taskName && !wbsCode) continue

    const sortOrder = tasks.length * 1000 + 1000
    rowToSortOrder[row] = sortOrder

    const task: ImportResult['tasks'][0] = {
      sort_order: sortOrder,
      wbs_code: wbsCode,
      wbs_level: wbsLevel,
      is_group: isGroup,
      task_name: taskName,
      remarks: String(getCellValue(scheduleSheet, 14, row) || ''),       // Col O
      planned_start: formatExcelDate(getCellValue(scheduleSheet, 15, row)), // Col P
      planned_end: formatExcelDate(getCellValue(scheduleSheet, 16, row)),   // Col Q
      calendar_type: (String(getCellValue(scheduleSheet, 17, row) || 'STD')) as CalendarType, // Col R
      total_workload: Number(getCellValue(scheduleSheet, 18, row)) || undefined,   // Col S
      planned_workload: Number(getCellValue(scheduleSheet, 19, row)) || undefined, // Col T
      total_duration: Number(getCellValue(scheduleSheet, 20, row)) || undefined,   // Col U
      planned_duration: Number(getCellValue(scheduleSheet, 21, row)) || undefined, // Col V
      actual_start: formatExcelDate(getCellValue(scheduleSheet, 22, row)),         // Col W
      actual_end: formatExcelDate(getCellValue(scheduleSheet, 23, row)),           // Col X
      actual_workload: Number(getCellValue(scheduleSheet, 24, row)) || undefined,  // Col Y
      actual_duration: Number(getCellValue(scheduleSheet, 25, row)) || undefined,  // Col Z
      resource_count: Number(getCellValue(scheduleSheet, 26, row)) || undefined,   // Col AA
      deliverables: String(getCellValue(scheduleSheet, 28, row) || ''),            // Col AC
      planned_progress: Number(getCellValue(scheduleSheet, 29, row)) || 0,         // Col AD
      actual_progress: Number(getCellValue(scheduleSheet, 30, row)) || 0,          // Col AE
      is_milestone: false,
      is_collapsed: false,
    }

    // Detect milestone
    if (!isGroup && task.planned_start && task.planned_start === task.planned_end) {
      task.is_milestone = true
    }

    tasks.push(task)

    // Parse dependency
    if (depCell) {
      const depStr = String(depCell)
      const [typeStr, rowStr] = depStr.split(';')
      const depType = Number(typeStr) as DependencyType
      const predRow = Number(rowStr)

      if (depType >= 1 && depType <= 4 && predRow) {
        dependencies.push({
          predecessorSortOrder: -predRow, // Will resolve later
          successorSortOrder: sortOrder,
          depType,
        })
      }
    }
  }

  // Resolve dependency row references to sort orders
  for (const dep of dependencies) {
    const predRow = -dep.predecessorSortOrder
    dep.predecessorSortOrder = rowToSortOrder[predRow] || 0
  }

  // Set parent_id based on WBS hierarchy
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    if (task.wbs_level > 1) {
      // Find the closest preceding task with level = current level - 1
      for (let j = i - 1; j >= 0; j--) {
        if (tasks[j].wbs_level === task.wbs_level - 1) {
          // Mark parent as group
          tasks[j].is_group = true
          break
        }
      }
    }
  }

  // Parse Calendar sheet
  const holidays: ImportResult['holidays'] = []
  const calendarSheet = workbook.Sheets['Calendar']
  if (calendarSheet) {
    // STD calendar: columns A-B (rows 5-304)
    for (let row = 5; row <= 304; row++) {
      const name = getCellValue(calendarSheet, 0, row)
      const date = getCellValue(calendarSheet, 1, row)
      if (date) {
        holidays.push({
          date: formatExcelDate(date),
          name: String(name || ''),
          calendarType: 'STD',
        })
      }
    }
    // UD1 calendar: columns D-E
    for (let row = 5; row <= 304; row++) {
      const name = getCellValue(calendarSheet, 3, row)
      const date = getCellValue(calendarSheet, 4, row)
      if (date) {
        holidays.push({
          date: formatExcelDate(date),
          name: String(name || ''),
          calendarType: 'UD1',
        })
      }
    }
    // UD2 calendar: columns G-H
    for (let row = 5; row <= 304; row++) {
      const name = getCellValue(calendarSheet, 6, row)
      const date = getCellValue(calendarSheet, 7, row)
      if (date) {
        holidays.push({
          date: formatExcelDate(date),
          name: String(name || ''),
          calendarType: 'UD2',
        })
      }
    }
  }

  // Auto-detect project dates if not found in settings
  if (!projectStart) {
    const dates = tasks.map((t) => t.planned_start).filter(Boolean) as string[]
    if (dates.length) projectStart = dates.sort()[0]
  }
  if (!projectEnd) {
    const dates = tasks.map((t) => t.planned_end).filter(Boolean) as string[]
    if (dates.length) projectEnd = dates.sort().reverse()[0]
  }

  return { projectName, projectStart, projectEnd, tasks, dependencies, holidays }
}

// ============================================================
// Helper functions
// ============================================================

function getCellValue(sheet: XLSX.WorkSheet, col: number, row: number): unknown {
  const cellRef = XLSX.utils.encode_cell({ c: col, r: row - 1 }) // XLSX is 0-indexed
  const cell = sheet[cellRef]
  return cell?.v
}

function formatExcelDate(value: unknown): string {
  if (!value) return ''

  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (typeof value === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(value)
    if (date) {
      const month = String(date.m).padStart(2, '0')
      const day = String(date.d).padStart(2, '0')
      return `${date.y}-${month}-${day}`
    }
  }

  if (typeof value === 'string') {
    // Try to parse as date string
    const d = new Date(value)
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0]
    }
  }

  return ''
}
