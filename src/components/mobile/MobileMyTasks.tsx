import { useState, useMemo } from 'react'
import { Search, CheckCircle2, Circle, Loader2, EyeOff, ArrowUpDown } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useResourceStore } from '@/stores/resource-store'
import { useTaskStore } from '@/stores/task-store'
import { useUIStore } from '@/stores/ui-store'
import { MobileFilterBar } from './MobileFilterBar'
import { cn } from '@/lib/utils'

type SortMode = 'wbs' | 'created'

const STATUS_FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'todo', label: '대기' },
  { key: 'in_progress', label: '진행중' },
  { key: 'done', label: '완료' },
]

interface MyCard {
  type: 'detail' | 'task'
  detail?: ReturnType<typeof useResourceStore.getState>['taskDetails'][0]
  task: ReturnType<typeof useTaskStore.getState>['tasks'][0]
  status: string
}

export function MobileMyTasks() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { members, assignments, taskDetails } = useResourceStore()
  const tasks = useTaskStore((s) => s.tasks)
  const setMobileTaskId = useUIStore((s) => s.setMobileTaskId)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [hideDone, setHideDone] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('wbs')

  const myMember = useMemo(() => {
    if (!currentUser) return null
    return (
      members.find((m) => m.email && m.email.toLowerCase() === currentUser.email?.toLowerCase()) ||
      members.find((m) => m.name === currentUser.name) ||
      null
    )
  }, [currentUser, members])

  // 내 카드
  const myCards = useMemo(() => {
    if (!myMember) return []
    const myTaskIds = new Set(
      assignments.filter((a) => a.member_id === myMember.id).map((a) => a.task_id)
    )
    for (const d of taskDetails) {
      if (d.assignee_ids?.includes(myMember.id) || d.assignee_id === myMember.id) {
        myTaskIds.add(d.task_id)
      }
    }

    const cards: MyCard[] = []
    const taskMap = new Map(tasks.map((t) => [t.id, t]))
    const taskIdsWithDetails = new Set<string>()

    for (const taskId of myTaskIds) {
      const task = taskMap.get(taskId)
      if (!task) continue
      const details = taskDetails.filter((d) => d.task_id === taskId)
      if (details.length > 0) {
        taskIdsWithDetails.add(taskId)
        for (const detail of details) {
          const isMyDetail =
            (!detail.assignee_id && (!detail.assignee_ids || detail.assignee_ids.length === 0)) ||
            detail.assignee_id === myMember.id ||
            detail.assignee_ids?.includes(myMember.id)
          if (isMyDetail) {
            cards.push({ type: 'detail', detail, task, status: detail.status })
          }
        }
      }
    }
    for (const taskId of myTaskIds) {
      if (taskIdsWithDetails.has(taskId)) continue
      const task = taskMap.get(taskId)
      if (!task || task.is_group) continue
      const status = task.actual_progress >= 1 ? 'done' : task.actual_progress > 0 ? 'in_progress' : 'todo'
      cards.push({ type: 'task', task, status })
    }
    return cards
  }, [myMember, assignments, taskDetails, tasks])

  // 필터링 + 정렬
  const filteredCards = useMemo(() => {
    let result = [...myCards]
    // 완료 숨기기
    if (hideDone) {
      result = result.filter((c) => c.status !== 'done')
    }
    // 상태 필터
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter)
    }
    // 검색
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter((c) => {
        const title = c.type === 'detail' ? c.detail!.title : c.task.task_name
        return title.toLowerCase().includes(q) || c.task.task_name.toLowerCase().includes(q)
      })
    }
    // 정렬
    if (sortMode === 'wbs') {
      result.sort((a, b) => {
        const pa = (a.task.wbs_code || '').split('.').map(Number)
        const pb = (b.task.wbs_code || '').split('.').map(Number)
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
        }
        // 같은 작업 내 세부항목은 sort_order로
        if (a.type === 'detail' && b.type === 'detail') {
          return (a.detail!.sort_order || 0) - (b.detail!.sort_order || 0)
        }
        return 0
      })
    }
    // 'created'는 기본 순서 유지 (등록순)
    return result
  }, [myCards, statusFilter, searchQuery, hideDone, sortMode])

  const statusCounts = useMemo(() => ({
    all: myCards.filter((c) => !hideDone || c.status !== 'done').length,
    todo: myCards.filter((c) => c.status === 'todo').length,
    in_progress: myCards.filter((c) => c.status === 'in_progress').length,
    done: myCards.filter((c) => c.status === 'done').length,
  }), [myCards, hideDone])

  if (!currentUser) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">로그인이 필요합니다</div>
  }

  const statusStyle = {
    todo: { icon: Circle, color: 'text-amber-500', bg: 'bg-amber-50 border-l-amber-400' },
    in_progress: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-50 border-l-blue-400' },
    done: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50/60 border-l-green-400' },
  }

  // WBS 그룹화용 (sortMode === 'wbs')
  let lastWbs = ''

  return (
    <div className="flex flex-col h-full">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-2 px-4 pt-3 pb-1">
        {(['todo', 'in_progress', 'done'] as const).map((s) => {
          const cfg = statusStyle[s]
          const Icon = cfg.icon
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
              className={cn(
                'rounded-lg border p-2.5 text-center transition-all active:scale-95',
                statusFilter === s ? 'ring-2 ring-primary/30' : 'border-border/40'
              )}
            >
              <Icon className={cn('h-4 w-4 mx-auto mb-0.5', cfg.color)} />
              <div className="text-lg font-bold">{statusCounts[s]}</div>
              <div className="text-[10px] text-muted-foreground">{s === 'todo' ? '대기' : s === 'in_progress' ? '진행중' : '완료'}</div>
            </button>
          )
        })}
      </div>

      {/* 검색 + 옵션 */}
      <div className="px-4 py-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <input
            placeholder="업무 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-muted/40 border-0 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {/* 정렬 토글 */}
        <button
          onClick={() => setSortMode(sortMode === 'wbs' ? 'created' : 'wbs')}
          className="h-9 px-2.5 rounded-lg bg-muted/40 flex items-center gap-1 text-xs text-muted-foreground active:bg-muted flex-shrink-0"
          title={sortMode === 'wbs' ? 'WBS순' : '등록순'}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span>{sortMode === 'wbs' ? 'WBS' : '등록순'}</span>
        </button>
      </div>

      {/* 완료 숨기기 + 필터 */}
      <div className="flex items-center gap-2 px-4 pb-1">
        <label className="flex items-center gap-1.5 cursor-pointer select-none flex-shrink-0">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="w-3.5 h-3.5 rounded accent-primary" />
          <EyeOff className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">완료 숨기기</span>
        </label>
        <div className="flex-1" />
        <span className="text-[11px] text-muted-foreground">{filteredCards.length}건</span>
      </div>

      <MobileFilterBar
        options={STATUS_FILTERS.map((f) => ({ ...f, label: `${f.label} (${statusCounts[f.key as keyof typeof statusCounts] || 0})` }))}
        activeKey={statusFilter}
        onChange={setStatusFilter}
      />

      {/* 카드 리스트 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {filteredCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
            <Circle className="h-10 w-10 mb-2" />
            <span className="text-sm">{searchQuery ? '검색 결과 없음' : '배정된 업무가 없습니다'}</span>
          </div>
        ) : (
          filteredCards.map((card, i) => {
            const title = card.type === 'detail' ? card.detail!.title : card.task.task_name
            const cfg = statusStyle[card.status as keyof typeof statusStyle]
            const Icon = cfg.icon

            // WBS 그룹 헤더
            let groupHeader = null
            if (sortMode === 'wbs') {
              const wbs = card.task.wbs_code || ''
              if (wbs !== lastWbs) {
                lastWbs = wbs
                groupHeader = (
                  <div className="flex items-center gap-2 pt-3 pb-1.5 mt-1 first:mt-0">
                    <span className="text-[10px] font-mono text-primary font-bold">{wbs}</span>
                    <span className="text-[11px] font-semibold text-foreground/70 truncate">{card.task.task_name}</span>
                    <div className="flex-1 h-px bg-border/40" />
                  </div>
                )
              }
            }

            return (
              <div key={card.type === 'detail' ? card.detail!.id : card.task.id + '_task_' + i}>
                {groupHeader}
                <div
                  onClick={() => setMobileTaskId(card.task.id)}
                  className={cn(
                    'mb-1.5 rounded-lg border border-border/40 border-l-[3px] p-3 active:bg-accent/30 transition-colors',
                    cfg.bg
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', cfg.color)} />
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium', card.status === 'done' && 'line-through text-muted-foreground')}>
                        {title}
                      </p>
                      {card.type === 'detail' && card.detail?.due_date && (
                        <p className={cn(
                          'text-[10px] font-mono mt-0.5',
                          card.detail.due_date < new Date().toISOString().slice(0, 10) && card.status !== 'done' ? 'text-red-500' : 'text-muted-foreground'
                        )}>
                          기한: {card.detail.due_date}
                        </p>
                      )}
                      {sortMode !== 'wbs' && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          [{card.task.wbs_code}] {card.task.task_name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
