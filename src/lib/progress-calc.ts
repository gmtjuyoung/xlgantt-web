import type { Task } from './types'
import type { Company, TeamMember, TaskAssignment } from './resource-types'
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, eachWeekOfInterval, startOfWeek, endOfWeek, getISOWeek, differenceInCalendarDays } from 'date-fns'

/**
 * Project-level progress metrics (mirrors Progress sheet).
 */
export interface ProjectMetrics {
  totalWorkload: number       // 총 작업량 (BAC)
  plannedWorkload: number     // 계획 작업량 (PV)
  actualWorkload: number      // 실적 작업량 - Earned Value (EV)
  actualCost: number          // 실제 투입 작업량 (AC)
  plannedRate: number         // 계획 진척률
  actualRate: number          // 실적 진척률
  rateGap: number             // 차이 (actual - planned)
  spi: number                 // Schedule Performance Index (EV/PV)
  cpi: number                 // Cost Performance Index (EV/AC)
  eac: number                 // Estimate At Completion (BAC/CPI)
  etc_value: number           // Estimate To Complete (EAC - AC)
  vac: number                 // Variance At Completion (BAC - EAC)
}

/**
 * Calculate planned workload up to a status date.
 * For each task: if statusDate >= planned_end, full workload; else proportion by elapsed days.
 */
function calcPlannedWorkloadByDate(leafTasks: Task[], statusDate: string | undefined): number {
  const refDate = statusDate ? new Date(statusDate) : new Date()
  return leafTasks.reduce((sum, t) => {
    const workload = t.total_workload || 0
    if (!t.planned_start || !t.planned_end || workload === 0) return sum
    const start = new Date(t.planned_start)
    const end = new Date(t.planned_end)
    if (refDate >= end) return sum + workload  // 기준일이 완료일 이후 → 전체
    if (refDate < start) return sum            // 기준일이 시작 전 → 0
    const totalDays = Math.max(1, differenceInCalendarDays(end, start))
    const elapsedDays = differenceInCalendarDays(refDate, start)
    return sum + workload * Math.min(1, Math.max(0, elapsedDays / totalDays))
  }, 0)
}

/**
 * Calculate project-level metrics from task data.
 */
export function calculateProjectMetrics(tasks: Task[], statusDate?: string): ProjectMetrics {
  const leafTasks = tasks.filter((t) => !t.is_group)

  const totalWorkload = leafTasks.reduce((sum, t) => sum + (t.total_workload || 0), 0) // BAC
  const plannedWorkload = calcPlannedWorkloadByDate(leafTasks, statusDate) // PV (기준일 기반)

  // Earned Value (EV) = sum(actual_progress * total_workload)
  const actualWorkload = leafTasks.reduce(
    (sum, t) => sum + (t.actual_progress * (t.total_workload || 0)),
    0
  )

  // Actual Cost (AC) = sum(actual_workload). Falls back to EV if no actual_workload data.
  const rawActualCost = leafTasks.reduce((sum, t) => sum + (t.actual_workload || 0), 0)
  const actualCost = rawActualCost > 0 ? rawActualCost : actualWorkload

  const plannedRate = totalWorkload > 0 ? plannedWorkload / totalWorkload : 0
  const actualRate = totalWorkload > 0 ? actualWorkload / totalWorkload : 0
  const rateGap = actualRate - plannedRate
  const spi = plannedWorkload > 0 ? actualWorkload / plannedWorkload : 0

  // Cost Performance Index (EV / AC)
  const cpi = actualCost > 0 ? actualWorkload / actualCost : 0
  // Estimate At Completion (BAC / CPI)
  const eac = cpi > 0 ? totalWorkload / cpi : 0
  // Estimate To Complete (EAC - AC)
  const etc_value = Math.max(0, eac - actualCost)
  // Variance At Completion (BAC - EAC)
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

/**
 * Monthly progress data for S-curve chart (mirrors AnalysisReport sheet).
 */
export interface MonthlyProgress {
  month: string          // "2025-07"
  monthLabel: string     // "7월"
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

/**
 * Generate monthly progress data for analysis report.
 */
export function generateMonthlyProgress(
  tasks: Task[],
  projectStart: string,
  projectEnd: string
): MonthlyProgress[] {
  const start = new Date(projectStart)
  const end = new Date(projectEnd)
  const months = eachMonthOfInterval({ start, end })
  const leafTasks = tasks.filter((t) => !t.is_group)
  const totalWorkload = leafTasks.reduce((sum, t) => sum + (t.total_workload || 0), 0)

  let cumulativePlanned = 0
  let cumulativeEV = 0
  let cumulativeActual = 0

  return months.map((month) => {
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)
    const monthStr = format(month, 'yyyy-MM')
    const monthLabel = format(month, 'M월')

    // Calculate planned workload for this month
    // Tasks whose planned period overlaps with this month
    let monthPlanned = 0
    let monthEV = 0
    let monthActual = 0

    for (const task of leafTasks) {
      if (!task.planned_start || !task.planned_end) continue

      const taskStart = new Date(task.planned_start)
      const taskEnd = new Date(task.planned_end)

      // Check overlap
      if (taskStart > monthEnd || taskEnd < monthStart) continue

      const overlapStart = taskStart > monthStart ? taskStart : monthStart
      const overlapEnd = taskEnd < monthEnd ? taskEnd : monthEnd
      const taskDuration = Math.max(
        1,
        (taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24)
      )
      const overlapDuration =
        (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24) + 1
      const ratio = overlapDuration / taskDuration

      const taskWorkload = task.total_workload || 0
      monthPlanned += taskWorkload * ratio

      // Earned value for this period
      monthEV += taskWorkload * task.actual_progress * ratio

      // Actual workload
      monthActual += (task.actual_workload || 0) * ratio
    }

    cumulativePlanned += monthPlanned
    cumulativeEV += monthEV
    cumulativeActual += monthActual

    return {
      month: monthStr,
      monthLabel,
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

// ============================================================
// 주별 진척률
// ============================================================

export interface WeeklyProgress {
  week: string          // "2025-W29"
  weekLabel: string     // "W29"
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
  projectEnd: string
): WeeklyProgress[] {
  const start = new Date(projectStart)
  const end = new Date(projectEnd)
  const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 })
  const leafTasks = tasks.filter((t) => !t.is_group)
  const totalWorkload = leafTasks.reduce((sum, t) => sum + (t.total_workload || 0), 0)

  let cumulativePlanned = 0
  let cumulativeEV = 0

  return weeks.map((weekStart) => {
    const wStart = startOfWeek(weekStart, { weekStartsOn: 1 })
    const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
    const weekNum = getISOWeek(weekStart)
    const weekStr = `${format(weekStart, 'yyyy')}-W${String(weekNum).padStart(2, '0')}`

    let weekPlanned = 0
    let weekEV = 0

    for (const task of leafTasks) {
      if (!task.planned_start || !task.planned_end) continue
      const taskStart = new Date(task.planned_start)
      const taskEnd = new Date(task.planned_end)
      if (taskStart > wEnd || taskEnd < wStart) continue

      const overlapStart = taskStart > wStart ? taskStart : wStart
      const overlapEnd = taskEnd < wEnd ? taskEnd : wEnd
      const taskDuration = Math.max(1, (taskEnd.getTime() - taskStart.getTime()) / 86400000)
      const overlapDuration = (overlapEnd.getTime() - overlapStart.getTime()) / 86400000 + 1
      const ratio = overlapDuration / taskDuration

      weekPlanned += (task.total_workload || 0) * ratio
      weekEV += (task.total_workload || 0) * task.actual_progress * ratio
    }

    cumulativePlanned += weekPlanned
    cumulativeEV += weekEV

    return {
      week: weekStr,
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

// ============================================================
// 담당자별 진척률
// ============================================================

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

  return members.map((member) => {
    const company = companies.find((c) => c.id === member.company_id)
    const memberAssigns = assignments.filter((a) => a.member_id === member.id)
    const assignedTaskIds = new Set(memberAssigns.map((a) => a.task_id))
    const assignedTasks = tasks.filter((t) => assignedTaskIds.has(t.id) && !t.is_group)

    const totalWorkload = assignedTasks.reduce((sum, t) => sum + (t.total_workload || 0), 0)
    const earnedValue = assignedTasks.reduce((sum, t) => sum + ((t.total_workload || 0) * t.actual_progress), 0)
    const completedCount = assignedTasks.filter((t) => t.actual_progress >= 1).length
    const delayedCount = assignedTasks.filter((t) => {
      if (!t.planned_end || t.actual_progress >= 1) return false
      return new Date(t.planned_end) < now && t.actual_progress < 1
    }).length

    return {
      memberId: member.id,
      memberName: member.name,
      companyId: member.company_id,
      companyName: company?.name || '',
      companyColor: company?.color || '#888',
      role: member.role || '',
      assignedTaskCount: assignedTasks.length,
      totalWorkload: Math.round(totalWorkload * 100) / 100,
      earnedValue: Math.round(earnedValue * 100) / 100,
      progressRate: totalWorkload > 0 ? earnedValue / totalWorkload : 0,
      completedCount,
      delayedCount,
    }
  }).filter((r) => r.assignedTaskCount > 0)
}

// ============================================================
// 회사별 진척률
// ============================================================

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
  companies: Company[]
): CompanyProgress[] {
  return companies.map((company) => {
    const companyMembers = members.filter((m) => m.company_id === company.id)
    const memberIds = new Set(companyMembers.map((m) => m.id))
    const companyAssigns = assignments.filter((a) => memberIds.has(a.member_id))
    const assignedTaskIds = new Set(companyAssigns.map((a) => a.task_id))
    const assignedTasks = tasks.filter((t) => assignedTaskIds.has(t.id) && !t.is_group)

    const totalWorkload = assignedTasks.reduce((sum, t) => sum + (t.total_workload || 0), 0)
    const earnedValue = assignedTasks.reduce((sum, t) => sum + ((t.total_workload || 0) * t.actual_progress), 0)
    const completedCount = assignedTasks.filter((t) => t.actual_progress >= 1).length

    return {
      companyId: company.id,
      companyName: company.name,
      companyColor: company.color,
      memberCount: companyMembers.length,
      assignedTaskCount: assignedTasks.length,
      totalWorkload: Math.round(totalWorkload * 100) / 100,
      earnedValue: Math.round(earnedValue * 100) / 100,
      progressRate: totalWorkload > 0 ? earnedValue / totalWorkload : 0,
      completedCount,
    }
  }).filter((c) => c.assignedTaskCount > 0)
}

// ============================================================
// WBS 그룹별 진척률
// ============================================================

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

export function calcProgressByWBSGroup(tasks: Task[]): WBSGroupProgress[] {
  const level1Groups = tasks.filter((t) => t.wbs_level === 1)

  return level1Groups.map((group) => {
    const children = tasks.filter((t) =>
      !t.is_group && t.wbs_code.startsWith(group.wbs_code + '.')
    )

    const totalWorkload = children.reduce((sum, t) => sum + (t.total_workload || 0), 0)
    const earnedValue = children.reduce((sum, t) => sum + ((t.total_workload || 0) * t.actual_progress), 0)
    const plannedWorkload = children.reduce((sum, t) => sum + (t.planned_workload || 0), 0)

    const progressRate = totalWorkload > 0 ? earnedValue / totalWorkload : 0
    const plannedRate = totalWorkload > 0 ? plannedWorkload / totalWorkload : 0

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
