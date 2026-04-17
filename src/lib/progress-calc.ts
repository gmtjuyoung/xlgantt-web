import type { Task } from './types'
import type { Company, TeamMember, TaskAssignment } from './resource-types'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  getISOWeek,
  differenceInCalendarDays,
} from 'date-fns'

const MS_PER_DAY = 1000 * 60 * 60 * 24

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function leafTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.is_group)
}

function toProgress01(percent: number | undefined): number {
  return clamp01((percent || 0) / 100)
}

function taskDurationDays(task: Task): number {
  if (!task.planned_start || !task.planned_end) return 1
  return Math.max(1, differenceInCalendarDays(new Date(task.planned_end), new Date(task.planned_start)) + 1)
}

function overlapRatio(task: Task, rangeStart: Date, rangeEnd: Date): number {
  if (!task.planned_start || !task.planned_end) return 0
  const taskStart = new Date(task.planned_start)
  const taskEnd = new Date(task.planned_end)
  if (taskStart > rangeEnd || taskEnd < rangeStart) return 0

  const overlapStart = taskStart > rangeStart ? taskStart : rangeStart
  const overlapEnd = taskEnd < rangeEnd ? taskEnd : rangeEnd
  const overlapDays = Math.max(1, (overlapEnd.getTime() - overlapStart.getTime()) / MS_PER_DAY + 1)
  return clamp01(overlapDays / taskDurationDays(task))
}

function buildAssignmentsByTask(assignments: TaskAssignment[]): Map<string, TaskAssignment[]> {
  const map = new Map<string, TaskAssignment[]>()
  for (const a of assignments) {
    if (!map.has(a.task_id)) map.set(a.task_id, [])
    map.get(a.task_id)!.push(a)
  }
  return map
}

function buildTaskProgressMap(tasks: Task[], assignments: TaskAssignment[] = []) {
  const map = new Map<string, number>()
  const meaningfulMap = new Map<string, boolean>()
  const assignmentMap = buildAssignmentsByTask(assignments)

  for (const t of leafTasks(tasks)) {
    const taskAssigns = assignmentMap.get(t.id) || []
    const hasMeaningful = taskAssigns.some((a) => (a.progress_percent || 0) > 0)
    meaningfulMap.set(t.id, hasMeaningful)

    if (!hasMeaningful || taskAssigns.length === 0) {
      map.set(t.id, clamp01(t.actual_progress || 0))
      continue
    }

    const totalAllocation = taskAssigns.reduce((sum, a) => sum + Math.max(0, a.allocation_percent || 0), 0)
    const totalWeight = totalAllocation > 0 ? totalAllocation : taskAssigns.length
    if (totalWeight <= 0) {
      map.set(t.id, clamp01(t.actual_progress || 0))
      continue
    }
    const weighted = taskAssigns.reduce((sum, a) => {
      const weight = totalAllocation > 0 ? Math.max(0, a.allocation_percent || 0) : 1
      return sum + toProgress01(a.progress_percent) * weight
    }, 0) / totalWeight
    map.set(t.id, clamp01(weighted))
  }

  return { taskProgressMap: map, taskHasMeaningfulAssignmentProgress: meaningfulMap, assignmentsByTask: assignmentMap }
}

function calcTaskPlannedRateByDate(task: Task, refDate: Date): number {
  if (!task.planned_start || !task.planned_end) return clamp01(task.planned_progress || 0)
  const start = new Date(task.planned_start)
  const end = new Date(task.planned_end)
  if (refDate < start) return 0
  if (refDate >= end) return 1
  const totalDays = Math.max(1, differenceInCalendarDays(end, start) + 1)
  const elapsedDays = Math.max(0, differenceInCalendarDays(refDate, start) + 1)
  return clamp01(elapsedDays / totalDays)
}

/**
 * Project-level progress metrics (mirrors Progress sheet).
 */
export interface ProjectMetrics {
  totalWorkload: number
  plannedWorkload: number
  actualWorkload: number
  actualCost: number
  plannedRate: number
  actualRate: number
  rateGap: number
  spi: number
  cpi: number
  eac: number
  etc_value: number
  vac: number
}

function calcPlannedWorkloadByDate(tasks: Task[], statusDate?: string): number {
  const refDate = statusDate ? new Date(statusDate) : new Date()
  return leafTasks(tasks).reduce((sum, t) => {
    const workload = t.total_workload || 0
    return sum + workload * calcTaskPlannedRateByDate(t, refDate)
  }, 0)
}

export function calculateProjectMetrics(tasks: Task[], statusDate?: string, assignments: TaskAssignment[] = []): ProjectMetrics {
  const leaves = leafTasks(tasks)
  const totalWorkload = leaves.reduce((sum, t) => sum + (t.total_workload || 0), 0)
  const plannedWorkload = calcPlannedWorkloadByDate(leaves, statusDate)

  const { taskProgressMap } = buildTaskProgressMap(leaves, assignments)
  const actualWorkload = leaves.reduce((sum, t) => sum + (t.total_workload || 0) * (taskProgressMap.get(t.id) ?? 0), 0)

  const rawActualCost = leaves.reduce((sum, t) => sum + (t.actual_workload || 0), 0)
  const actualCost = rawActualCost > 0 ? rawActualCost : actualWorkload

  const plannedRate = totalWorkload > 0 ? plannedWorkload / totalWorkload : 0
  const actualRate = totalWorkload > 0 ? actualWorkload / totalWorkload : 0
  const rateGap = actualRate - plannedRate
  const spi = plannedWorkload > 0 ? actualWorkload / plannedWorkload : 0
  const cpi = actualCost > 0 ? actualWorkload / actualCost : 0
  const eac = cpi > 0 ? totalWorkload / cpi : 0
  const etc_value = Math.max(0, eac - actualCost)
  const vac = totalWorkload - eac

  return {
    totalWorkload,
    plannedWorkload,
    actualWorkload,
    actualCost,
    plannedRate,
    actualRate,
    rateGap,
    spi,
    cpi,
    eac,
    etc_value,
    vac,
  }
}

export interface MonthlyProgress {
  month: string
  monthLabel: string
  startDate: string
  endDate: string
  plannedWorkload: number
  cumulativePlanned: number
  plannedRate: number
  earnedValue: number
  cumulativeEV: number
  evRate: number
  actualWorkload: number
  cumulativeActual: number
  actualRate: number
}

export function generateMonthlyProgress(
  tasks: Task[],
  projectStart: string,
  projectEnd: string,
  assignments: TaskAssignment[] = []
): MonthlyProgress[] {
  const leaves = leafTasks(tasks)
  const totalWorkload = leaves.reduce((sum, t) => sum + (t.total_workload || 0), 0)
  const months = eachMonthOfInterval({ start: new Date(projectStart), end: new Date(projectEnd) })
  const { taskProgressMap } = buildTaskProgressMap(leaves, assignments)

  let cumulativePlanned = 0
  let cumulativeEV = 0
  let cumulativeActual = 0

  return months.map((month) => {
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)
    let monthPlanned = 0
    let monthEV = 0
    let monthActual = 0

    for (const task of leaves) {
      const ratio = overlapRatio(task, monthStart, monthEnd)
      if (ratio <= 0) continue
      const workload = task.total_workload || 0
      const progress = taskProgressMap.get(task.id) ?? 0

      monthPlanned += workload * ratio
      monthEV += workload * progress * ratio

      const taskActual = (task.actual_workload || 0) > 0 ? (task.actual_workload || 0) * ratio : workload * progress * ratio
      monthActual += taskActual
    }

    cumulativePlanned += monthPlanned
    cumulativeEV += monthEV
    cumulativeActual += monthActual

    return {
      month: format(month, 'yyyy-MM'),
      monthLabel: format(month, 'M월'),
      startDate: format(monthStart, 'yyyy-MM-dd'),
      endDate: format(monthEnd, 'yyyy-MM-dd'),
      plannedWorkload: Math.round(monthPlanned * 100) / 100,
      cumulativePlanned: Math.round(cumulativePlanned * 100) / 100,
      plannedRate: totalWorkload > 0 ? cumulativePlanned / totalWorkload : 0,
      earnedValue: Math.round(monthEV * 100) / 100,
      cumulativeEV: Math.round(cumulativeEV * 100) / 100,
      evRate: totalWorkload > 0 ? cumulativeEV / totalWorkload : 0,
      actualWorkload: Math.round(monthActual * 100) / 100,
      cumulativeActual: Math.round(cumulativeActual * 100) / 100,
      actualRate: totalWorkload > 0 ? cumulativeActual / totalWorkload : 0,
    }
  })
}

export interface WeeklyProgress {
  week: string
  weekLabel: string
  weekNumber: number
  startDate: string
  endDate: string
  plannedWorkload: number
  cumulativePlanned: number
  plannedRate: number
  earnedValue: number
  cumulativeEV: number
  evRate: number
}

export function generateWeeklyProgress(
  tasks: Task[],
  projectStart: string,
  projectEnd: string,
  assignments: TaskAssignment[] = []
): WeeklyProgress[] {
  const leaves = leafTasks(tasks)
  const totalWorkload = leaves.reduce((sum, t) => sum + (t.total_workload || 0), 0)
  const weeks = eachWeekOfInterval({ start: new Date(projectStart), end: new Date(projectEnd) }, { weekStartsOn: 1 })
  const { taskProgressMap } = buildTaskProgressMap(leaves, assignments)

  let cumulativePlanned = 0
  let cumulativeEV = 0

  return weeks.map((weekStart) => {
    const wStart = startOfWeek(weekStart, { weekStartsOn: 1 })
    const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
    const weekNum = getISOWeek(weekStart)

    let weekPlanned = 0
    let weekEV = 0

    for (const task of leaves) {
      const ratio = overlapRatio(task, wStart, wEnd)
      if (ratio <= 0) continue
      const workload = task.total_workload || 0
      weekPlanned += workload * ratio
      weekEV += workload * (taskProgressMap.get(task.id) ?? 0) * ratio
    }

    cumulativePlanned += weekPlanned
    cumulativeEV += weekEV

    return {
      week: `${format(weekStart, 'yyyy')}-W${String(weekNum).padStart(2, '0')}`,
      weekLabel: `W${weekNum}`,
      weekNumber: weekNum,
      startDate: format(wStart, 'yyyy-MM-dd'),
      endDate: format(wEnd, 'yyyy-MM-dd'),
      plannedWorkload: Math.round(weekPlanned * 100) / 100,
      cumulativePlanned: Math.round(cumulativePlanned * 100) / 100,
      plannedRate: totalWorkload > 0 ? cumulativePlanned / totalWorkload : 0,
      earnedValue: Math.round(weekEV * 100) / 100,
      cumulativeEV: Math.round(cumulativeEV * 100) / 100,
      evRate: totalWorkload > 0 ? cumulativeEV / totalWorkload : 0,
    }
  })
}

export interface DailyProgress {
  date: string
  dateLabel: string
  plannedWorkload: number
  cumulativePlanned: number
  plannedRate: number
  earnedValue: number
  cumulativeEV: number
  evRate: number
}

export function generateDailyProgress(
  tasks: Task[],
  projectStart: string,
  projectEnd: string,
  assignments: TaskAssignment[] = []
): DailyProgress[] {
  const leaves = leafTasks(tasks)
  const totalWorkload = leaves.reduce((sum, t) => sum + (t.total_workload || 0), 0)
  const days = eachDayOfInterval({ start: new Date(projectStart), end: new Date(projectEnd) })
  const { taskProgressMap } = buildTaskProgressMap(leaves, assignments)

  let cumulativePlanned = 0
  let cumulativeEV = 0

  return days.map((day) => {
    let dayPlanned = 0
    let dayEV = 0
    for (const task of leaves) {
      const ratio = overlapRatio(task, day, day)
      if (ratio <= 0) continue
      const workload = task.total_workload || 0
      dayPlanned += workload * ratio
      dayEV += workload * (taskProgressMap.get(task.id) ?? 0) * ratio
    }

    cumulativePlanned += dayPlanned
    cumulativeEV += dayEV

    return {
      date: format(day, 'yyyy-MM-dd'),
      dateLabel: format(day, 'MM/dd'),
      plannedWorkload: Math.round(dayPlanned * 100) / 100,
      cumulativePlanned: Math.round(cumulativePlanned * 100) / 100,
      plannedRate: totalWorkload > 0 ? cumulativePlanned / totalWorkload : 0,
      earnedValue: Math.round(dayEV * 100) / 100,
      cumulativeEV: Math.round(cumulativeEV * 100) / 100,
      evRate: totalWorkload > 0 ? cumulativeEV / totalWorkload : 0,
    }
  })
}

export interface ResourceProgress {
  memberId: string
  memberName: string
  companyId: string
  companyName: string
  companyColor: string
  role: string
  assignedTaskCount: number
  totalWorkload: number
  earnedValue: number
  progressRate: number
  completedCount: number
  delayedCount: number
}

export function calcProgressByResource(
  tasks: Task[],
  assignments: TaskAssignment[],
  members: TeamMember[],
  companies: Company[],
  statusDate?: string
): ResourceProgress[] {
  const now = statusDate ? new Date(statusDate) : new Date()
  const leaves = leafTasks(tasks)
  const taskMap = new Map(leaves.map((t) => [t.id, t]))
  const { taskProgressMap, taskHasMeaningfulAssignmentProgress } = buildTaskProgressMap(leaves, assignments)

  return members.map((member) => {
    const company = companies.find((c) => c.id === member.company_id)
    const memberAssigns = assignments.filter((a) => a.member_id === member.id)
    const assignedTaskIds = new Set<string>()
    let totalWorkload = 0
    let earnedValue = 0
    let completedCount = 0
    let delayedCount = 0

    for (const assign of memberAssigns) {
      const task = taskMap.get(assign.task_id)
      if (!task) continue
      assignedTaskIds.add(task.id)

      const allocation = Math.max(0, assign.allocation_percent || 0) / 100
      const allocatedWorkload = (task.total_workload || 0) * allocation
      const hasMeaningful = taskHasMeaningfulAssignmentProgress.get(task.id) || false
      const memberProgress = hasMeaningful ? toProgress01(assign.progress_percent) : (taskProgressMap.get(task.id) ?? 0)

      totalWorkload += allocatedWorkload
      earnedValue += allocatedWorkload * memberProgress

      if (memberProgress >= 1) completedCount += 1
      if (task.planned_end && memberProgress < 1 && new Date(task.planned_end) < now) delayedCount += 1
    }

    const assignedTaskCount = assignedTaskIds.size
    return {
      memberId: member.id,
      memberName: member.name,
      companyId: member.company_id,
      companyName: company?.name || '',
      companyColor: company?.color || '#888',
      role: member.role || '',
      assignedTaskCount,
      totalWorkload: Math.round(totalWorkload * 100) / 100,
      earnedValue: Math.round(earnedValue * 100) / 100,
      progressRate: totalWorkload > 0 ? clamp01(earnedValue / totalWorkload) : 0,
      completedCount,
      delayedCount,
    }
  }).filter((r) => r.assignedTaskCount > 0)
}

export interface CompanyProgress {
  companyId: string
  companyName: string
  companyColor: string
  memberCount: number
  assignedTaskCount: number
  totalWorkload: number
  earnedValue: number
  progressRate: number
  completedCount: number
}

export function calcProgressByCompany(
  tasks: Task[],
  assignments: TaskAssignment[],
  members: TeamMember[],
  companies: Company[],
  statusDate?: string
): CompanyProgress[] {
  const resourceData = calcProgressByResource(tasks, assignments, members, companies, statusDate)
  const byCompany = new Map<string, CompanyProgress>()

  for (const c of companies) {
    const memberCount = members.filter((m) => m.company_id === c.id).length
    byCompany.set(c.id, {
      companyId: c.id,
      companyName: c.name,
      companyColor: c.color,
      memberCount,
      assignedTaskCount: 0,
      totalWorkload: 0,
      earnedValue: 0,
      progressRate: 0,
      completedCount: 0,
    })
  }

  for (const r of resourceData) {
    const item = byCompany.get(r.companyId)
    if (!item) continue
    item.assignedTaskCount += r.assignedTaskCount
    item.totalWorkload += r.totalWorkload
    item.earnedValue += r.earnedValue
    item.completedCount += r.completedCount
  }

  return [...byCompany.values()]
    .map((c) => ({
      ...c,
      totalWorkload: Math.round(c.totalWorkload * 100) / 100,
      earnedValue: Math.round(c.earnedValue * 100) / 100,
      progressRate: c.totalWorkload > 0 ? clamp01(c.earnedValue / c.totalWorkload) : 0,
    }))
    .filter((c) => c.assignedTaskCount > 0)
}

export interface WBSGroupProgress {
  wbsCode: string
  groupName: string
  childCount: number
  totalWorkload: number
  earnedValue: number
  progressRate: number
  plannedRate: number
  gap: number
}

export function calcProgressByWBSGroup(tasks: Task[], statusDate?: string): WBSGroupProgress[] {
  const leaves = leafTasks(tasks)
  const refDate = statusDate ? new Date(statusDate) : new Date()
  const level1Groups = tasks.filter((t) => t.wbs_level === 1)

  return level1Groups.map((group) => {
    const children = leaves.filter((t) => t.wbs_code.startsWith(group.wbs_code + '.'))
    const totalWorkload = children.reduce((sum, t) => sum + (t.total_workload || 0), 0)
    const earnedValue = children.reduce((sum, t) => sum + (t.total_workload || 0) * clamp01(t.actual_progress || 0), 0)
    const plannedValue = children.reduce((sum, t) => sum + (t.total_workload || 0) * calcTaskPlannedRateByDate(t, refDate), 0)

    const progressRate = totalWorkload > 0 ? earnedValue / totalWorkload : 0
    const plannedRate = totalWorkload > 0 ? plannedValue / totalWorkload : 0

    return {
      wbsCode: group.wbs_code,
      groupName: group.task_name,
      childCount: children.length,
      totalWorkload: Math.round(totalWorkload * 100) / 100,
      earnedValue: Math.round(earnedValue * 100) / 100,
      progressRate,
      plannedRate,
      gap: progressRate - plannedRate,
    }
  })
}

export interface TaskProgress {
  taskId: string
  wbsCode: string
  taskName: string
  startDate?: string
  endDate?: string
  totalWorkload: number
  plannedRate: number
  progressRate: number
  earnedValue: number
  gap: number
  isDelayed: boolean
}

export function calcProgressByTask(tasks: Task[], statusDate?: string, assignments: TaskAssignment[] = []): TaskProgress[] {
  const leaves = leafTasks(tasks)
  const refDate = statusDate ? new Date(statusDate) : new Date()
  const { taskProgressMap } = buildTaskProgressMap(leaves, assignments)

  return leaves
    .map((task) => {
      const workload = task.total_workload || 0
      const plannedRate = calcTaskPlannedRateByDate(task, refDate)
      const progressRate = taskProgressMap.get(task.id) ?? clamp01(task.actual_progress || 0)
      const gap = progressRate - plannedRate
      const isDelayed = !!task.planned_end && new Date(task.planned_end) < refDate && progressRate < 1
      return {
        taskId: task.id,
        wbsCode: task.wbs_code,
        taskName: task.task_name,
        startDate: task.planned_start,
        endDate: task.planned_end,
        totalWorkload: workload,
        plannedRate,
        progressRate,
        earnedValue: workload * progressRate,
        gap,
        isDelayed,
      }
    })
    .sort((a, b) => a.wbsCode.localeCompare(b.wbsCode, undefined, { numeric: true }))
}
