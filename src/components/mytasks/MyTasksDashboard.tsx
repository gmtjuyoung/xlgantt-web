import { useState, useMemo, useCallback } from 'react'
import {
  CheckSquare,
  Square,
  Clock,
  AlertTriangle,
  ClipboardList,
  User,
  Search,
  X,
  CalendarPlus,
  CalendarCheck2,
  ExternalLink,
  Plus,
  Trash2,
} from 'lucide-react'
import { format } from 'date-fns'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { useResourceStore } from '@/stores/resource-store'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import type { CustomStatus } from '@/stores/project-store'
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

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  todo: '대기',
  in_progress: '진행중',
  done: '완료',
}

const DEFAULT_STATUS_COLORS: Record<string, {
  bg: string; border: string; badge: string; headerText: string; headerDot: string
}> = {
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

// 커스텀 상태용 색상 매핑
const CUSTOM_COLOR_MAP: Record<string, {
  bg: string; border: string; badge: string; headerText: string; headerDot: string
}> = {
  purple: {
    bg: 'bg-card', border: 'border-l-purple-400', badge: 'bg-purple-100 text-purple-700 border-purple-200',
    headerText: 'text-purple-600', headerDot: 'bg-purple-400',
  },
  pink: {
    bg: 'bg-card', border: 'border-l-pink-400', badge: 'bg-pink-100 text-pink-700 border-pink-200',
    headerText: 'text-pink-600', headerDot: 'bg-pink-400',
  },
  orange: {
    bg: 'bg-card', border: 'border-l-orange-400', badge: 'bg-orange-100 text-orange-700 border-orange-200',
    headerText: 'text-orange-600', headerDot: 'bg-orange-400',
  },
  red: {
    bg: 'bg-card', border: 'border-l-red-400', badge: 'bg-red-100 text-red-700 border-red-200',
    headerText: 'text-red-600', headerDot: 'bg-red-400',
  },
  teal: {
    bg: 'bg-card', border: 'border-l-teal-400', badge: 'bg-teal-100 text-teal-700 border-teal-200',
    headerText: 'text-teal-600', headerDot: 'bg-teal-400',
  },
  indigo: {
    bg: 'bg-card', border: 'border-l-indigo-400', badge: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    headerText: 'text-indigo-600', headerDot: 'bg-indigo-400',
  },
  cyan: {
    bg: 'bg-card', border: 'border-l-cyan-400', badge: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    headerText: 'text-cyan-600', headerDot: 'bg-cyan-400',
  },
}

const AVAILABLE_COLORS = ['purple', 'pink', 'orange', 'red', 'teal', 'indigo', 'cyan']

function getStatusColors(status: string, customStatuses: CustomStatus[]) {
  if (DEFAULT_STATUS_COLORS[status]) return DEFAULT_STATUS_COLORS[status]
  const custom = customStatuses.find((cs) => cs.id === status)
  if (custom && CUSTOM_COLOR_MAP[custom.color]) return CUSTOM_COLOR_MAP[custom.color]
  return CUSTOM_COLOR_MAP['purple'] // fallback
}

export function MyTasksDashboard() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { members, assignments, taskDetails, updateTaskDetail } = useResourceStore()
  const tasks = useTaskStore((s) => s.tasks)
  const statusDate = useProjectStore((s) => s.currentProject?.status_date)
  const currentProject = useProjectStore((s) => s.currentProject)
  const customStatuses = useProjectStore((s) => s.customStatuses)
  const addCustomStatus = useProjectStore((s) => s.addCustomStatus)
  const removeCustomStatus = useProjectStore((s) => s.removeCustomStatus)
  const projectMembers = useProjectStore((s) => s.projectMembers)

  const [expandedCards] = useState<Set<string>>(new Set())
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [cardDetailId, setCardDetailId] = useState<string | null>(null)
  const [hideDone, setHideDone] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // Drag & Drop state
  const [dragCardId, setDragCardId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)

  // 커스텀 상태 추가 다이얼로그
  const [showAddStatus, setShowAddStatus] = useState(false)
  const [newStatusLabel, setNewStatusLabel] = useState('')
  const [newStatusColor, setNewStatusColor] = useState('purple')

  // 현재 프로젝트의 커스텀 상태
  const projectCustomStatuses = useMemo(() => {
    if (!currentProject) return []
    return customStatuses.filter((cs) => cs.projectId === currentProject.id)
  }, [customStatuses, currentProject])

  // 전체 상태 목록 (기본 + 커스텀)
  const allStatuses = useMemo(() => {
    const base = [
      { key: 'todo', label: '대기' },
      { key: 'in_progress', label: '진행중' },
    ]
    // 커스텀 상태는 '진행중'과 '완료' 사이에 삽입
    for (const cs of projectCustomStatuses) {
      base.push({ key: cs.id, label: cs.label })
    }
    base.push({ key: 'done', label: '완료' })
    return base
  }, [projectCustomStatuses])

  // 전체 상태 라벨 매핑
  const allStatusLabels = useMemo(() => {
    const labels: Record<string, string> = { ...DEFAULT_STATUS_LABELS }
    for (const cs of projectCustomStatuses) {
      labels[cs.id] = cs.label
    }
    return labels
  }, [projectCustomStatuses])

  // 현재 사용자가 PM/owner인지 확인
  const canManageStatuses = useMemo(() => {
    if (!currentUser || !currentProject) return false
    // owner는 항상 가능
    if (currentProject.owner_id === currentUser.id) return true
    // pm/editor도 가능
    const myRole = projectMembers.find(
      (m) => m.projectId === currentProject.id && m.userId === currentUser.id
    )?.role
    return myRole === 'owner' || myRole === 'pm' || myRole === 'editor'
  }, [currentUser, currentProject, projectMembers])

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

  // 카드의 상태 키를 반환 (기본 3개 또는 커스텀 상태)
  const getCardStatus = useCallback((card: MyCard): string => {
    if (card.type === 'detail') {
      return card.detail.status
    }
    const p = card.task.actual_progress
    if (p >= 1) return 'done'
    if (p > 0) return 'in_progress'
    return 'todo'
  }, [])

  // 상태별 그룹핑 (커스텀 상태 포함)
  const grouped = useMemo(() => {
    const result: Record<string, MyCard[]> = {}
    for (const s of allStatuses) {
      result[s.key] = []
    }
    for (const card of filteredCards) {
      const status = getCardStatus(card)
      if (result[status]) {
        result[status].push(card)
      } else {
        // 커스텀 상태가 삭제된 경우 → todo로 폴백
        result['todo']?.push(card)
      }
    }
    return result
  }, [filteredCards, allStatuses, getCardStatus])

  const total = filteredCards.length
  const doneCount = grouped['done']?.length || 0
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

  const handleStatusChange = (detailId: string, newStatus: string) => {
    updateTaskDetail(detailId, { status: newStatus as 'todo' | 'in_progress' | 'done' })
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

  // ─── Drag & Drop handlers ───
  const handleDragStart = (e: React.DragEvent, card: MyCard) => {
    const cardId = card.type === 'detail' ? card.detail.id : `task-${card.task.id}`
    setDragCardId(cardId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify({
      cardId,
      cardType: card.type,
      detailId: card.type === 'detail' ? card.detail.id : null,
      taskId: card.task.id,
      currentStatus: getCardStatus(card),
    }))
    // 드래그 이미지 투명도는 CSS로 처리
  }

  const handleDragEnd = () => {
    setDragCardId(null)
    setDragOverColumn(null)
  }

  const handleColumnDragOver = (e: React.DragEvent, statusKey: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumn(statusKey)
  }

  const handleColumnDragLeave = (e: React.DragEvent) => {
    // relatedTarget이 컬럼 밖인 경우에만 해제
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverColumn(null)
    }
  }

  const handleColumnDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault()
    setDragOverColumn(null)
    setDragCardId(null)

    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'))
      if (data.currentStatus === targetStatus) return // 같은 컬럼이면 무시

      if (data.cardType === 'detail' && data.detailId) {
        // detail 카드: status 직접 변경
        handleStatusChange(data.detailId, targetStatus)
      }
      // task-only 카드는 드래그로 상태 변경 지원하지 않음 (progress 기반이므로)
    } catch {
      // ignore parse errors
    }
  }

  // ─── 커스텀 상태 추가 ───
  const handleAddCustomStatus = () => {
    if (!newStatusLabel.trim() || !currentProject) return
    addCustomStatus(currentProject.id, newStatusLabel.trim(), newStatusColor)
    setNewStatusLabel('')
    setNewStatusColor('purple')
    setShowAddStatus(false)
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
    const statusKey = detail.status
    const colors = getStatusColors(statusKey, projectCustomStatuses)
    const overdue = statusKey !== 'done' && isOverdue(detail.due_date)
    const isExpanded = expandedCards.has(detail.id)
    const assigneeNames = (detail.assignee_ids || (detail.assignee_id ? [detail.assignee_id] : []))
      .map((id) => members.find((m) => m.id === id)?.name)
      .filter(Boolean)
    const isDragging = dragCardId === detail.id

    return (
      <div
        key={detail.id}
        draggable="true"
        onDragStart={(e) => handleDragStart(e, card)}
        onDragEnd={handleDragEnd}
        className={cn(
          'rounded-lg border border-border/40 border-l-[3px] shadow-sm transition-all hover:shadow-md cursor-pointer',
          colors.bg,
          colors.border,
          overdue && 'ring-1 ring-red-300 border-l-red-500',
          isDragging && 'opacity-40'
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
            onValueChange={(v) => v && handleStatusChange(detail.id, v)}
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
              <SelectValue>{allStatusLabels[detail.status] || detail.status}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {allStatuses.map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
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
    const colors = getStatusColors(status, projectCustomStatuses)

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
    statusKey: string,
    cards: MyCard[],
    count: number,
    isCustom?: boolean,
    customStatusId?: string,
  ) => {
    const colors = getStatusColors(statusKey, projectCustomStatuses)
    const isDropTarget = dragOverColumn === statusKey && dragCardId !== null
    return (
      <div
        className={cn(
          'flex flex-col min-w-0 flex-1 rounded-lg transition-all',
          isDropTarget && 'ring-2 ring-primary bg-primary/5'
        )}
        onDragOver={(e) => handleColumnDragOver(e, statusKey)}
        onDragLeave={handleColumnDragLeave}
        onDrop={(e) => handleColumnDrop(e, statusKey)}
      >
        {/* 컬럼 헤더 */}
        <div className="px-3 py-2 flex items-center gap-2 border-b border-border/30">
          <div className={cn('w-2 h-2 rounded-full', colors.headerDot)} />
          <span className={cn('text-xs font-semibold', colors.headerText)}>{title}</span>
          <span className="text-[10px] text-muted-foreground/50 font-medium">{count}</span>
          {isCustom && canManageStatuses && customStatusId && (
            <button
              className="ml-auto text-muted-foreground/40 hover:text-red-500 transition-colors"
              onClick={() => removeCustomStatus(customStatusId)}
              title="상태 삭제"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
        {/* 카드 목록 */}
        <div className="flex-1 bg-muted/10 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
          {cards.length === 0 && (
            <div className="text-center text-[11px] text-muted-foreground/30 py-6">
              {isDropTarget ? '여기에 놓기' : '항목 없음'}
            </div>
          )}
          {cards.map(renderCard)}
        </div>
      </div>
    )
  }

  // 통계 계산
  const statsSummary = allStatuses.map((s) => {
    const cnt = grouped[s.key]?.length || 0
    return `${s.label} ${cnt}`
  }).join(' · ')

  // grid 컬럼 수 계산
  const visibleStatuses = allStatuses.filter((s) => !(hideDone && s.key === 'done'))

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
            총 {total}개 · {statsSummary}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="text-xs font-medium text-primary tabular-nums">{progressPercent}%</span>
          </div>
        </div>
        {/* 검색 + 기간 + 완료숨기기 + 상태추가 */}
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
          <div className="flex items-center gap-2 ml-auto">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="w-3.5 h-3.5 rounded accent-primary" />
              <span className="text-xs text-muted-foreground">완료 숨기기</span>
            </label>
            {canManageStatuses && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setShowAddStatus(true)}
              >
                <Plus className="h-3 w-3" />
                상태 추가
              </Button>
            )}
          </div>
        </div>

        {/* 커스텀 상태 추가 인라인 폼 */}
        {showAddStatus && (
          <div className="flex items-center gap-2 pt-1 border-t border-border/20">
            <Input
              placeholder="상태 이름..."
              value={newStatusLabel}
              onChange={(e) => setNewStatusLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomStatus() }}
              className="h-7 text-xs w-[140px]"
              autoFocus
            />
            <div className="flex items-center gap-1">
              {AVAILABLE_COLORS.map((c) => (
                <button
                  key={c}
                  className={cn(
                    'w-5 h-5 rounded-full border-2 transition-all',
                    newStatusColor === c ? 'border-foreground scale-110' : 'border-transparent'
                  )}
                  style={{ backgroundColor: `var(--color-${c}-400, ${c})` }}
                  onClick={() => setNewStatusColor(c)}
                  title={c}
                >
                  <span className={cn('block w-full h-full rounded-full', `bg-${c}-400`)} />
                </button>
              ))}
            </div>
            <Button size="sm" className="h-7 px-2 text-xs" onClick={handleAddCustomStatus} disabled={!newStatusLabel.trim()}>
              추가
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowAddStatus(false)}>
              취소
            </Button>
          </div>
        )}
      </div>

      {/* 칸반 컬럼 */}
      <div className="flex-1 overflow-auto p-4">
        <div
          className="grid grid-cols-1 gap-4 h-full"
          style={{ gridTemplateColumns: `repeat(${visibleStatuses.length}, minmax(0, 1fr))` }}
        >
          {visibleStatuses.map((s) => {
            const isCustom = !DEFAULT_STATUS_LABELS[s.key]
            return renderColumn(
              s.label,
              s.key,
              grouped[s.key] || [],
              grouped[s.key]?.length || 0,
              isCustom,
              isCustom ? s.key : undefined,
            )
          })}
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
