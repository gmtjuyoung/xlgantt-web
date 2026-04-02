import { useRef } from 'react'
import {
  Plus,
  Trash2,
  Indent,
  Outdent,
  ArrowUp,
  ArrowDown,
  FileEdit,
  Search,
  X,
  Undo2,
  Redo2,
  TrendingUp,
  CalendarCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { useUIStore, type FilterStatus } from '@/stores/ui-store'
import { useUndoRedo } from '@/hooks/use-undo-redo'
import { ColumnSettingsDropdown } from './ColumnSettingsDropdown'
import { recalculateWBSCodes } from '@/lib/wbs'

interface GanttToolbarProps {
  onOpenTaskDialog: (taskId: string) => void
  onScrollToToday?: () => void
}

export function GanttToolbar({ onOpenTaskDialog, onScrollToToday }: GanttToolbarProps) {
  const { tasks, selectedTaskIds, addTask, deleteTask, updateTask, setTasks } = useTaskStore()
  const project = useProjectStore((s) => s.currentProject)
  const { searchQuery, filterStatus, setSearchQuery, setFilterStatus, showProgressLine, toggleProgressLine } = useUIStore()
  const { canUndo, canRedo, undo, redo } = useUndoRedo()
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selectedId = selectedTaskIds.size === 1 ? Array.from(selectedTaskIds)[0] : null
  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) : null
  const hasSelection = selectedTaskIds.size > 0

  // 작업 추가 (선택된 작업 아래에)
  const handleAddTask = () => {
    if (!project) return

    const selectedIndex = selectedTask
      ? tasks.findIndex((t) => t.id === selectedTask.id)
      : tasks.length - 1

    const prevTask = tasks[selectedIndex]
    const nextTask = tasks[selectedIndex + 1]

    const newSortOrder = prevTask
      ? nextTask
        ? Math.floor((prevTask.sort_order + nextTask.sort_order) / 2)
        : prevTask.sort_order + 1000
      : 1000

    const newLevel = selectedTask ? selectedTask.wbs_level : 1

    const newTask = {
      id: crypto.randomUUID(),
      project_id: project.id,
      sort_order: newSortOrder,
      wbs_code: '',
      wbs_level: newLevel,
      is_group: false,
      task_name: '새 작업',
      calendar_type: 'STD' as const,
      planned_progress: 0,
      actual_progress: 0,
      is_milestone: false,
      parent_id: selectedTask?.parent_id,
      is_collapsed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    addTask(newTask)
    // 자동으로 WBS 코드 재계산
    recalcWBS()
  }

  // 작업 삭제
  const handleDeleteTask = () => {
    if (!hasSelection) return
    if (!confirm('선택한 작업을 삭제하시겠습니까?')) return
    for (const id of selectedTaskIds) {
      deleteTask(id)
    }
  }

  // 들여쓰기 (레벨 증가)
  const handleIndent = () => {
    if (!selectedTask || selectedTask.wbs_level >= 6) return
    const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((t) => t.id === selectedTask.id)
    if (index <= 0) return

    const prevTask = sorted[index - 1]

    updateTask(selectedTask.id, {
      wbs_level: selectedTask.wbs_level + 1,
      parent_id: prevTask.id,
    })
    // Mark parent as group
    if (!prevTask.is_group) {
      updateTask(prevTask.id, { is_group: true })
    }
    recalcWBS()
  }

  // 내어쓰기 (레벨 감소)
  const handleOutdent = () => {
    if (!selectedTask || selectedTask.wbs_level <= 1) return

    const parent = selectedTask.parent_id
      ? tasks.find((t) => t.id === selectedTask.parent_id)
      : null

    updateTask(selectedTask.id, {
      wbs_level: selectedTask.wbs_level - 1,
      parent_id: parent?.parent_id || undefined,
    })
    recalcWBS()
  }

  // 위로 이동
  const handleMoveUp = () => {
    if (!selectedTask) return
    const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((t) => t.id === selectedTask.id)
    if (index <= 0) return

    const prevTask = sorted[index - 1]
    const tempOrder = selectedTask.sort_order

    updateTask(selectedTask.id, { sort_order: prevTask.sort_order })
    updateTask(prevTask.id, { sort_order: tempOrder })
    recalcWBS()
  }

  // 아래로 이동
  const handleMoveDown = () => {
    if (!selectedTask) return
    const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((t) => t.id === selectedTask.id)
    if (index >= sorted.length - 1) return

    const nextTask = sorted[index + 1]
    const tempOrder = selectedTask.sort_order

    updateTask(selectedTask.id, { sort_order: nextTask.sort_order })
    updateTask(nextTask.id, { sort_order: tempOrder })
    recalcWBS()
  }

  // 작업 상세 편집 다이얼로그
  const handleEditTask = () => {
    if (!selectedId) return
    onOpenTaskDialog(selectedId)
  }

  // WBS 코드 재계산
  const recalcWBS = () => {
    setTimeout(() => {
      const currentTasks = useTaskStore.getState().tasks
      const updated = recalculateWBSCodes(currentTasks)
      setTasks(updated)
    }, 0)
  }

  const ToolbarButton = ({
    icon: Icon,
    label,
    onClick,
    disabled,
  }: {
    icon: React.ElementType
    label: string
    onClick: () => void
    disabled?: boolean
  }) => (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )

  return (
    <div className="flex items-center h-10 px-4 border-b border-border/40 bg-gradient-to-b from-muted/10 to-muted/30 gap-1">
      <ToolbarButton icon={Undo2} label="실행 취소 (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
      <ToolbarButton icon={Redo2} label="다시 실행 (Ctrl+Y)" onClick={redo} disabled={!canRedo} />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton icon={Plus} label="작업 추가 (Enter)" onClick={handleAddTask} />
      <ToolbarButton icon={Trash2} label="작업 삭제 (Delete)" onClick={handleDeleteTask} disabled={!hasSelection} />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton icon={Indent} label="들여쓰기 (Tab)" onClick={handleIndent} disabled={!selectedTask} />
      <ToolbarButton icon={Outdent} label="내어쓰기 (Shift+Tab)" onClick={handleOutdent} disabled={!selectedTask || (selectedTask?.wbs_level ?? 0) <= 1} />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton icon={ArrowUp} label="위로 이동" onClick={handleMoveUp} disabled={!selectedTask} />
      <ToolbarButton icon={ArrowDown} label="아래로 이동" onClick={handleMoveDown} disabled={!selectedTask} />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton icon={FileEdit} label="작업 상세 편집" onClick={handleEditTask} disabled={!selectedId} />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        variant={showProgressLine ? 'default' : 'ghost'}
        size="icon"
        className="h-8 w-8"
        onClick={toggleProgressLine}
        title="Progress Line 표시/숨기기"
      >
        <TrendingUp className="h-4 w-4" />
      </Button>

      <ToolbarButton icon={CalendarCheck} label="오늘로 이동" onClick={() => onScrollToToday?.()} />

      {/* 선택 정보 */}
      {selectedTask && (
        <span className="text-xs text-muted-foreground ml-3">
          선택: [{selectedTask.wbs_code}] {selectedTask.task_name}
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* 컬럼 설정 */}
      <ColumnSettingsDropdown />

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* 필터 드롭다운 */}
      <select
        value={filterStatus}
        onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
        className="h-7 text-xs border border-border rounded-md bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="all">전체</option>
        <option value="delayed">지연</option>
        <option value="completed">완료</option>
        <option value="in_progress">진행중</option>
      </select>

      {/* 검색 입력창 */}
      <div className="relative flex items-center ml-2">
        <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={searchInputRef}
          type="text"
          placeholder="작업명 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSearchQuery('')
              searchInputRef.current?.blur()
            }
          }}
          className="h-7 w-48 pl-7 pr-7 text-xs"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-1.5 p-0.5 rounded-sm hover:bg-muted"
            title="검색 초기화 (ESC)"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  )
}
