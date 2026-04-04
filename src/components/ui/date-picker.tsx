import { useState, useMemo } from 'react'
import { format, parseISO, isValid, setMonth, setYear, addMonths, subMonths } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface DatePickerProps {
  value?: string
  onChange: (date: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

export function DatePicker({ value, onChange, placeholder = '날짜 선택', disabled, className }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const date = value ? parseISO(value) : undefined
  const isValidDate = date && isValid(date)
  const [viewMonth, setViewMonth] = useState<Date>(isValidDate ? date : new Date())
  const [mode, setMode] = useState<'calendar' | 'year' | 'month'>('calendar')

  const years = useMemo(() => {
    const center = viewMonth.getFullYear()
    const arr: number[] = []
    for (let y = center - 6; y <= center + 5; y++) arr.push(y)
    return arr
  }, [viewMonth])

  const handleOpen = (v: boolean) => {
    setOpen(v)
    if (v) {
      setViewMonth(isValidDate ? date : new Date())
      setMode('calendar')
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger
        className={cn(
          'inline-flex w-full items-center rounded-lg border bg-card px-3 text-left text-sm font-normal cursor-pointer hover:bg-accent/30 transition-colors whitespace-nowrap overflow-hidden',
          disabled && 'opacity-50 pointer-events-none',
          !isValidDate && 'text-muted-foreground',
          className
        )}
        disabled={disabled}
      >
        <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
        {isValidDate ? format(date, 'yyyy-MM-dd (EEE)', { locale: ko }) : placeholder}
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        {/* 공통 헤더 */}
        <div className="flex items-center justify-between p-2 border-b">
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => {
              if (mode === 'calendar') setViewMonth(subMonths(viewMonth, 1))
              else if (mode === 'year') setViewMonth(setYear(viewMonth, viewMonth.getFullYear() - 12))
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1">
            <button
              className={cn(
                "px-2 py-1 text-sm font-semibold rounded-md transition-colors hover:bg-accent",
                mode === 'year' && "bg-accent"
              )}
              onClick={() => setMode(mode === 'year' ? 'calendar' : 'year')}
            >
              {viewMonth.getFullYear()}년
            </button>
            <button
              className={cn(
                "px-2 py-1 text-sm font-semibold rounded-md transition-colors hover:bg-accent",
                mode === 'month' && "bg-accent"
              )}
              onClick={() => setMode(mode === 'month' ? 'calendar' : 'month')}
            >
              {MONTHS[viewMonth.getMonth()]}
            </button>
          </div>

          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => {
              if (mode === 'calendar') setViewMonth(addMonths(viewMonth, 1))
              else if (mode === 'year') setViewMonth(setYear(viewMonth, viewMonth.getFullYear() + 12))
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* 연도 선택 */}
        {mode === 'year' && (
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2">
              {years.map((y) => (
                <button
                  key={y}
                  className={cn(
                    "py-2 text-sm rounded-md transition-colors",
                    y === viewMonth.getFullYear()
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "hover:bg-accent"
                  )}
                  onClick={() => { setViewMonth(setYear(viewMonth, y)); setMode('calendar') }}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 월 선택 */}
        {mode === 'month' && (
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2">
              {MONTHS.map((m, i) => (
                <button
                  key={i}
                  className={cn(
                    "py-2 text-sm rounded-md transition-colors",
                    i === viewMonth.getMonth()
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "hover:bg-accent"
                  )}
                  onClick={() => { setViewMonth(setMonth(viewMonth, i)); setMode('calendar') }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 캘린더 */}
        {mode === 'calendar' && (
          <Calendar
            mode="single"
            selected={isValidDate ? date : undefined}
            onSelect={(d) => {
              if (d) {
                onChange(format(d, 'yyyy-MM-dd'))
                setOpen(false)
              }
            }}
            month={viewMonth}
            onMonthChange={setViewMonth}
            hideNavigation
          />
        )}

        {/* 하단: 오늘 버튼 */}
        <div className="border-t p-2 flex justify-between items-center">
          <Button
            variant="ghost" size="sm" className="text-xs h-7"
            onClick={() => {
              const today = format(new Date(), 'yyyy-MM-dd')
              onChange(today)
              setOpen(false)
            }}
          >
            오늘
          </Button>
          {isValidDate && (
            <span className="text-xs text-muted-foreground">
              {format(date, 'yyyy년 M월 d일 (EEEE)', { locale: ko })}
            </span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
