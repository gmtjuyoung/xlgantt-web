import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import { useResourceStore } from '@/stores/resource-store'
import { useMemo } from 'react'

interface MobileTaskCardProps {
  task: Task
  onTap: () => void
  showAssignees?: boolean
  showProgress?: boolean
  compact?: boolean
}

export function MobileTaskCard({ task, onTap, showAssignees = true, showProgress = true, compact = false }: MobileTaskCardProps) {
  const { assignments, members, companies } = useResourceStore()
  const progressPct = Math.round((task.actual_progress || 0) * 100)
  const isDelayed = task.planned_end && task.actual_progress < 1 && new Date(task.planned_end) < new Date()

  const assigneeAvatars = useMemo(() => {
    if (!showAssignees) return []
    return assignments
      .filter((a) => a.task_id === task.id)
      .slice(0, 3)
      .map((a) => {
        const member = members.find((m) => m.id === a.member_id)
        const company = member ? companies.find((c) => c.id === member.company_id) : null
        return member ? { name: member.name, color: company?.color || '#888' } : null
      })
      .filter(Boolean) as { name: string; color: string }[]
  }, [task.id, assignments, members, companies, showAssignees])

  const dateStr = [
    task.planned_start?.slice(5),
    task.planned_end?.slice(5),
  ].filter(Boolean).join(' ~ ')

  return (
    <div
      onClick={onTap}
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b border-border/20 active:bg-accent/40 transition-colors',
        compact && 'py-2'
      )}
    >
      <div className="flex-1 min-w-0">
        {/* WBS + Title */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">{task.wbs_code}</span>
          <span className={cn(
            'text-sm truncate',
            task.is_milestone && 'font-semibold text-purple-600'
          )}>
            {task.task_name}
          </span>
        </div>

        {/* Meta: date + assignees */}
        <div className="flex items-center gap-2 mt-1">
          {dateStr && (
            <span className={cn(
              'text-[11px] font-mono',
              isDelayed ? 'text-red-500' : 'text-muted-foreground'
            )}>
              {dateStr}
            </span>
          )}
          {assigneeAvatars.length > 0 && (
            <div className="flex -space-x-1">
              {assigneeAvatars.map((a, i) => (
                <div
                  key={i}
                  className="w-4 h-4 rounded-full text-white text-[7px] font-bold flex items-center justify-center ring-1 ring-background"
                  style={{ backgroundColor: a.color }}
                >
                  {a.name.charAt(0)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      {showProgress && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-10 h-1.5 bg-muted/60 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full',
                progressPct >= 100 ? 'bg-green-500' : progressPct > 0 ? 'bg-primary' : 'bg-transparent'
              )}
              style={{ width: `${Math.min(progressPct, 100)}%` }}
            />
          </div>
          <span className={cn(
            'text-[11px] font-mono w-8 text-right',
            progressPct >= 100 ? 'text-green-600' : 'text-muted-foreground'
          )}>
            {progressPct}%
          </span>
        </div>
      )}

      <ChevronRight className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" />
    </div>
  )
}
