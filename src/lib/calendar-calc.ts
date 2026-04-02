import { addDays, format, getDay } from 'date-fns'

/**
 * Check if a date is a working day given work days and holidays.
 */
export function isWorkingDay(
  date: Date,
  workDays: number[], // 0=Sun, 1=Mon, ..., 6=Sat
  holidays: Set<string> // ISO date strings "yyyy-MM-dd"
): boolean {
  const dayOfWeek = getDay(date) // 0=Sunday
  const dateStr = format(date, 'yyyy-MM-dd')

  // Check if it's a holiday
  if (holidays.has(dateStr)) return false

  // Check if the day of week is a working day
  return workDays.includes(dayOfWeek)
}

/**
 * Calculate working days between two dates (inclusive).
 */
export function countWorkingDays(
  startDate: Date,
  endDate: Date,
  workDays: number[] = [1, 2, 3, 4, 5],
  holidays: Set<string> = new Set()
): number {
  let count = 0
  let current = new Date(startDate)

  while (current <= endDate) {
    if (isWorkingDay(current, workDays, holidays)) {
      count++
    }
    current = addDays(current, 1)
  }

  return count
}

/**
 * Add N working days to a date.
 */
export function addWorkingDays(
  startDate: Date,
  days: number,
  workDays: number[] = [1, 2, 3, 4, 5],
  holidays: Set<string> = new Set()
): Date {
  let current = new Date(startDate)
  let remaining = days

  while (remaining > 0) {
    current = addDays(current, 1)
    if (isWorkingDay(current, workDays, holidays)) {
      remaining--
    }
  }

  return current
}

/**
 * Snap a date to the nearest working day.
 * If the date itself is a working day, return it.
 * Otherwise, move forward to the next working day.
 */
export function snapToWorkingDay(
  date: Date,
  workDays: number[] = [1, 2, 3, 4, 5],
  holidays: Set<string> = new Set()
): Date {
  let current = new Date(date)
  let maxIterations = 10

  while (!isWorkingDay(current, workDays, holidays) && maxIterations > 0) {
    current = addDays(current, 1)
    maxIterations--
  }

  return current
}

/**
 * Calculate planned progress based on status date.
 * Uses linear interpolation: (workingDays from start to statusDate) / (total workingDays)
 */
export function calculatePlannedProgress(
  plannedStart: Date,
  plannedEnd: Date,
  statusDate: Date,
  workDays: number[] = [1, 2, 3, 4, 5],
  holidays: Set<string> = new Set()
): number {
  if (statusDate < plannedStart) return 0
  if (statusDate >= plannedEnd) return 1

  const totalDays = countWorkingDays(plannedStart, plannedEnd, workDays, holidays)
  if (totalDays === 0) return 0

  const elapsedDays = countWorkingDays(plannedStart, statusDate, workDays, holidays)
  return Math.min(1, elapsedDays / totalDays)
}

/**
 * Default Korean public holidays for 2025-2026.
 */
export const DEFAULT_KOREAN_HOLIDAYS: Array<{ date: string; name: string }> = [
  // 2025
  { date: '2025-01-01', name: '신정' },
  { date: '2025-01-28', name: '설날 연휴' },
  { date: '2025-01-29', name: '설날' },
  { date: '2025-01-30', name: '설날 연휴' },
  { date: '2025-03-01', name: '삼일절' },
  { date: '2025-05-05', name: '어린이날' },
  { date: '2025-05-06', name: '부처님 오신 날' },
  { date: '2025-06-06', name: '현충일' },
  { date: '2025-08-15', name: '광복절' },
  { date: '2025-10-03', name: '개천절' },
  { date: '2025-10-05', name: '추석 연휴' },
  { date: '2025-10-06', name: '추석' },
  { date: '2025-10-07', name: '추석 연휴' },
  { date: '2025-10-08', name: '추석 대체공휴일' },
  { date: '2025-10-09', name: '한글날' },
  { date: '2025-12-25', name: '크리스마스' },
  // 2026
  { date: '2026-01-01', name: '신정' },
  { date: '2026-02-16', name: '설날 연휴' },
  { date: '2026-02-17', name: '설날' },
  { date: '2026-02-18', name: '설날 연휴' },
  { date: '2026-03-01', name: '삼일절' },
  { date: '2026-03-02', name: '삼일절 대체공휴일' },
  { date: '2026-05-05', name: '어린이날' },
  { date: '2026-05-24', name: '부처님 오신 날' },
  { date: '2026-06-06', name: '현충일' },
  { date: '2026-08-15', name: '광복절' },
  { date: '2026-09-24', name: '추석 연휴' },
  { date: '2026-09-25', name: '추석' },
  { date: '2026-09-26', name: '추석 연휴' },
  { date: '2026-10-03', name: '개천절' },
  { date: '2026-10-09', name: '한글날' },
  { date: '2026-12-25', name: '크리스마스' },
]
