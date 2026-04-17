import {
  differenceInCalendarDays,
  addDays,
  startOfDay,
  startOfWeek,
  endOfMonth,
  eachWeekOfInterval,
  eachMonthOfInterval,
  eachDayOfInterval,
  format,
  getISOWeek,
  isWeekend,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import type { GanttScale, BarRect, Task, ZoomLevel } from './types'
import { ZOOM_CONFIG, ROW_HEIGHT } from './types'

/**
 * Create a GanttScale from project dates and zoom level.
 */
export function createGanttScale(
  projectStart: Date,
  projectEnd: Date,
  zoomLevel: ZoomLevel,
  paddingDays?: number
): GanttScale {
  // paddingDays === 0 이면 입력 날짜를 exact하게 사용 (커스텀 기간 필터용)
  // undefined/양수면 줌 레벨에 따라 넉넉하게 패딩
  const isExact = paddingDays === 0
  const pad = isExact ? 0 : (paddingDays ?? (zoomLevel === 3 ? 45 : zoomLevel === 2 ? 21 : 14))
  const startDate = isExact
    ? startOfDay(projectStart)
    : addDays(startOfWeek(projectStart, { weekStartsOn: 1 }), -pad)
  const endDate = isExact
    ? startOfDay(projectEnd)
    : addDays(projectEnd, pad + 14)
  const { pixelsPerDay } = ZOOM_CONFIG[zoomLevel]
  const totalDays = differenceInCalendarDays(endDate, startDate)
  // 우측 여백: 작업명 표시 공간 확보 (최소 200px). 커스텀 기간일 때는 최소화
  const totalWidth = totalDays * pixelsPerDay + (isExact ? 40 : 200)

  return { startDate, endDate, pixelsPerDay, totalWidth }
}

/**
 * Convert a date to x pixel position.
 */
export function dateToX(date: Date, scale: GanttScale): number {
  const days = differenceInCalendarDays(startOfDay(date), startOfDay(scale.startDate))
  return days * scale.pixelsPerDay
}

/**
 * Convert x pixel position to date.
 */
export function xToDate(x: number, scale: GanttScale): Date {
  const days = Math.round(x / scale.pixelsPerDay)
  return addDays(scale.startDate, days)
}

/**
 * Calculate bar rectangle for a task.
 */
export function taskToBarRect(
  task: Task,
  scale: GanttScale,
  rowIndex: number,
  rowHeight: number = 40
): BarRect | null {
  if (!task.planned_start || !task.planned_end) return null

  const start = new Date(task.planned_start)
  const end = new Date(task.planned_end)

  const rawX = dateToX(start, scale)
  const rawEndX = dateToX(addDays(end, 1), scale) // +1 because end date is inclusive
  // scale 밖으로 나가는 부분 클리핑 (커스텀 기간 필터 사용 시 시각적으로 잘림)
  const scaleMaxX = scale.totalWidth
  const x = Math.max(0, rawX)
  const endX = Math.min(scaleMaxX, rawEndX)
  // 완전히 scale 밖이면 null (visibleTasks 필터로 거의 안 옴)
  if (endX <= 0 || rawX >= scaleMaxX) return null
  const width = Math.max(endX - x, task.is_milestone ? 16 : 4)

  return {
    x,
    width,
    y: rowIndex * rowHeight + 4,
    height: rowHeight - 8,
  }
}

/**
 * Calculate actual bar rectangle (overlaid on planned bar).
 */
export function taskToActualBarRect(
  task: Task,
  scale: GanttScale,
  rowIndex: number,
  rowHeight: number = 40
): BarRect | null {
  if (!task.actual_start) return null

  const start = new Date(task.actual_start)
  const end = task.actual_end ? new Date(task.actual_end) : new Date()

  const rawX = dateToX(start, scale)
  const rawEndX = dateToX(addDays(end, 1), scale)
  // scale 밖 클리핑
  const scaleMaxX = scale.totalWidth
  const x = Math.max(0, rawX)
  const endX = Math.min(scaleMaxX, rawEndX)
  if (endX <= 0 || rawX >= scaleMaxX) return null
  const width = Math.max(endX - x, 4)

  return {
    x,
    width,
    y: rowIndex * rowHeight + 4,
    height: rowHeight - 8,
  }
}

/**
 * Generate timescale header data based on zoom level.
 */
export interface TimescaleItem {
  label: string
  x: number
  width: number
  isWeekend?: boolean
}

export interface TimescaleRow {
  items: TimescaleItem[]
  height: number
}

export function generateTimescale(
  scale: GanttScale,
  zoomLevel: ZoomLevel
): [TimescaleRow, TimescaleRow] {
  const { startDate, endDate, pixelsPerDay } = scale

  if (zoomLevel === 1) {
    // Day view: top = months, bottom = days
    const months = eachMonthOfInterval({ start: startDate, end: endDate })
    const days = eachDayOfInterval({ start: startDate, end: endDate })

    const topItems: TimescaleItem[] = months.map((month) => {
      const monthEnd = endOfMonth(month)
      const x = dateToX(month < startDate ? startDate : month, scale)
      const endX = dateToX(monthEnd > endDate ? endDate : addDays(monthEnd, 1), scale)
      return {
        label: format(month, 'yyyy년 M월', { locale: ko }),
        x,
        width: endX - x,
      }
    })

    const bottomItems: TimescaleItem[] = days.map((day) => ({
      label: format(day, 'd'),
      x: dateToX(day, scale),
      width: pixelsPerDay,
      isWeekend: isWeekend(day),
    }))

    return [
      { items: topItems, height: 24 },
      { items: bottomItems, height: 24 },
    ]
  }

  if (zoomLevel === 2) {
    // Week view: top = months, bottom = weeks
    const months = eachMonthOfInterval({ start: startDate, end: endDate })
    const weeks = eachWeekOfInterval({ start: startDate, end: endDate }, { weekStartsOn: 1 })

    const topItems: TimescaleItem[] = months.map((month) => {
      const monthEnd = endOfMonth(month)
      const x = dateToX(month < startDate ? startDate : month, scale)
      const endX = dateToX(monthEnd > endDate ? endDate : addDays(monthEnd, 1), scale)
      return {
        label: format(month, 'yyyy년 M월', { locale: ko }),
        x,
        width: endX - x,
      }
    })

    const bottomItems: TimescaleItem[] = weeks.map((week) => {
      const weekNum = getISOWeek(week)
      const weekX = dateToX(week, scale)
      return {
        label: `W${weekNum}`,
        x: weekX,
        width: pixelsPerDay * 7,
      }
    })

    return [
      { items: topItems, height: 24 },
      { items: bottomItems, height: 24 },
    ]
  }

  // Month view: top = years, bottom = months
  const months = eachMonthOfInterval({ start: startDate, end: endDate })
  const years = [...new Set(months.map((m) => m.getFullYear()))]

  const topItems: TimescaleItem[] = years.map((year) => {
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31)
    const x = dateToX(yearStart < startDate ? startDate : yearStart, scale)
    const endX = dateToX(yearEnd > endDate ? endDate : addDays(yearEnd, 1), scale)
    return {
      label: String(year),
      x,
      width: endX - x,
    }
  })

  const bottomItems: TimescaleItem[] = months.map((month) => {
    const monthEnd = endOfMonth(month)
    return {
      label: format(month, 'M월', { locale: ko }),
      x: dateToX(month, scale),
      width: dateToX(addDays(monthEnd, 1), scale) - dateToX(month, scale),
    }
  })

  return [
    { items: topItems, height: 24 },
    { items: bottomItems, height: 24 },
  ]
}

/**
 * Get the x position of "today" line.
 */
export function getTodayX(scale: GanttScale): number {
  return dateToX(new Date(), scale)
}

/**
 * Generate weekend/holiday background bands.
 */
export interface NonWorkingBand {
  x: number
  width: number
}

export function generateNonWorkingBands(
  scale: GanttScale,
  holidays: Set<string> // ISO date strings
): NonWorkingBand[] {
  const bands: NonWorkingBand[] = []
  const days = eachDayOfInterval({ start: scale.startDate, end: scale.endDate })

  let bandStart: number | null = null

  for (const day of days) {
    const isNonWorking = isWeekend(day) || holidays.has(format(day, 'yyyy-MM-dd'))
    const x = dateToX(day, scale)

    if (isNonWorking) {
      if (bandStart === null) bandStart = x
    } else {
      if (bandStart !== null) {
        bands.push({ x: bandStart, width: x - bandStart })
        bandStart = null
      }
    }
  }

  if (bandStart !== null) {
    bands.push({
      x: bandStart,
      width: dateToX(scale.endDate, scale) - bandStart,
    })
  }

  return bands
}

/**
 * Progress Line point for a single task row.
 */
export interface ProgressLinePoint {
  x: number
  y: number
}

/**
 * Calculate Progress Line (S-curve) points.
 *
 * For each visible leaf task, compute where the progress line should pass
 * through that row based on how far the task has progressed relative to
 * the status date.
 *
 * - 100% progress  -> x = statusDateX (on the vertical reference line)
 * - 0% progress    -> x = planned_start (or statusDateX if no dates)
 * - partial        -> interpolate between planned_start and the point
 *                     where planned progress should reach statusDate
 *
 * The line bends LEFT of the status date when a task is behind schedule,
 * and RIGHT when it is ahead.
 */
export function calcProgressLinePoints(
  tasks: Task[],
  scale: GanttScale,
  statusDate: Date,
  rowHeight: number = ROW_HEIGHT
): ProgressLinePoint[] {
  const statusDateX = dateToX(statusDate, scale)
  const points: ProgressLinePoint[] = []

  tasks.forEach((task, index) => {
    // Skip group tasks — only leaf tasks
    if (task.is_group) return

    // Skip tasks without planned dates
    if (!task.planned_start || !task.planned_end) return

    const y = index * rowHeight + rowHeight / 2 // row center

    const progress = task.actual_progress // 0..1

    if (progress >= 1) {
      // Fully complete — point sits on the status date line
      points.push({ x: statusDateX, y })
      return
    }

    const plannedStart = new Date(task.planned_start)
    const plannedEnd = new Date(task.planned_end)

    const startX = dateToX(plannedStart, scale)
    const endX = dateToX(addDays(plannedEnd, 1), scale) // inclusive end
    const taskWidth = endX - startX

    if (taskWidth <= 0) {
      points.push({ x: statusDateX, y })
      return
    }

    // The x position representing actual progress within the task bar
    const progressX = startX + taskWidth * progress

    points.push({ x: progressX, y })
  })

  return points
}

/**
 * Get the x position for a status date line.
 */
export function getStatusDateX(statusDate: Date | string | undefined, scale: GanttScale): number {
  if (!statusDate) return dateToX(new Date(), scale)
  const d = typeof statusDate === 'string' ? new Date(statusDate) : statusDate
  return dateToX(d, scale)
}
