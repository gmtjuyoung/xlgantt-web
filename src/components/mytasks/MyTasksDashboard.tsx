import { useState, useMemo, useCallback } from 'react'
import {
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertTriangle,
  ClipboardList,
  User,
  Search,
  X,
  CalendarPlus,
  CalendarCheck2,
  ExternalLink,
} from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuthStore } from '@/stores/auth-store'
import { useResourceStore } from '@/stores/resource-store'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { TaskEditDialog } from '@/components/gantt/TaskEditDialog'
import { CardDetailModal } from '@/components/mytasks/CardDetailModal'
import { cn } from '@/lib/utils'
import type { TaskDetail } from '@/lib/resource-types'
import type { Task } from '@/lib/types'

// ─── 타입 ───
interface MyDetailCard {
  type: 'detail'
  detail: TaskDetail
  task: Task
}

interface MyTaskCard {
  type: 'task'
  task: Task
}

type MyCard = MyDetailCard | MyTaskCard

const STATUS_LABELS: Record<string, string> = {
  todo: '대기',
  in_progress: '진행중',
  done: '완료',
}

const STATUS_COLORS = {
  todo: {
    bg: 'bg-card',
    border: 'border-l-amber-400',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    headerText: 'text-amber-600',
    headerDot: 'bg-amber-400',
  },
  in_progress: {
    bg: 'bg-card',
    border: 'border-l-blue-400',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    headerText: 'text-blue-600',
    headerDot: 'bg-blue-400',
  },
  done: {
    bg: 'bg-card',
    border: 'border-l-emerald-400',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    headerText: 'text-emerald-600',
    headerDot: 'bg-emerald-400',
  },
}

export function MyTasksDashboard() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { members, assignments, taskDetails, updateTaskDetail } = useResourceStore()
  const tasks = useTaskStore((s) => s.tasks)
  const statusDate = useProjectStore((s) => s.currentProject?.status_date)

  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [cardDetailId, setCardDetailId] = useState<string | null>(null)
  const [hideDone, setHideDone] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // 현재 사용자에 매칭되는 멤버 찾기 (email 우선, name 폴백)
  const myMember = useMemo(() => {
    if (!currentUser) return null
    return (
      members.find((m) => m.email && m.email === currentUser.email) ||
      members.find((m) => m.name === currentUser.name) ||
      null
    )
  }, [currentUser, members])

  // 내게 배정된 작업 ID 목록
  const myTaskIds = useMemo(() => {
    if (!myMember) return new Set<string>()
    return new Set(
      assignments.filter((a) => a.member_id === myMember.id).map((a) => a.task_id)
    )
  }, [myMember, assignments])

  // 내 카드 목록 생성
  const myCards: MyCard[] = useMemo(() => {
    if (!myMember) return []
    const cards: MyCard[] = []
    const taskMap = new Map(tasks.map((t) => [t.id, t]))

    // 배정된 작업별로 세부항목 수집
    const taskIdsWithDetails = new Set<string>()

    for (const taskId of myTaskIds) {
      const task = taskMap.get(taskId)
      if (!task) continue

      // 해당 작업의 세부항목 중 나에게 관련된 것
      const details = taskDetails.filter((d) => d.task_id === taskId)

      if (details.length > 0) {
        taskIdsWithDetails.add(taskId)
        for (const detail of details) {
          // assignee가 나이거나, assignee 없는 세부항목도 포함
          const isMyDetail =
            !detail.assignee_id && (!detail.assignee_ids || detail.assignee_ids.length === 0) ||
            detail.assignee_id === myMember.id ||
            detail.assignee_ids?.includes(myMember.id)

          if (isMyDetail) {
            cards.push({ type: 'detail', detail, task })
          }
        }
      }
    }

    // 세부항목이 없는 배정 작업도 카드로 표시
    for (const taskId of myTaskIds) {
      if (taskIdsWithDetails.has(taskId)) continue
      const task = taskMap.get(taskId)
      if (!task || task.is_group) continue
      cards.push({ type: 'task', task })
    }

    return cards
  }, [myMember, myTaskIds, taskDetails, tasks])

  // 검색 + 기간 필터
  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return myCards.filter((card) => {
      // 키워드 필터
      if (q) {
        const title = card.type === 'detail' ? card.detail.title : card.task.task_name
        const taskName = card.task.task_name
        const desc = card.type === 'detail' ? (card.detail.description || '') : ''
        if (![title, taskName, desc].some((s) => s.toLowerCase().includes(q))) return false
      }
      // 기간 필터
      const dueDate = card.type === 'detail' ? card.detail.due_date : card.task.planned_end
      if (filterFrom && dueDate && dueDate < filterFrom) return false
      if (filterTo && dueDate && dueDate > filterTo) return false
      return true
    })
  }, [myCards, searchQuery, filterFrom, filterTo])

  // 상태별 그룹핑
  const grouped = useMemo(() => {
    const result = { todo: [] as MyCard[], in_progress: [] as MyCard[], done: [] as MyCard[] }
    for (const card of filteredCards) {
      if (card.type === 'detail') {
        result[card.detail.status].push(card)
      } else {
        const p = card.task.actual_progress
        if (p >= 1) result.done.push(card)
        else if (p > 0) result.in_progress.push(card)
        else result.todo.push(card)
      }
    }
    return result
  }, [filteredCards])

  const total = filteredCards.length
  const todoCount = grouped.todo.length
  const inProgressCount = grouped.in_progress.length
  const doneCount = grouped.done.length
  const progressPercent = total > 0 ? Math.round((doneCount / total) * 100) : 0

  // 지연 판정
  const isOverdue = useCallback(
    (dueDate?: string) => {
      if (!dueDate) return false
      const ref = statusDate || new Date().toISOString().slice(0, 10)
      return dueDate < ref
    },
    [statusDate]
  )

  const isTaskOverdue = useCallback(
    (task: Task) => {
      if (!task.planned_end) return false
      const ref = statusDate || new Date().toISOString().slice(0, 10)
      return task.planned_end < ref && task.actual_progress < 1
    },
    [statusDate]
  )

  const toggleExpand = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleStatusChange = (detailId: string, newStatus: 'todo' | 'in_progress' | 'done') => {
    updateTaskDetail(detailId, { status: newStatus })
  }

  const handleCheckboxClick = (detailId: string, currentStatus: string) => {
    if (currentStatus === 'done') {
      handleStatusChange(detailId, 'todo')
    } else {
      handleStatusChange(detailId, 'done')
    }
  }

  const handleDescriptionChange = (detailId: string, description: string) => {
    updateTaskDetail(detailId, { description })
  }

  // ─── 빈 상태 ───
  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-3 py-20">
        <User className="h-10 w-10" />
        <p className="text-sm">로그인 후 이용할 수 있습니다</p>
      </div>
    )
  }

  if (myCards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-3 py-20">
        <ClipboardList className="h-10 w-10" />
        <p className="text-sm">배정된 업무가 없습니다</p>
        <p className="text-xs text-muted-foreground/30">
          담당자 탭에서 작업을 배정받으면 여기에 표시됩니다
        </p>
      </div>
    )
  }

  // ─── 카드 렌더 ───
  const renderCard = (card: MyCard) => {
    if (card.type === 'detail') {
      return renderDetailCard(card)
    }
    return renderTaskOnlyCard(card)
  }

  const renderDetailCard = (card: MyDetailCard) => {
    const { detail, task } = card
    const colors = STATUS_COLORS[detail.status]
    const overdue = detail.status !== 'done' && isOverdue(detail.due_date)
    const isExpanded = expandedCards.has(detail.id)
    const assigneeNames = (detail.assignee_ids || (detail.assignee_id ? [detail.assignee_id] : []))
      .map((id) => members.find((m) => m.id === id)?.name)
      .filter(Boolean)

    return (
      <div
        key={detail.id}
        className={cn(
          'rounded-lg border border-border/40 border-l-[3px] shadow-sm transition-all hover:shadow-md cursor-pointer',
          colors.bg,
          colors.border,
          overdue && 'ring-1 ring-red-300 border-l-red-500'
        )}
      >
        {/* 소속 작업명 + 상세 열기 */}
        <div className="px-3 pt-2 pb-0.5 flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground font-medium truncate flex-1">
            {task.wbs_code} {task.task_name}
          </span>
          <button
            className="flex-shrink-0 text-muted-foreground/40 hover:text-primary transition-colors"
            onClick={(e) => { e.stopPropagation(); setEditTaskId(task.id) }}
            title="작업 상세 열기"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>

        {/* 메인 영역 */}
        <div className="flex items-start gap-2 px-3 pb-1.5">
          <button
            className="flex-shrink-0 mt-0.5"
            onClick={(e) => {
              e.stopPropagation()
              handleCheckboxClick(detail.id, detail.status)
            }}
          >
            {detail.status === 'done' ? (
              <CheckSquare className="h-4.5 w-4.5 text-emerald-500" />
            ) : (
              <Square className="h-4.5 w-4.5 text-muted-foreground/60 hover:text-primary" />
            )}
          </button>

          <div className="flex-1 min-w-0" onClick={() => setCardDetailId(detail.id)}>
            <span
              className={cn(
                'text-sm font-semibold leading-snug text-foreground hover:text-primary/80 transition-colors',
                detail.status === 'done' && 'line-through text-muted-foreground'
              )}
            >
              {detail.title}
            </span>
          </div>

          <Select
            value={detail.status}
            onValueChange={(v) => handleStatusChange(detail.id, v as 'todo' | 'in_progress' | 'done')}
          >
            <SelectTrigger
              className={cn(
                'h-6 w-[65px] text-[11px] border border-border/40 bg-white shadow-none px-1.5 flex-shrink-0 font-medium',
                detail.status === 'todo' && 'text-amber-700',
                detail.status === 'in_progress' && 'text-blue-700',
                detail.status === 'done' && 'text-emerald-700'
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <SelectValue>{STATUS_LABELS[detail.status]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">대기</SelectItem>
              <SelectItem value="in_progress">진행중</SelectItem>
              <SelectItem value="done">완료</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 일정 정보 */}
        <div className="px-3 pb-1.5 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          {/* 등록일 */}
          <span className="flex items-center gap-1 text-muted-foreground/60">
            <CalendarPlus className="h-3 w-3" />
            등록 {format(new Date(detail.created_at), 'MM/dd')}
          </span>
          {/* 기한 */}
          {detail.due_date && (
            <span className={cn('flex items-center gap-1', overdue ? 'text-red-600 font-semibold' : '')}>
              <Clock className="h-3 w-3" />
              기한 {detail.due_date}
              {overdue && <AlertTriangle className="h-3 w-3" />}
            </span>
          )}
          {/* 완료일 */}
          {detail.completed_at && (
            <span className="flex items-center gap-1 text-emerald-600">
              <CalendarCheck2 className="h-3 w-3" />
              완료 {format(new Date(detail.completed_at), 'MM/dd HH:mm')}
            </span>
          )}
          {/* 진행 시작일 */}
          {detail.started_at && !detail.completed_at && (
            <span className="flex items-center gap-1 text-blue-600">
              시작 {format(new Date(detail.started_at), 'MM/dd')}
            </span>
          )}
        </div>
        {/* 담당자 + 메모 미리보기 */}
        <div className="px-3 pb-2 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          {assigneeNames.length > 0 && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {assigneeNames.join(', ')}
            </span>
          )}
          {detail.description && !isExpanded && (
            <span className="truncate max-w-[150px] italic text-muted-foreground/70">{detail.description.split('\n')[0]}</span>
          )}
        </div>

        {/* 확장 영역: 메모 편집 */}
        {isExpanded && (
          <div className="px-3 pb-2.5 border-t border-border/30">
            <textarea
              ref={(el) => {
                if (el) { el.style.height = 'auto'; el.style.height = Math.max(60, el.scrollHeight) + 'px' }
              }}
              placeholder="메모를 입력하세요..."
              value={detail.description || ''}
              onChange={(e) => {
                handleDescriptionChange(detail.id, e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.max(60, e.target.scrollHeight) + 'px'
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-sm text-foreground bg-white border border-border rounded-md px-3 py-2 resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/40 mt-2 overflow-hidden"
              style={{ minHeight: 60 }}
            />
          </div>
        )}
      </div>
    )
  }

  const renderTaskOnlyCard = (card: MyTaskCard) => {
    const { task } = card
    const overdue = isTaskOverdue(task)
    const progress = Math.round(task.actual_progress * 100)
    const status = progress >= 100 ? 'done' : progress > 0 ? 'in_progress' : 'todo'
    const colors = STATUS_COLORS[status]

    return (
      <div
        key={`task-${task.id}`}
        className={cn(
          'rounded-lg border border-border/40 border-l-[3px] shadow-sm transition-all hover:shadow-md',
          colors.bg,
          colors.border,
          overdue && 'ring-1 ring-red-300 border-l-red-500'
        )}
      >
        <div className="px-3 pt-2 pb-0.5 flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground font-medium flex-1">{task.wbs_code}</span>
          <button
            className="flex-shrink-0 text-muted-foreground/40 hover:text-primary transition-colors"
            onClick={(e) => { e.stopPropagation(); setEditTaskId(task.id) }}
            title="작업 상세 열기"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
        <div className="px-3 pb-1.5">
          <span className="text-sm font-semibold text-foreground">{task.task_name}</span>
        </div>
        <div className="px-3 pb-2 flex items-center gap-2">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[11px] font-semibold text-foreground tabular-nums">{progress}%</span>
        </div>
        <div className="px-3 pb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          {task.planned_start && task.planned_end && (
            <span className={cn('flex items-center gap-1', overdue && 'text-red-600 font-semibold')}>
              <Clock className="h-3 w-3" />
              {task.planned_start} ~ {task.planned_end}
              {overdue && <AlertTriangle className="h-3 w-3" />}
            </span>
          )}
        </div>
      </div>
    )
  }

  // ─── 컬럼 렌더 ───
  const renderColumn = (
    title: string,
    status: 'todo' | 'in_progress' | 'done',
    cards: MyCard[],
    count: number
  ) => {
    const colors = STATUS_COLORS[status]
    return (
      <div className="flex flex-col min-w-0 flex-1">
        {/* 컬럼 헤더 */}
        <div className="px-3 py-2 flex items-center gap-2 border-b border-border/30">
          <div className={cn('w-2 h-2 rounded-full', colors.headerDot)} />
          <span className={cn('text-xs font-semibold', colors.headerText)}>{title}</span>
          <span className="text-[10px] text-muted-foreground/50 font-medium">{count}</span>
        </div>
        {/* 카드 목록 */}
        <div className="flex-1 bg-muted/10 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
          {cards.length === 0 && (
            <div className="text-center text-[11px] text-muted-foreground/30 py-6">
              항목 없음
            </div>
          )}
          {cards.map(renderCard)}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 상단 요약 + 검색/필터 */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-border/30 bg-background space-y-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">내 업무</span>
          </div>
          <span className="text-xs text-muted-foreground">
            총 {total}개 · 대기 {todoCount} · 진행 {inProgressCount} · 완료 {doneCount}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="text-xs font-medium text-primary tabular-nums">{progressPercent}%</span>
          </div>
        </div>
        {/* 검색 + 기간 + 완료숨기기 */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
            <Input
              placeholder="키워드 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-8 text-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">기간</span>
            <DatePicker value={filterFrom} onChange={setFilterFrom} placeholder="시작" className="h-8 text-xs w-[130px]" />
            <span className="text-xs text-muted-foreground">~</span>
            <DatePicker value={filterTo} onChange={setFilterTo} placeholder="종료" className="h-8 text-xs w-[130px]" />
            {(filterFrom || filterTo) && (
              <button onClick={() => { setFilterFrom(''); setFilterTo('') }} className="text-xs text-muted-foreground hover:text-primary">초기화</button>
            )}
          </div>
          <div className="ml-auto">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="w-3.5 h-3.5 rounded accent-primary" />
              <span className="text-xs text-muted-foreground">완료 숨기기</span>
            </label>
          </div>
        </div>
      </div>

      {/* 칸반 컬럼 */}
      <div className="flex-1 overflow-auto p-4">
        <div className={cn("grid grid-cols-1 gap-4 h-full", hideDone ? "md:grid-cols-2" : "md:grid-cols-3")}>
          {renderColumn('대기', 'todo', grouped.todo, todoCount)}
          {renderColumn('진행중', 'in_progress', grouped.in_progress, inProgressCount)}
          {!hideDone && renderColumn('완료', 'done', grouped.done, doneCount)}
        </div>
      </div>

      {/* 작업 상세 다이얼로그 (PM용) */}
      <TaskEditDialog
        taskId={editTaskId}
        open={!!editTaskId}
        onClose={() => setEditTaskId(null)}
      />

      {/* 카드 상세 모달 (실무자용) */}
      <CardDetailModal
        detailId={cardDetailId}
        open={!!cardDetailId}
        onClose={() => setCardDetailId(null)}
      />
    </div>
  )
}
