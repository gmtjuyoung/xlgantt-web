import type { Task } from './types'

/**
 * Generate the next WBS code for a child under the given parent code.
 * e.g., parentCode="1.2", childIndex=3 => "1.2.3"
 */
export function generateWBSCode(parentCode: string, childIndex: number): string {
  if (!parentCode) return String(childIndex)
  return `${parentCode}.${childIndex}`
}

/**
 * Get WBS level from code string.
 * e.g., "1" => 1, "1.2" => 2, "1.2.3" => 3
 */
export function getWBSLevel(code: string): number {
  if (!code) return 0
  return code.split('.').length
}

/**
 * Get parent WBS code.
 * e.g., "1.2.3" => "1.2", "1" => ""
 */
export function getParentWBSCode(code: string): string {
  const parts = code.split('.')
  parts.pop()
  return parts.join('.')
}

/**
 * Check if childCode is a descendant of parentCode.
 */
export function isDescendant(parentCode: string, childCode: string): boolean {
  return childCode.startsWith(parentCode + '.')
}

/**
 * Get all visible tasks respecting collapsed state.
 * If a group task is collapsed, its descendants are hidden.
 */
export function getVisibleTasks(tasks: Task[]): Task[] {
  const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
  const collapsedCodes = new Set<string>()

  return sorted.filter((task) => {
    // Check if any ancestor is collapsed
    const isHidden = Array.from(collapsedCodes).some((code) =>
      isDescendant(code, task.wbs_code)
    )
    if (isHidden) return false

    // If this task is collapsed, add to collapsed set
    if (task.is_group && task.is_collapsed) {
      collapsedCodes.add(task.wbs_code)
    }

    return true
  })
}

/**
 * Get direct children of a task.
 */
export function getDirectChildren(tasks: Task[], parentId: string): Task[] {
  return tasks.filter((t) => t.parent_id === parentId)
}

/**
 * Get all descendants of a task (including nested children).
 */
export function getAllDescendants(tasks: Task[], parentWbsCode: string): Task[] {
  return tasks.filter((t) => isDescendant(parentWbsCode, t.wbs_code))
}

/**
 * Indent a task: increase its level by 1, making it a child of the previous sibling.
 */
export function indentTask(tasks: Task[], taskId: string): Task[] {
  const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
  const index = sorted.findIndex((t) => t.id === taskId)
  if (index <= 0) return tasks // Can't indent the first task

  const task = sorted[index]
  const prevTask = sorted[index - 1]

  // The previous task becomes the parent
  if (task.wbs_level >= 10) return tasks // Max 10 levels

  const newLevel = task.wbs_level + 1
  const childCount = getDirectChildren(sorted, prevTask.id).length

  return sorted.map((t) => {
    if (t.id === taskId) {
      return {
        ...t,
        wbs_level: newLevel,
        parent_id: prevTask.id,
        wbs_code: generateWBSCode(prevTask.wbs_code, childCount + 1),
      }
    }
    return t
  })
}

/**
 * Outdent a task: decrease its level by 1.
 */
export function outdentTask(tasks: Task[], taskId: string): Task[] {
  const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
  const task = sorted.find((t) => t.id === taskId)
  if (!task || task.wbs_level <= 1) return tasks // Can't outdent level 1

  const parentCode = getParentWBSCode(task.wbs_code)
  const grandParentCode = getParentWBSCode(parentCode)
  const newLevel = task.wbs_level - 1

  return sorted.map((t) => {
    if (t.id === taskId) {
      const grandParent = sorted.find((p) => p.wbs_code === grandParentCode)
      return {
        ...t,
        wbs_level: newLevel,
        parent_id: grandParent?.id || undefined,
        wbs_code: grandParentCode
          ? `${grandParentCode}.${newLevel}`
          : String(newLevel),
      }
    }
    return t
  })
}

/**
 * Recalculate all WBS codes based on hierarchy and sort order.
 * Uses a two-pass approach: first assign codes to tasks with already-computed parent codes.
 */
export function recalculateWBSCodes(tasks: Task[]): Task[] {
  const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
  const codeMap = new Map<string, string>() // taskId -> new wbs_code
  const counters: Record<string, number> = {}

  for (const task of sorted) {
    const parentCode = task.parent_id
      ? (codeMap.get(task.parent_id) || '')
      : ''

    const key = parentCode || 'root'
    counters[key] = (counters[key] || 0) + 1

    const newCode = parentCode
      ? `${parentCode}.${counters[key]}`
      : String(counters[key])

    codeMap.set(task.id, newCode)
  }

  return sorted.map((task) => {
    const newCode = codeMap.get(task.id) || task.wbs_code
    return {
      ...task,
      wbs_code: newCode,
      wbs_level: getWBSLevel(newCode),
    }
  })
}

/**
 * Create a new task with default values.
 */
export function createDefaultTask(
  projectId: string,
  sortOrder: number,
  wbsCode: string,
  level: number,
  parentId?: string
): Omit<Task, 'id' | 'created_at' | 'updated_at'> {
  return {
    project_id: projectId,
    sort_order: sortOrder,
    wbs_code: wbsCode,
    wbs_level: level,
    is_group: false,
    task_name: '',
    calendar_type: 'STD',
    planned_progress: 0,
    actual_progress: 0,
    is_milestone: false,
    parent_id: parentId,
    is_collapsed: false,
  }
}
