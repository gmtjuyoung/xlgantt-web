import * as XLSX from 'xlsx'
import type { Project, Task, Dependency, DEP_TYPE_LABELS } from './types'
import type { Company, TeamMember, TaskAssignment } from './resource-types'

/**
 * XLGantt Web - 엑셀 내보내기
 * Schedule, Resources, Summary 3개 시트를 생성하여 .xlsx 파일로 다운로드
 */

interface ExportParams {
  project: Project
  tasks: Task[]
  dependencies: Dependency[]
  companies: Company[]
  members: TeamMember[]
  assignments: TaskAssignment[]
}

export function exportToExcel({
  project,
  tasks,
  dependencies,
  companies,
  members,
  assignments,
}: ExportParams): void {
  const wb = XLSX.utils.book_new()

  // ============================================================
  // 1. Schedule 시트
  // ============================================================
  const scheduleHeaders = [
    'WBS 코드',
    '작업명',
    '담당자',
    '시작일',
    '완료일',
    '기간(일)',
    '작업량(M/D)',
    '진척률(%)',
    '비고',
  ]

  const scheduleData: unknown[][] = [scheduleHeaders]

  const sortedTasks = [...tasks].sort((a, b) => a.sort_order - b.sort_order)

  for (const task of sortedTasks) {
    // 담당자 조합: 해당 task에 할당된 멤버 이름들
    const taskAssignments = assignments.filter((a) => a.task_id === task.id)
    const assigneeNames = taskAssignments
      .map((a) => {
        const member = members.find((m) => m.id === a.member_id)
        return member?.name || ''
      })
      .filter(Boolean)
      .join(', ')

    // 기간 계산
    const duration = task.planned_duration ?? task.total_duration ?? ''

    // 작업량
    const workload = task.planned_workload ?? task.total_workload ?? ''

    // 진척률 (0~1 -> 0~100)
    const progress = Math.round(task.actual_progress * 100)

    scheduleData.push([
      task.wbs_code,
      task.task_name,
      assigneeNames,
      task.planned_start || '',
      task.planned_end || '',
      duration,
      workload,
      progress,
      task.remarks || '',
    ])
  }

  const wsSchedule = XLSX.utils.aoa_to_sheet(scheduleData)

  // 헤더 스타일 (배경색) - xlsx 커뮤니티 에디션에서는 셀 스타일 제한적
  // 열 너비 자동 조정
  wsSchedule['!cols'] = calcColWidths(scheduleData)

  // 헤더 행 스타일 적용
  applyHeaderStyle(wsSchedule, scheduleHeaders.length)

  XLSX.utils.book_append_sheet(wb, wsSchedule, 'Schedule')

  // ============================================================
  // 2. Resources 시트
  // ============================================================
  const resourceHeaders = ['회사명', '담당자명', '역할', '이메일']
  const resourceData: unknown[][] = [resourceHeaders]

  for (const member of members) {
    const company = companies.find((c) => c.id === member.company_id)
    resourceData.push([
      company?.name || '',
      member.name,
      member.role || '',
      member.email || '',
    ])
  }

  const wsResources = XLSX.utils.aoa_to_sheet(resourceData)
  wsResources['!cols'] = calcColWidths(resourceData)
  applyHeaderStyle(wsResources, resourceHeaders.length)

  XLSX.utils.book_append_sheet(wb, wsResources, 'Resources')

  // ============================================================
  // 3. Summary 시트
  // ============================================================
  const totalTasks = sortedTasks.length
  const leafTasks = sortedTasks.filter((t) => !t.is_group)
  const overallProgress =
    leafTasks.length > 0
      ? Math.round(
          (leafTasks.reduce((sum, t) => sum + t.actual_progress, 0) / leafTasks.length) * 100
        )
      : 0

  const summaryHeaders = ['항목', '값']
  const summaryData: unknown[][] = [
    summaryHeaders,
    ['프로젝트명', project.name],
    ['시작일', project.start_date],
    ['완료일', project.end_date],
    ['기준일자', project.status_date || ''],
    ['총 작업수', totalTasks],
    ['리프 작업수', leafTasks.length],
    ['그룹 작업수', totalTasks - leafTasks.length],
    ['의존관계 수', dependencies.length],
    ['참여 회사수', companies.length],
    ['참여 인원수', members.length],
    ['전체 진척률(%)', overallProgress],
  ]

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
  wsSummary['!cols'] = [{ wch: 18 }, { wch: 30 }]
  applyHeaderStyle(wsSummary, summaryHeaders.length)

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  // ============================================================
  // 파일 다운로드
  // ============================================================
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const fileName = `${project.name}_${dateStr}.xlsx`

  XLSX.writeFile(wb, fileName)
}

// ============================================================
// Helper: 열 너비 자동 계산
// ============================================================
function calcColWidths(data: unknown[][]): XLSX.ColInfo[] {
  if (data.length === 0) return []
  const colCount = data[0].length
  const widths: number[] = new Array(colCount).fill(8) // 최소 너비

  for (const row of data) {
    for (let i = 0; i < colCount; i++) {
      const val = row[i]
      if (val == null) continue
      const str = String(val)
      // 한글은 2글자 폭으로 계산
      let len = 0
      for (const ch of str) {
        len += ch.charCodeAt(0) > 127 ? 2 : 1
      }
      widths[i] = Math.max(widths[i], Math.min(len + 2, 50))
    }
  }

  return widths.map((w) => ({ wch: w }))
}

// ============================================================
// Helper: 헤더 스타일 적용 (배경색, 볼드)
// xlsx 오픈소스 버전에서는 스타일 지원이 제한적이므로
// 가능한 범위 내에서 적용
// ============================================================
function applyHeaderStyle(ws: XLSX.WorkSheet, colCount: number): void {
  for (let c = 0; c < colCount; c++) {
    const cellRef = XLSX.utils.encode_cell({ c, r: 0 })
    if (!ws[cellRef]) continue
    ws[cellRef].s = {
      fill: { fgColor: { rgb: '4472C4' } },
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }
  }
}
