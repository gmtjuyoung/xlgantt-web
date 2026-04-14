import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, Circle } from 'lucide-react'
import { useTaskStore } from '@/stores/task-store'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'

interface MilestoneItem {
  id: string
  name: string
  wbsCode: string
  start: string
  end: string
  done: boolean
}

interface WpSummary {
  id: string
  name: string
  wbsCode: string
  total: number
  done: number
  progress: number
  children: SubSummary[]
  milestones: MilestoneItem[]
}

interface SubSummary {
  id: string
  name: string
  wbsCode: string
  total: number
  done: number
  progress: number
}

export function MobileProgressView() {
  const tasks = useTaskStore((s) => s.tasks)
  const [expandedWp, setExpandedWp] = useState<Set<string>>(new Set())

  const toggleWp = (id: string) => {
    setExpandedWp((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // 전체 진척률
  const overallProgress = useMemo(() => {
    const leaves = tasks.filter((t) => !t.is_group)
    if (leaves.length === 0) return 0
    return leaves.reduce((sum, t) => sum + (t.actual_progress || 0), 0) / leaves.length
  }, [tasks])

  // WP별 (L1 그룹) + L2 하위 진척률
  const wpSummaries = useMemo(() => {
    const l1Groups = tasks.filter((t) => t.is_group && t.wbs_level === 1).sort((a, b) => a.sort_order - b.sort_order)
    const summaries: WpSummary[] = []

    for (const group of l1Groups) {
      const descendants = tasks.filter((t) => !t.is_group && isDescendant(t, group.id, tasks))
      const total = descendants.length
      const done = descendants.filter((t) => t.actual_progress >= 1).length
      const progress = total > 0 ? descendants.reduce((s, t) => s + (t.actual_progress || 0), 0) / total : 0

      // L2 하위 그룹
      const l2Groups = tasks.filter((t) => t.is_group && t.wbs_level === 2 && t.parent_id === group.id).sort((a, b) => a.sort_order - b.sort_order)
      const children: SubSummary[] = l2Groups.map((l2) => {
        const l2Desc = tasks.filter((t) => !t.is_group && isDescendant(t, l2.id, tasks))
        const l2Total = l2Desc.length
        const l2Done = l2Desc.filter((t) => t.actual_progress >= 1).length
        const l2Progress = l2Total > 0 ? l2Desc.reduce((s, t) => s + (t.actual_progress || 0), 0) / l2Total : 0
        return { id: l2.id, name: l2.task_name, wbsCode: l2.wbs_code, total: l2Total, done: l2Done, progress: l2Progress }
      })

      // 마일스톤 개별 항목 (L3 is_milestone)
      const milestones: MilestoneItem[] = descendants
        .filter((t) => t.is_milestone)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((t) => ({
          id: t.id,
          name: t.task_name,
          wbsCode: t.wbs_code,
          start: t.planned_start || '',
          end: t.planned_end || '',
          done: t.actual_progress >= 1,
        }))

      summaries.push({ id: group.id, name: group.task_name, wbsCode: group.wbs_code, total, done, progress, children, milestones })
    }
    return summaries
  }, [tasks])

  const delayedCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return tasks.filter((t) => !t.is_group && t.planned_end && t.planned_end < today && t.actual_progress < 1).length
  }, [tasks])

  const totalLeaves = tasks.filter((t) => !t.is_group).length
  const completedLeaves = tasks.filter((t) => !t.is_group && t.actual_progress >= 1).length

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 전체 진척률 대형 게이지 */}
      <div className="px-6 pt-6 pb-4">
        <div className="text-center mb-4">
          <div className="relative inline-flex items-center justify-center">
            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
              <circle
                cx="60" cy="60" r="52" fill="none"
                stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                className={cn(
                  overallProgress >= 1 ? 'text-green-500' : overallProgress > 0.5 ? 'text-primary' : 'text-amber-500'
                )}
                strokeDasharray={`${overallProgress * 326.7} 326.7`}
              />
            </svg>
            <span className="absolute text-2xl font-bold">{Math.round(overallProgress * 100)}%</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">전체 프로젝트 진척률</p>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-border/40 p-3 text-center">
            <div className="text-lg font-bold">{totalLeaves}</div>
            <div className="text-[10px] text-muted-foreground">전체 작업</div>
          </div>
          <div className="rounded-xl border border-border/40 p-3 text-center">
            <div className="text-lg font-bold text-green-600">{completedLeaves}</div>
            <div className="text-[10px] text-muted-foreground">완료</div>
          </div>
          <div className="rounded-xl border border-border/40 p-3 text-center">
            <div className={cn('text-lg font-bold', delayedCount > 0 ? 'text-red-500' : 'text-muted-foreground')}>{delayedCount}</div>
            <div className="text-[10px] text-muted-foreground">지연</div>
          </div>
        </div>
      </div>

      {/* WP별 진척률 (접었다 펼치기) */}
      <div className="px-4 pb-6">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">영역별 진척률</h3>
        <div className="space-y-2">
          {wpSummaries.map((wp) => {
            const pct = Math.round(wp.progress * 100)
            const isExpanded = expandedWp.has(wp.id)
            return (
              <div key={wp.id} className="rounded-xl border border-border/40 overflow-hidden">
                {/* WP 메인 행 */}
                <div
                  className="p-3 active:bg-accent/20 transition-colors"
                  onClick={() => toggleWp(wp.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {wp.children.length > 0 ? (
                        isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <div className="w-4" />
                      )}
                      <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">{wp.wbsCode}</span>
                      <span className="text-sm font-semibold truncate">{wp.name}</span>
                    </div>
                    <span className={cn(
                      'text-sm font-bold flex-shrink-0 ml-2',
                      pct >= 100 ? 'text-green-600' : pct > 0 ? 'text-primary' : 'text-muted-foreground'
                    )}>
                      {pct}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-primary' : 'bg-transparent')}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                    <span>{wp.done}/{wp.total} 완료</span>
                    <span>{wp.total - wp.done}건 남음</span>
                  </div>
                </div>

                {/* L2 하위 항목 또는 마일스톤 개별 항목 */}
                {isExpanded && (wp.children.length > 0 || wp.milestones.length > 0) && (
                  <div className="border-t border-border/20 bg-muted/10">
                    {/* L2 단계별 진척률 */}
                    {wp.children.map((sub) => {
                      const subPct = Math.round(sub.progress * 100)
                      return (
                        <div key={sub.id} className="px-4 py-2.5 border-b border-border/10 last:border-b-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[9px] font-mono text-muted-foreground flex-shrink-0">{sub.wbsCode}</span>
                              <span className="text-xs truncate">{sub.name}</span>
                            </div>
                            <span className={cn(
                              'text-xs font-semibold flex-shrink-0 ml-2',
                              subPct >= 100 ? 'text-green-600' : subPct > 0 ? 'text-primary' : 'text-muted-foreground'
                            )}>
                              {subPct}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', subPct >= 100 ? 'bg-green-500' : subPct > 0 ? 'bg-primary/70' : 'bg-transparent')}
                              style={{ width: `${Math.min(subPct, 100)}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-muted-foreground mt-1 block">{sub.done}/{sub.total} 완료</span>
                        </div>
                      )
                    })}
                    {/* 마일스톤 개별 항목 */}
                    {wp.milestones.map((ms) => (
                      <div key={ms.id} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border/10 last:border-b-0">
                        <span className={cn('text-sm', ms.done ? 'text-green-500' : 'text-purple-500')}>◆</span>
                        <div className="flex-1 min-w-0">
                          <span className={cn('text-xs truncate block', ms.done && 'line-through text-muted-foreground')}>{ms.name}</span>
                          <span className="text-[9px] text-muted-foreground font-mono">{ms.start.slice(5)} ~ {ms.end.slice(5)}</span>
                        </div>
                        {ms.done ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function isDescendant(task: { parent_id?: string | null }, groupId: string, allTasks: Task[]): boolean {
  let pid = task.parent_id
  while (pid) {
    if (pid === groupId) return true
    const parent = allTasks.find((t) => t.id === pid)
    pid = parent?.parent_id || null
  }
  return false
}
