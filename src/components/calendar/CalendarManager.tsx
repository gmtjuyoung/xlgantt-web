import { useState, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, addMonths, subMonths,
  isSameMonth, isToday, getDay,
} from 'date-fns'
import { cn } from '@/lib/utils'
import { useCalendarStore } from '@/stores/calendar-store'
import type { CalendarType } from '@/lib/types'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
const DAY_NAMES_FULL = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

const TAB_CONFIG: { key: CalendarType; label: string; description: string }[] = [
  { key: 'STD', label: 'STD', description: '표준' },
  { key: 'UD1', label: 'UD1', description: '사용자1' },
  { key: 'UD2', label: 'UD2', description: '사용자2' },
]

export function CalendarManager() {
  const {
    holidays,
    workingDays,
    activeCalendarTab,
    setActiveCalendarTab,
    addHoliday,
    removeHoliday,
    setWorkingDays,
  } = useCalendarStore()

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [newDate, setNewDate] = useState('')
  const [newName, setNewName] = useState('')

  const currentHolidays = holidays[activeCalendarTab]
  const currentWorkingDays = workingDays[activeCalendarTab]

  const handleAdd = useCallback(() => {
    if (!newDate) return
    addHoliday(activeCalendarTab, { date: newDate, name: newName || '공휴일' })
    setNewDate('')
    setNewName('')
  }, [newDate, newName, activeCalendarTab, addHoliday])

  const handleDelete = useCallback((id: string) => {
    removeHoliday(activeCalendarTab, id)
  }, [activeCalendarTab, removeHoliday])

  const toggleWorkingDay = useCallback((dayIndex: number) => {
    const current = workingDays[activeCalendarTab]
    const next = current.includes(dayIndex)
      ? current.filter((d) => d !== dayIndex)
      : [...current, dayIndex].sort()
    setWorkingDays(activeCalendarTab, next)
  }, [activeCalendarTab, workingDays, setWorkingDays])

  // Holiday lookup
  const holidayMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    currentHolidays.forEach((h) => map.set(h.date, { id: h.id, name: h.name }))
    return map
  }, [currentHolidays])

  // Calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [currentMonth])

  // Monthly holidays filtered
  const monthlyHolidays = useMemo(() => {
    const prefix = format(currentMonth, 'yyyy-MM')
    return currentHolidays
      .filter((h) => h.date.startsWith(prefix))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [currentHolidays, currentMonth])

  return (
    <div className="p-6 max-w-6xl mx-auto overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            달력 관리
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            달력별 근무요일 및 공휴일을 독립적으로 관리합니다
          </p>
        </div>
      </div>

      {/* 3-Tab Navigation */}
      <div className="flex gap-1 mb-4 bg-muted/50 rounded-lg p-1 w-fit">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveCalendarTab(tab.key)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
              activeCalendarTab === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            {tab.label}
            <span className="ml-1 text-xs opacity-60">({tab.description})</span>
          </button>
        ))}
      </div>

      {/* Working Days Config */}
      <div className="bg-card rounded-xl border border-border/50 shadow-sm p-4 mb-4">
        <h4 className="text-sm font-semibold mb-2">
          근무요일 설정
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            체크된 요일이 근무일입니다
          </span>
        </h4>
        <div className="flex gap-2">
          {DAY_NAMES.map((day, i) => {
            const isWorking = currentWorkingDays.includes(i)
            const isWeekend = i === 0 || i === 6
            return (
              <button
                key={i}
                onClick={() => toggleWorkingDay(i)}
                className={cn(
                  'flex flex-col items-center justify-center w-16 h-14 rounded-lg border-2 transition-all text-sm font-medium',
                  isWorking
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/50 bg-muted/30 text-muted-foreground',
                  isWeekend && !isWorking && 'border-red-200 bg-red-50/50',
                )}
                title={`${DAY_NAMES_FULL[i]} ${isWorking ? '(근무일)' : '(휴무일)'}`}
              >
                <span className={cn(
                  'text-base font-bold',
                  i === 0 && 'text-red-500',
                  i === 6 && 'text-blue-500',
                )}>
                  {day}
                </span>
                <span className="text-[10px] mt-0.5">
                  {isWorking ? '근무' : '휴무'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left: Monthly Calendar View */}
        <div className="flex-1">
          <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
            {/* Month Navigation */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <h3 className="text-lg font-bold">{format(currentMonth, 'yyyy년 M월')}</h3>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {/* Day Header */}
            <div className="grid grid-cols-7 border-b border-border/30">
              {DAY_NAMES.map((day, i) => {
                const isNonWorking = !currentWorkingDays.includes(i)
                return (
                  <div key={day} className={cn(
                    "text-center py-2 text-sm font-semibold",
                    i === 0 && 'text-red-500',
                    i === 6 && 'text-blue-500',
                    i > 0 && i < 6 && !isNonWorking && 'text-muted-foreground',
                    isNonWorking && i > 0 && i < 6 && 'text-gray-400',
                  )}>
                    {day}
                  </div>
                )
              })}
            </div>

            {/* Date Grid */}
            <div className="grid grid-cols-7">
              {calendarDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const holiday = holidayMap.get(dateStr)
                const isCurrentMonth = isSameMonth(day, currentMonth)
                const isTodayDate = isToday(day)
                const dayOfWeek = getDay(day)
                const isNonWorkingDay = !currentWorkingDays.includes(dayOfWeek)
                const isHoliday = !!holiday

                return (
                  <div
                    key={dateStr}
                    className={cn(
                      "min-h-[72px] p-1.5 border-b border-r border-border/20 transition-colors",
                      !isCurrentMonth && 'opacity-30',
                      isCurrentMonth && isNonWorkingDay && 'bg-gray-50 dark:bg-gray-900/30',
                      isCurrentMonth && isHoliday && 'bg-red-50 dark:bg-red-950/30',
                      isTodayDate && 'ring-2 ring-primary ring-inset',
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <span className={cn(
                        "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                        dayOfWeek === 0 && 'text-red-500',
                        dayOfWeek === 6 && 'text-blue-500',
                        isHoliday && 'text-red-600 font-bold',
                        isTodayDate && 'bg-primary text-primary-foreground',
                      )}>
                        {format(day, 'd')}
                      </span>
                      {holiday && isCurrentMonth && (
                        <button
                          onClick={() => handleDelete(holiday.id)}
                          className="text-red-400 hover:text-red-600 p-0.5"
                          title="공휴일 삭제"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {holiday && isCurrentMonth && (
                      <div className="mt-0.5 text-xs text-red-600 font-medium truncate px-0.5">
                        {holiday.name}
                      </div>
                    )}
                    {!holiday && isCurrentMonth && isNonWorkingDay && (
                      <div className="mt-0.5 text-[10px] text-gray-400 truncate px-0.5">
                        휴무
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right: Holiday Management Panel */}
        <div className="w-[300px] flex-shrink-0">
          {/* Add Holiday */}
          <div className="bg-card rounded-xl border border-border/50 p-4 shadow-sm mb-4">
            <h4 className="text-sm font-semibold mb-3">공휴일 추가</h4>
            <div className="space-y-2">
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
              <Input
                type="text"
                placeholder="공휴일 이름"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <Button onClick={handleAdd} size="sm" className="w-full">
                <Plus className="h-4 w-4 mr-1" />추가
              </Button>
            </div>
          </div>

          {/* Monthly Holidays */}
          <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/40">
              <h4 className="text-sm font-semibold">
                {format(currentMonth, 'M월')} 공휴일
                <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                  ({monthlyHolidays.length}건)
                </span>
              </h4>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {monthlyHolidays.map((h) => {
                const d = new Date(h.date)
                return (
                  <div key={h.id} className="flex items-center px-4 py-2 border-b border-border/20 hover:bg-accent/20 text-sm">
                    <span className="text-muted-foreground w-12 font-mono text-xs">
                      {format(d, 'M/d')}
                    </span>
                    <span className={cn("w-6 text-center text-xs",
                      getDay(d) === 0 && 'text-red-500',
                      getDay(d) === 6 && 'text-blue-500',
                    )}>
                      ({DAY_NAMES[getDay(d)]})
                    </span>
                    <span className="flex-1 font-medium ml-2">{h.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleDelete(h.id)}
                    >
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </Button>
                  </div>
                )
              })}
              {monthlyHolidays.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  이달에 등록된 공휴일이 없습니다
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="mt-3 px-2 py-2 bg-muted/30 rounded-lg">
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>전체 공휴일</span>
                <span className="font-medium text-foreground">{currentHolidays.length}개</span>
              </div>
              <div className="flex justify-between">
                <span>근무요일</span>
                <span className="font-medium text-foreground">
                  {currentWorkingDays.map((d) => DAY_NAMES[d]).join(', ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span>주간 근무일수</span>
                <span className="font-medium text-foreground">{currentWorkingDays.length}일</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
