import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { Task } from '@/lib/types'

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function toDateOnlyISOString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function resolveStatusDate(statusDate?: string): string {
  return statusDate || toDateOnlyISOString(new Date())
}

export function computePlannedProgressAuto(task: Task, statusDate: string): number {
  if (!task.planned_start || !task.planned_end) return 0

  const start = parseISO(task.planned_start)
  const end = parseISO(task.planned_end)
  const ref = parseISO(statusDate)

  const totalDays = Math.max(1, differenceInCalendarDays(end, start))
  const elapsedDays = differenceInCalendarDays(ref, start)

  return clampProgress(elapsedDays / totalDays)
}

export function getEffectivePlannedProgress(task: Task, statusDate: string): number {
  if (task.planned_progress_override != null) {
    return clampProgress(task.planned_progress_override)
  }
  return computePlannedProgressAuto(task, statusDate)
}

export function getEffectiveActualProgress(task: Task): number {
  if (task.actual_progress_override != null) {
    return clampProgress(task.actual_progress_override)
  }
  return clampProgress(task.actual_progress ?? 0)
}

