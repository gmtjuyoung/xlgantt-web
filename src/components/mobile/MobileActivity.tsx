import { useMemo } from 'react'
import { useActivityStore } from '@/stores/activity-store'
import { useProjectStore } from '@/stores/project-store'
import { Clock, Plus, Pencil, Trash2, CheckCircle2, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACTION_ICONS: Record<string, React.ElementType> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  complete: CheckCircle2,
  status_change: ArrowLeftRight,
}

const ACTION_COLORS: Record<string, string> = {
  create: 'text-green-500 bg-green-50',
  update: 'text-blue-500 bg-blue-50',
  delete: 'text-red-500 bg-red-50',
  complete: 'text-emerald-500 bg-emerald-50',
  status_change: 'text-amber-500 bg-amber-50',
}

export function MobileActivity() {
  const logs = useActivityStore((s) => s.logs)
  const projectId = useProjectStore((s) => s.currentProject?.id)

  const filteredLogs = useMemo(() => {
    if (!projectId) return []
    return logs
      .filter((l) => l.projectId === projectId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50)
  }, [logs, projectId])

  // 날짜별 그룹화
  const grouped = useMemo(() => {
    const groups: { date: string; items: typeof filteredLogs }[] = []
    for (const log of filteredLogs) {
      const date = new Date(log.timestamp).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
      const last = groups[groups.length - 1]
      if (last && last.date === date) {
        last.items.push(log)
      } else {
        groups.push({ date, items: [log] })
      }
    }
    return groups
  }, [filteredLogs])

  if (filteredLogs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40">
        <Clock className="h-12 w-12 mb-3" />
        <p className="text-sm">최근 활동이 없습니다</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-bold">최근 활동</h2>
        <p className="text-[11px] text-muted-foreground">최근 50건</p>
      </div>

      {grouped.map((group) => (
        <div key={group.date}>
          <div className="px-4 py-1.5 bg-muted/30 text-[11px] font-semibold text-muted-foreground sticky top-0 z-10">
            {group.date}
          </div>
          {group.items.map((log) => {
            const Icon = ACTION_ICONS[log.action] || Pencil
            const colorCls = ACTION_COLORS[log.action] || 'text-gray-500 bg-gray-50'
            const time = new Date(log.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

            return (
              <div key={log.id} className="flex gap-3 px-4 py-3 border-b border-border/20">
                <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0', colorCls)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">
                    <span className="font-medium">{log.userName}</span>
                    <span className="text-muted-foreground"> · {log.details || log.targetName}</span>
                  </p>
                  {log.parentTaskName && (
                    <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
                      {log.parentTaskName}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 mt-0.5">{time}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
