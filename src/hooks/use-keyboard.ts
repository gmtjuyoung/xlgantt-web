import { useEffect, useCallback } from 'react'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { recalculateWBSCodes } from '@/lib/wbs'

/**
 * 글로벌 키보드 단축키 훅.
 *
 * - Enter: 선택 작업 아래에 새 작업 추가
 * - Delete / Backspace: 선택 작업 삭제
 * - Tab: 들여쓰기 (indent)
 * - Shift+Tab: 내어쓰기 (outdent)
 * - ArrowUp: 이전 작업 선택
 * - ArrowDown: 다음 작업 선택
 * - Ctrl+D: 선택 작업 복제
 * - Escape: 선택 해제
 *
 * Ctrl+Z / Ctrl+Y는 use-undo-redo.ts에서 처리하므로 여기서 제외.
 */
export function useKeyboard() {
  /** 현재 단일 선택된 taskId를 반환. 다중 선택이면 null. */
  const getSelectedId = useCallback((): string | null => {
    const { selectedTaskIds } = useTaskStore.getState()
    if (selectedTaskIds.size !== 1) return null
    return Array.from(selectedTaskIds)[0]
  }, [])

  /** 표시 순서대로 정렬된 tasks */
  const getSortedTasks = useCallback(() => {
    const { tasks } = useTaskStore.getState()
    return [...tasks].sort((a, b) => a.sort_order - b.sort_order)
  }, [])

  /** visible tasks (collapsed 그룹의 자식 제외) */
  const getVisibleSortedTasks = useCallback(() => {
    const sorted = getSortedTasks()
    const collapsedCodes = new Set<string>()
    return sorted.filter((task) => {
      const isHidden = Array.from(collapsedCodes).some((code) =>
        task.wbs_code.startsWith(code + '.')
      )
      if (isHidden) return false
      if (task.is_group && task.is_collapsed) {
        collapsedCodes.add(task.wbs_code)
      }
      return true
    })
  }, [getSortedTasks])

  /** WBS 재계산 후 setTasks */
  const recalcWBS = useCallback(() => {
    setTimeout(() => {
      const currentTasks = useTaskStore.getState().tasks
      const recalculated = recalculateWBSCodes(currentTasks)
      useTaskStore.getState().setTasks(recalculated)
    }, 0)
  }, [])

  /** Enter: 아래에 새 작업 추가 */
  const handleAddBelow = useCallback(() => {
    const taskId = getSelectedId()
    if (!taskId) return
    const project = useProjectStore.getState().currentProject
    if (!project) return

    const { tasks, addTask, selectTask } = useTaskStore.getState()
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((t) => t.id === taskId)
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
  }, [getSelectedId, recalcWBS])

  /** Delete / Backspace: 삭제 */
  const handleDelete = useCallback(() => {
    const { selectedTaskIds, deleteTask, clearSelection } = useTaskStore.getState()
    if (selectedTaskIds.size === 0) return

    // 선택된 모든 작업 삭제
    const ids = Array.from(selectedTaskIds)
    for (const id of ids) {
      deleteTask(id)
    }
    clearSelection()
    recalcWBS()
  }, [recalcWBS])

  /** Tab: 들여쓰기 */
  const handleIndent = useCallback(() => {
    const taskId = getSelectedId()
    if (!taskId) return

    const { tasks, updateTask } = useTaskStore.getState()
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.wbs_level >= 6) return

    const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((t) => t.id === taskId)
    if (index <= 0) return

    const prevTask = sorted[index - 1]
    updateTask(taskId, {
      wbs_level: task.wbs_level + 1,
      parent_id: prevTask.id,
    })
    if (!prevTask.is_group) {
      updateTask(prevTask.id, { is_group: true })
    }
    recalcWBS()
  }, [getSelectedId, recalcWBS])

  /** Shift+Tab: 내어쓰기 */
  const handleOutdent = useCallback(() => {
    const taskId = getSelectedId()
    if (!taskId) return

    const { tasks, updateTask } = useTaskStore.getState()
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.wbs_level <= 1) return

    const parent = task.parent_id
      ? tasks.find((t) => t.id === task.parent_id)
      : null

    updateTask(taskId, {
      wbs_level: task.wbs_level - 1,
      parent_id: parent?.parent_id || undefined,
    })
    recalcWBS()
  }, [getSelectedId, recalcWBS])

  /** ArrowUp: 이전 작업 선택 */
  const handleMoveUp = useCallback(() => {
    const taskId = getSelectedId()
    const visible = getVisibleSortedTasks()
    if (visible.length === 0) return

    if (!taskId) {
      // 아무것도 선택 안 됨 -> 마지막 작업 선택
      useTaskStore.getState().selectTask(visible[visible.length - 1].id)
      return
    }

    const index = visible.findIndex((t) => t.id === taskId)
    if (index > 0) {
      useTaskStore.getState().selectTask(visible[index - 1].id)
    }
  }, [getSelectedId, getVisibleSortedTasks])

  /** ArrowDown: 다음 작업 선택 */
  const handleMoveDown = useCallback(() => {
    const taskId = getSelectedId()
    const visible = getVisibleSortedTasks()
    if (visible.length === 0) return

    if (!taskId) {
      // 아무것도 선택 안 됨 -> 첫 번째 작업 선택
      useTaskStore.getState().selectTask(visible[0].id)
      return
    }

    const index = visible.findIndex((t) => t.id === taskId)
    if (index < visible.length - 1) {
      useTaskStore.getState().selectTask(visible[index + 1].id)
    }
  }, [getSelectedId, getVisibleSortedTasks])

  /** Ctrl+D: 선택 작업 복제 */
  const handleDuplicate = useCallback(() => {
    const taskId = getSelectedId()
    if (!taskId) return
    const project = useProjectStore.getState().currentProject
    if (!project) return

    const { tasks, addTask, selectTask } = useTaskStore.getState()
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((t) => t.id === taskId)
    const nextTask = index < sorted.length - 1 ? sorted[index + 1] : null
    const newSortOrder = nextTask
      ? Math.floor((task.sort_order + nextTask.sort_order) / 2)
      : task.sort_order + 1000

    const newTask = {
      ...task,
      id: crypto.randomUUID(),
      sort_order: newSortOrder,
      wbs_code: '',
      task_name: `${task.task_name} (복사)`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    addTask(newTask)
    selectTask(newTask.id)
    recalcWBS()
  }, [getSelectedId, recalcWBS])

  /** +: 그룹 펼치기 */
  const handleExpand = useCallback(() => {
    const taskId = getSelectedId()
    if (!taskId) return
    const { tasks, updateTask } = useTaskStore.getState()
    const task = tasks.find((t) => t.id === taskId)
    if (task?.is_group && task.is_collapsed) {
      updateTask(taskId, { is_collapsed: false })
    }
  }, [getSelectedId])

  /** -: 그룹 접기 */
  const handleCollapse = useCallback(() => {
    const taskId = getSelectedId()
    if (!taskId) return
    const { tasks, updateTask } = useTaskStore.getState()
    const task = tasks.find((t) => t.id === taskId)
    if (task?.is_group && !task.is_collapsed) {
      updateTask(taskId, { is_collapsed: true })
    }
  }, [getSelectedId])

  /** Escape: 선택 해제 */
  const handleEscape = useCallback(() => {
    useTaskStore.getState().clearSelection()
  }, [])

  // 글로벌 키보드 이벤트 등록
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isCtrl = e.ctrlKey || e.metaKey
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      // input/textarea/contentEditable 포커스 시:
      //   - Ctrl 조합 키는 처리 (Ctrl+D 등)
      //   - 그 외 단축키는 무시
      if (isInput && !isCtrl) return

      // Ctrl+Z/Y는 use-undo-redo.ts에서 처리하므로 스킵
      if (isCtrl && (e.key === 'z' || e.key === 'y' || e.key === 'Z')) return

      // 다이얼로그/모달이 열려있으면 무시 (data-state="open" 체크)
      const hasOpenDialog = document.querySelector('[role="dialog"][data-state="open"]')
      if (hasOpenDialog) return

      switch (e.key) {
        case 'Enter':
          if (!isCtrl && !isInput) {
            e.preventDefault()
            handleAddBelow()
          }
          break

        case 'Delete':
        case 'Backspace':
          if (!isCtrl && !isInput) {
            e.preventDefault()
            handleDelete()
          }
          break

        case 'Tab':
          if (!isInput) {
            e.preventDefault()
            if (e.shiftKey) {
              handleOutdent()
            } else {
              handleIndent()
            }
          }
          break

        case 'ArrowUp':
          if (!isInput) {
            e.preventDefault()
            handleMoveUp()
          }
          break

        case 'ArrowDown':
          if (!isInput) {
            e.preventDefault()
            handleMoveDown()
          }
          break

        case 'd':
        case 'D':
          if (isCtrl) {
            e.preventDefault()
            handleDuplicate()
          }
          break

        case 'Escape':
          handleEscape()
          break

        case '+':
        case '=':
          if (!isInput) {
            e.preventDefault()
            handleExpand()
          }
          break

        case '-':
        case '_':
          if (!isInput) {
            e.preventDefault()
            handleCollapse()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    handleAddBelow,
    handleDelete,
    handleIndent,
    handleOutdent,
    handleMoveUp,
    handleMoveDown,
    handleDuplicate,
    handleEscape,
    handleExpand,
    handleCollapse,
  ])
}
