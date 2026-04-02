import { useState, useMemo } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  RefreshCw,
  Clock,
  ListFilter,
} from 'lucide-react'
import { useActivityStore, type ActivityLog } from '@/stores/activity-store'
import { useProjectStore } from '@/stores/project-store'
import {
  formatDistanceToNow,
  parseISO,
  isToday,
  isYesterday,
  format,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import { cn } from '@/lib/utils'

type FilterType = 'all' | 'task' | 'detail' | 'assignment'

const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'task', label: '작업' },
  { key: 'detail', label: '세부항목' },
  { key: 'assignment', label: '담당자' },
]

function getActionIcon(action: ActivityLog['action']) {
  switch (action) {
    case 'create':
      return <Plus className="h-3.5 w-3.5" />
    case 'update':
      return <Pencil className="h-3.5 w-3.5" />
    case 'delete':
      return <Trash2 className="h-3.5 w-3.5" />
    case 'complete':
      return <CheckCircle className="h-3.5 w-3.5" />
    case 'status_change':
      return <RefreshCw className="h-3.5 w-3.5" />
  }
}

function getActionColor(action: ActivityLog['action']) {
  switch (action) {
    case 'create':
      return 'bg-emerald-500 text-white'
    case 'update':
      return 'bg-blue-500 text-white'
    case 'delete':
      return 'bg-red-500 text-white'
    case 'complete':
      return 'bg-emerald-600 text-white'
    case 'status_change':
      return 'bg-orange-500 text-white'
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
  if (isToday(date)) {
    return formatDistanceToNow(date, { addSuffix: true, locale: ko })
  }
  if (isYesterday(date)) {
    return `어제 ${format(date, 'HH:mm')}`
  }
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
  const [filter, setFilter] = useState<FilterType>('all')
  const allLogs = useActivityStore((s) => s.logs)
  const clearLogs = useActivityStore((s) => s.clearLogs)
  const projectId = useProjectStore((s) => s.currentProject?.id)

  const filteredLogs = useMemo(() => {
    let logs = allLogs
    if (projectId) {
      logs = logs.filter((l) => l.projectId === projectId)
    }
    if (filter !== 'all') {
      logs = logs.filter((l) => l.targetType === filter)
    }
    return logs
  }, [allLogs, projectId, filter])

  const groupedLogs = useMemo<GroupedLogs[]>(() => {
    const groups: Map<string, ActivityLog[]> = new Map()
    for (const log of filteredLogs) {
      const label = getDateGroupLabel(log.timestamp)
      const existing = groups.get(label)
      if (existing) {
        existing.push(log)
      } else {
        groups.set(label, [log])
      }
    }
    return Array.from(groups.entries()).map(([dateLabel, logs]) => ({ dateLabel, logs }))
  }, [filteredLogs])

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">활동 로그</h2>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {filteredLogs.length}
            </span>
          </div>
          {allLogs.length > 0 && (
            <button
              onClick={clearLogs}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              전체 삭제
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 mb-5">
          <ListFilter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                filter === opt.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Timeline */}
        {groupedLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Clock className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">아직 활동 기록이 없습니다</p>
            <p className="text-xs mt-1 opacity-60">
              작업을 추가하거나 수정하면 여기에 기록됩니다
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedLogs.map((group) => (
              <div key={group.dateLabel}>
                {/* Date separator */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {group.dateLabel}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Events */}
                <div className="relative pl-6">
                  {/* Vertical line */}
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

                  <div className="space-y-1">
                    {group.logs.map((log) => (
                      <div
                        key={log.id}
                        className="relative group flex items-start gap-3 py-1.5 rounded-md hover:bg-accent/40 px-1 -ml-1 transition-colors"
                      >
                        {/* Node */}
                        <div
                          className={cn(
                            'relative z-10 flex items-center justify-center w-[22px] h-[22px] rounded-full flex-shrink-0 mt-0.5',
                            getActionColor(log.action)
                          )}
                        >
                          {getActionIcon(log.action)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-foreground">
                              {log.userName}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {getTargetTypeLabel(log.targetType)}{' '}
                              <span className="font-medium text-foreground">
                                '{log.targetName}'
                              </span>{' '}
                              {getActionLabel(log.action)}
                            </span>
                          </div>

                          {/* Parent task info */}
                          {log.parentTaskName && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              <span className="opacity-60">in</span>{' '}
                              <span className="font-medium">[{log.parentTaskName}]</span>
                            </div>
                          )}

                          {/* Details (shown on hover or always if short) */}
                          {log.details && (
                            <div className="text-xs text-muted-foreground/80 mt-0.5">
                              {log.details}
                            </div>
                          )}
                        </div>

                        {/* Time */}
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
      </div>
    </div>
  )
}
