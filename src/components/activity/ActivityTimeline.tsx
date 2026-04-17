import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  RefreshCw,
  Clock,
  ListFilter,
  ChevronLeft,
  ChevronRight,
  User,
  Users,
  Calendar as CalendarIcon,
} from 'lucide-react'
import { useActivityStore, type ActivityLog } from '@/stores/activity-store'
import { useProjectStore } from '@/stores/project-store'
import { useAuthStore } from '@/stores/auth-store'
import {
  formatDistanceToNow,
  parseISO,
  isToday,
  isYesterday,
  format,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { DatePicker } from '@/components/ui/date-picker'
import { Button } from '@/components/ui/button'

type FilterType = 'all' | 'task' | 'detail' | 'assignment'

const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'task', label: '작업' },
  { key: 'detail', label: '세부항목' },
  { key: 'assignment', label: '담당자' },
]

const PAGE_SIZE = 50

function getActionIcon(action: ActivityLog['action']) {
  switch (action) {
    case 'create': return <Plus className="h-3.5 w-3.5" />
    case 'update': return <Pencil className="h-3.5 w-3.5" />
    case 'delete': return <Trash2 className="h-3.5 w-3.5" />
    case 'complete': return <CheckCircle className="h-3.5 w-3.5" />
    case 'status_change': return <RefreshCw className="h-3.5 w-3.5" />
  }
}

function getActionColor(action: ActivityLog['action']) {
  switch (action) {
    case 'create': return 'bg-emerald-500 text-white'
    case 'update': return 'bg-blue-500 text-white'
    case 'delete': return 'bg-red-500 text-white'
    case 'complete': return 'bg-emerald-600 text-white'
    case 'status_change': return 'bg-orange-500 text-white'
  }
}

function getActionLabel(action: ActivityLog['action']) {
  switch (action) {
    case 'create': return '생성'
    case 'update': return '수정'
    case 'delete': return '삭제'
    case 'complete': return '완료'
    case 'status_change': return '상태 변경'
  }
}

function getTargetTypeLabel(type: ActivityLog['targetType']) {
  switch (type) {
    case 'task': return '작업'
    case 'detail': return '세부항목'
    case 'assignment': return '담당자'
    case 'dependency': return '의존관계'
  }
}

function formatTime(timestamp: string): string {
  const date = parseISO(timestamp)
  if (isToday(date)) return formatDistanceToNow(date, { addSuffix: true, locale: ko })
  if (isYesterday(date)) return `어제 ${format(date, 'HH:mm')}`
  return format(date, 'M/d HH:mm')
}

function getDateGroupLabel(timestamp: string): string {
  const date = parseISO(timestamp)
  if (isToday(date)) return '오늘'
  if (isYesterday(date)) return '어제'
  return format(date, 'yyyy-MM-dd (eee)', { locale: ko })
}

interface GroupedLogs {
  dateLabel: string
  logs: ActivityLog[]
}

export function ActivityTimeline() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const projectId = useProjectStore((s) => s.currentProject?.id)
  const logs = useActivityStore((s) => s.logs)
  const totalCount = useActivityStore((s) => s.totalCount)
  const isLoading = useActivityStore((s) => s.isLoading)
  const loadLogs = useActivityStore((s) => s.loadLogs)
  const clearLogs = useActivityStore((s) => s.clearLogs)

  const [filter, setFilter] = useState<FilterType>('all')
  const [scope, setScope] = useState<'mine' | 'all'>('mine')  // 개인별 / 전체
  const [page, setPage] = useState(0)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // 필터 변경 시 첫 페이지부터 다시 로드
  const reload = useCallback(
    (pageIndex = 0) => {
      if (!projectId) return
      loadLogs(projectId, {
        userId: scope === 'mine' ? currentUser?.id : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        offset: pageIndex * PAGE_SIZE,
        limit: PAGE_SIZE,
      })
    },
    [projectId, scope, currentUser?.id, fromDate, toDate, loadLogs]
  )

  // 필터가 바뀌면 첫 페이지로
  useEffect(() => {
    setPage(0)
    reload(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, scope, fromDate, toDate])

  // 페이지 변경 시 재로드
  useEffect(() => {
    reload(page)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  // 클라이언트측 타입 필터 (task/detail/assignment)
  const filteredLogs = useMemo(() => {
    if (filter === 'all') return logs
    return logs.filter((l) => l.targetType === filter)
  }, [logs, filter])

  const groupedLogs = useMemo<GroupedLogs[]>(() => {
    const groups: Map<string, ActivityLog[]> = new Map()
    for (const log of filteredLogs) {
      const label = getDateGroupLabel(log.timestamp)
      const existing = groups.get(label)
      if (existing) existing.push(log)
      else groups.set(label, [log])
    }
    return Array.from(groups.entries()).map(([dateLabel, logs]) => ({ dateLabel, logs }))
  }, [filteredLogs])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const handleClearFilters = () => {
    setFromDate('')
    setToDate('')
    setFilter('all')
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">활동 로그</h2>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 tabular-nums">
              {totalCount}
            </span>
          </div>
          {totalCount > 0 && (
            <button
              onClick={() => {
                if (!projectId) return
                if (!confirm('이 프로젝트의 모든 활동 로그를 삭제하시겠습니까?')) return
                clearLogs(projectId)
              }}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              전체 삭제
            </button>
          )}
        </div>

        {/* Scope 토글 (개인 / 전체) */}
        <div className="flex items-center gap-2 mb-3">
          <div className="inline-flex bg-muted/50 rounded-md p-0.5">
            <button
              onClick={() => setScope('mine')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors',
                scope === 'mine' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <User className="h-3 w-3" />
              내 활동
            </button>
            <button
              onClick={() => setScope('all')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors',
                scope === 'all' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Users className="h-3 w-3" />
              전체
            </button>
          </div>
        </div>

        {/* Date range + Type filter */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <DatePicker value={fromDate} onChange={setFromDate} placeholder="시작일" className="h-7 text-xs w-32" />
          <span className="text-xs text-muted-foreground">~</span>
          <DatePicker value={toDate} onChange={setToDate} placeholder="종료일" className="h-7 text-xs w-32" />
          {(fromDate || toDate || filter !== 'all') && (
            <button
              onClick={handleClearFilters}
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              필터 초기화
            </button>
          )}
          <div className="flex-1" />
          <ListFilter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={cn(
                'px-2 py-0.5 text-[11px] font-medium rounded transition-colors',
                filter === opt.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Timeline */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs">로딩 중...</p>
          </div>
        ) : groupedLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Clock className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">활동 기록이 없습니다</p>
            <p className="text-xs mt-1 opacity-60">
              {scope === 'mine' ? '내 활동만 표시 중 — 전체 보기로 바꿔보세요' : '작업을 추가하거나 수정하면 여기에 기록됩니다'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedLogs.map((group) => (
              <div key={group.dateLabel}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-muted-foreground">{group.dateLabel}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <div className="relative pl-6">
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
                  <div className="space-y-1">
                    {group.logs.map((log) => (
                      <div
                        key={log.id}
                        className="relative group flex items-start gap-3 py-1.5 rounded-md hover:bg-accent/40 px-1 -ml-1 transition-colors"
                      >
                        <div
                          className={cn(
                            'relative z-10 flex items-center justify-center w-[22px] h-[22px] rounded-full flex-shrink-0 mt-0.5',
                            getActionColor(log.action)
                          )}
                        >
                          {getActionIcon(log.action)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{log.userName}</span>
                            <span className="text-sm text-muted-foreground">
                              {getTargetTypeLabel(log.targetType)}{' '}
                              <span className="font-medium text-foreground">'{log.targetName}'</span>{' '}
                              {getActionLabel(log.action)}
                            </span>
                          </div>
                          {log.parentTaskName && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              <span className="opacity-60">in</span>{' '}
                              <span className="font-medium">[{log.parentTaskName}]</span>
                            </div>
                          )}
                          {log.details && (
                            <div className="text-xs text-muted-foreground/80 mt-0.5">{log.details}</div>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground/60 flex-shrink-0 mt-1 select-none">
                          {formatTime(log.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/40">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {page * PAGE_SIZE + 1}~{Math.min((page + 1) * PAGE_SIZE, totalCount)} / {totalCount}건
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 gap-1 text-xs"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-3 w-3" />
                이전
              </Button>
              <span className="text-[11px] text-muted-foreground px-2 tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 gap-1 text-xs"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                다음
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
