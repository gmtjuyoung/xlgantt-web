import { useEffect, useRef, useCallback } from 'react'
import {
  FileEdit,
  Indent,
  Outdent,
  Trash2,
  ArrowUpFromLine,
  ArrowDownFromLine,
  Copy,
  ClipboardPaste,
} from 'lucide-react'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'

export interface ContextMenuState {
  taskId: string
  x: number
  y: number
}

interface GanttContextMenuProps {
  menu: ContextMenuState
  onClose: () => void
  onOpenEdit: (taskId: string) => void
}

export function GanttContextMenu({ menu, onClose, onOpenEdit }: GanttContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const { tasks, addTask, deleteTask, updateTask, setTasks, selectTask, copiedTask, copyTask, pasteTask } = useTaskStore()
  const project = useProjectStore((s) => s.currentProject)

  const task = tasks.find((t) => t.id === menu.taskId)

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Adjust position so menu doesn't overflow viewport
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    if (rect.right > vw) {
      menuRef.current.style.left = `${menu.x - rect.width}px`
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${menu.y - rect.height}px`
    }
  }, [menu.x, menu.y])

  // WBS 코드 재계산
  const recalcWBS = useCallback(() => {
    setTimeout(() => {
      const currentTasks = useTaskStore.getState().tasks
      const sorted = [...currentTasks].sort((a, b) => a.sort_order - b.sort_order)
      const counters: Record<string, number> = {}

      const updated = sorted.map((t) => {
        const parentCode = t.parent_id
          ? sorted.find((p) => p.id === t.parent_id)?.wbs_code || ''
          : ''
        const key = parentCode || 'root'
        counters[key] = (counters[key] || 0) + 1
        const newCode = parentCode
          ? `${parentCode}.${counters[key]}`
          : String(counters[key])

        return { ...t, wbs_code: newCode }
      })

      setTasks(updated)
    }, 0)
  }, [setTasks])

  // 작업 편집
  const handleEdit = useCallback(() => {
    onOpenEdit(menu.taskId)
    onClose()
  }, [menu.taskId, onOpenEdit, onClose])

  // 위에 작업 추가
  const handleAddAbove = useCallback(() => {
    if (!project || !task) return

    const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((t) => t.id === task.id)

    const prevTask = index > 0 ? sorted[index - 1] : null
    const newSortOrder = prevTask
      ? Math.floor((prevTask.sort_order + task.sort_order) / 2)
      : task.sort_order - 1000

    const newTask = {
      id: crypto.randomUUID(),
      project_id: project.id,
      sort_order: newSortOrder,
      wbs_code: '',
      wbs_level: task.wbs_level,
      is_group: false,
      task_name: '새 작업',
      calendar_type: 'STD' as const,
      planned_progress: 0,
      actual_progress: 0,
      is_milestone: false,
      parent_id: task.parent_id,
      is_collapsed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    addTask(newTask)
    selectTask(newTask.id)
    recalcWBS()
    onClose()
  }, [project, task, tasks, addTask, selectTask, recalcWBS, onClose])

  // 아래에 작업 추가
  const handleAddBelow = useCallback(() => {
    if (!project || !task) return

    const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((t) => t.id === task.id)

    const nextTask = index < sorted.length - 1 ? sorted[index + 1] : null
    const newSortOrder = nextTask
      ? Math.floor((task.sort_order + nextTask.sort_order) / 2)
      : task.sort_order + 1000

    const newTask = {
      id: crypto.randomUUID(),
      project_id: project.id,
      sort_order: newSortOrder,
      wbs_code: '',
      wbs_level: task.wbs_level,
      is_group: false,
      task_name: '새 작업',
      calendar_type: 'STD' as const,
      planned_progress: 0,
      actual_progress: 0,
      is_milestone: false,
      parent_id: task.parent_id,
      is_collapsed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    addTask(newTask)
    selectTask(newTask.id)
    recalcWBS()
    onClose()
  }, [project, task, tasks, addTask, selectTask, recalcWBS, onClose])

  // 들여쓰기
  const handleIndent = useCallback(() => {
    if (!task || task.wbs_level >= 6) return
    const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((t) => t.id === task.id)
    if (index <= 0) return

    const prevTask = sorted[index - 1]

    updateTask(task.id, {
      wbs_level: task.wbs_level + 1,
      parent_id: prevTask.id,
    })
    if (!prevTask.is_group) {
      updateTask(prevTask.id, { is_group: true })
    }
    recalcWBS()
    onClose()
  }, [task, tasks, updateTask, recalcWBS, onClose])

  // 내어쓰기
  const handleOutdent = useCallback(() => {
    if (!task || task.wbs_level <= 1) return

    const parent = task.parent_id
      ? tasks.find((t) => t.id === task.parent_id)
      : null

    updateTask(task.id, {
      wbs_level: task.wbs_level - 1,
      parent_id: parent?.parent_id || undefined,
    })
    recalcWBS()
    onClose()
  }, [task, tasks, updateTask, recalcWBS, onClose])

  // 작업 복사
  const handleCopy = useCallback(() => {
    if (!task) return
    copyTask(task.id)
    onClose()
  }, [task, copyTask, onClose])

  // 아래에 붙여넣기
  const handlePaste = useCallback(() => {
    if (!task) return
    pasteTask(task.id, 'below')
    recalcWBS()
    onClose()
  }, [task, pasteTask, recalcWBS, onClose])

  // 작업 삭제
  const handleDelete = useCallback(() => {
    if (!task) return
    if (!confirm('선택한 작업을 삭제하시겠습니까?')) return
    deleteTask(task.id)
    recalcWBS()
    onClose()
  }, [task, deleteTask, recalcWBS, onClose])

  // 컨텍스트 메뉴 내 키보드 단축키 (Tab, Delete 등)
  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        handleIndent()
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        handleOutdent()
      } else if (e.key === 'Delete') {
        e.preventDefault()
        handleDelete()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        handleEdit()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault()
        handleCopy()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault()
        handlePaste()
      }
    }
    document.addEventListener('keydown', handleShortcut, true)
    return () => document.removeEventListener('keydown', handleShortcut, true)
  }, [handleIndent, handleOutdent, handleDelete, handleEdit, handleCopy, handlePaste])

  if (!task) return null

  const canIndent = task.wbs_level < 6 && (() => {
    const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((t) => t.id === task.id)
    return index > 0
  })()
  const canOutdent = task.wbs_level > 1

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[200px] rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 animate-in fade-in-0 zoom-in-95"
      style={{ left: menu.x, top: menu.y }}
    >
      {/* 작업 편집 */}
      <MenuItem icon={FileEdit} label="작업 편집" shortcut="더블클릭" onClick={handleEdit} />

      <MenuSeparator />

      {/* 복사/붙여넣기 */}
      <MenuItem icon={Copy} label="복사" shortcut="Ctrl+C" onClick={handleCopy} />
      <MenuItem icon={ClipboardPaste} label="붙여넣기" shortcut="Ctrl+V" onClick={handlePaste} disabled={!copiedTask} />

      <MenuSeparator />

      {/* 위에/아래 작업 추가 */}
      <MenuItem icon={ArrowUpFromLine} label="위에 작업 추가" onClick={handleAddAbove} />
      <MenuItem icon={ArrowDownFromLine} label="아래에 작업 추가" onClick={handleAddBelow} />

      <MenuSeparator />

      {/* 들여쓰기/내어쓰기 */}
      <MenuItem icon={Indent} label="들여쓰기" shortcut="Tab" onClick={handleIndent} disabled={!canIndent} />
      <MenuItem icon={Outdent} label="내어쓰기" shortcut="Shift+Tab" onClick={handleOutdent} disabled={!canOutdent} />

      <MenuSeparator />

      {/* 작업 삭제 */}
      <MenuItem icon={Trash2} label="작업 삭제" onClick={handleDelete} variant="destructive" />
    </div>
  )
}

// --- Sub-components ---

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled,
  variant,
}: {
  icon: React.ElementType
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'destructive'
}) {
  const isDestructive = variant === 'destructive'

  return (
    <button
      className={`relative flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none transition-colors
        ${disabled
          ? 'pointer-events-none opacity-50'
          : isDestructive
            ? 'text-destructive hover:bg-destructive/10 focus:bg-destructive/10'
            : 'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground'
        }`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="ml-auto text-xs tracking-widest text-muted-foreground">
          {shortcut}
        </span>
      )}
    </button>
  )
}

function MenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-border" />
}
