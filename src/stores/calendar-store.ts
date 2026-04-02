import { create } from 'zustand'
import type { CalendarType } from '@/lib/types'
import { DEFAULT_KOREAN_HOLIDAYS } from '@/lib/calendar-calc'

export interface Holiday {
  id: string
  date: string   // 'yyyy-MM-dd'
  name: string
}

export type CalendarHolidays = Record<CalendarType, Holiday[]>
export type CalendarWorkingDays = Record<CalendarType, number[]>

interface CalendarState {
  /** 달력별 공휴일 목록 */
  holidays: CalendarHolidays
  /** 달력별 근무요일 (0=일~6=토) */
  workingDays: CalendarWorkingDays
  /** 현재 활성 탭 */
  activeCalendarTab: CalendarType

  // Actions
  setActiveCalendarTab: (tab: CalendarType) => void
  addHoliday: (calType: CalendarType, holiday: Omit<Holiday, 'id'>) => void
  removeHoliday: (calType: CalendarType, id: string) => void
  setWorkingDays: (calType: CalendarType, days: number[]) => void
  /** 엑셀 임포트 등에서 전체 holidays를 세팅 */
  setHolidays: (calType: CalendarType, holidays: Holiday[]) => void
  /** 기존 flat 배열 마이그레이션용: STD로 할당 */
  migrateFromFlat: (flatHolidays: Array<{ date: string; name: string }>) => void
  /** 특정 달력의 holiday Set (date string) 반환 헬퍼 */
  getHolidaySet: (calType: CalendarType) => Set<string>
  /** 특정 달력의 근무요일 반환 */
  getWorkingDaysFor: (calType: CalendarType) => number[]
}

let _nextId = 1
function genId(): string {
  return `hol_${Date.now()}_${_nextId++}`
}

const defaultSTDHolidays: Holiday[] = DEFAULT_KOREAN_HOLIDAYS.map((h) => ({
  id: genId(),
  date: h.date,
  name: h.name,
}))

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5] // 월~금

export const useCalendarStore = create<CalendarState>((set, get) => ({
  holidays: {
    STD: defaultSTDHolidays,
    UD1: [],
    UD2: [],
  },
  workingDays: {
    STD: [...DEFAULT_WORK_DAYS],
    UD1: [...DEFAULT_WORK_DAYS],
    UD2: [...DEFAULT_WORK_DAYS],
  },
  activeCalendarTab: 'STD',

  setActiveCalendarTab: (tab) => set({ activeCalendarTab: tab }),

  addHoliday: (calType, holiday) =>
    set((s) => ({
      holidays: {
        ...s.holidays,
        [calType]: [...s.holidays[calType], { ...holiday, id: genId() }],
      },
    })),

  removeHoliday: (calType, id) =>
    set((s) => ({
      holidays: {
        ...s.holidays,
        [calType]: s.holidays[calType].filter((h) => h.id !== id),
      },
    })),

  setWorkingDays: (calType, days) =>
    set((s) => ({
      workingDays: {
        ...s.workingDays,
        [calType]: days,
      },
    })),

  setHolidays: (calType, holidays) =>
    set((s) => ({
      holidays: {
        ...s.holidays,
        [calType]: holidays,
      },
    })),

  migrateFromFlat: (flatHolidays) =>
    set((s) => ({
      holidays: {
        ...s.holidays,
        STD: flatHolidays.map((h) => ({ id: genId(), date: h.date, name: h.name })),
      },
    })),

  getHolidaySet: (calType) => {
    const state = get()
    return new Set(state.holidays[calType].map((h) => h.date))
  },

  getWorkingDaysFor: (calType) => {
    const state = get()
    return state.workingDays[calType]
  },
}))
