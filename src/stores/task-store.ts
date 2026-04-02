import { create } from 'zustand'
import type { Task, Dependency, CalendarType } from '@/lib/types'
import { countWorkingDays } from '@/lib/calendar-calc'
import { parseISO } from 'date-fns'
import { useUndoStore } from '@/stores/undo-store'
import { recalculateWBSCodes } from '@/lib/wbs'
import { useCalendarStore } from '@/stores/calendar-store'
import { useActivityStore } from '@/stores/activity-store'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectStore } from '@/stores/project-store'

function logTaskActivity(params: {
  action: 'create' | 'update' | 'delete' | 'complete' | 'status_change'
  targetType: 'task' | 'detail' | 'assignment' | 'dependency'
  targetId: string
  targetName: string
  parentTaskName?: string
  details?: string
}) {
  const user = useAuthStore.getState().currentUser
  const projectId = useProjectStore.getState().currentProject?.id || ''
  queueMicrotask(() => {
    useActivityStore.getState().addLog({
      userId: user?.id || 'system',
      userName: user?.name || '시스템',
      projectId,
      ...params,
    })
  })
}

/** 특정 달력 타입에 맞는 holiday set과 workingDays를 가져와서 기간 계산 */
function calcDuration(start?: string, end?: string, calType: CalendarType = 'STD'): number | undefined {
  if (!start || !end) return undefined
  const calStore = useCalendarStore.getState()
  const holidaySet = calStore.getHolidaySet(calType)
  const workDays = calStore.getWorkingDaysFor(calType)
  return countWorkingDays(parseISO(start), parseISO(end), workDays, holidaySet)
}

/** 그룹 작업의 날짜/기간/작업량을 자식 기준으로 갱신 */
function rollupGroupDates(tasks: Task[], changedTaskId: string): Task[] {
  const changedTask = tasks.find((t) => t.id === changedTaskId)
  if (!changedTask) return tasks

  // 직속 부모 찾기: wbs_code prefix가 일치하는 그룹 중 가장 가까운 (wbs_level이 가장 높은)
  const parentCandidates = tasks.filter((t) => {
    if (!t.is_group || t.wbs_level >= changedTask.wbs_level) return false
    return changedTask.wbs_code.startsWith(t.wbs_code + '.')
  })
  // wbs_level 내림차순 → 가장 가까운 부모가 첫 번째
  const parentTask = parentCandidates.sort((a, b) => b.wbs_level - a.wbs_level)[0] || null

  if (!parentTask) return tasks

  // 해당 부모의 직계 자식 찾기 (한 레벨 아래)
  const directChildren = tasks.filter(
    (t) => t.id !== parentTask.id &&
      t.wbs_code.startsWith(parentTask.wbs_code + '.') &&
      t.wbs_level === parentTask.wbs_level + 1
  )

  // 모든 리프 자식 (간접 포함)
  const allChildren = tasks.filter(
    (t) => t.id !== parentTask.id && t.wbs_code.startsWith(parentTask.wbs_code + '.')
  )
  const leafChildren = allChildren.filter((t) => !t.is_group)

  if (allChildren.length === 0) return tasks

  // 날짜: MIN/MAX
  const starts = allChildren.map((t) => t.planned_start).filter(Boolean) as string[]
  const ends = allChildren.map((t) => t.planned_end).filter(Boolean) as string[]
  const minStart = starts.length > 0 ? starts.sort()[0] : parentTask.planned_start
  const maxEnd = ends.length > 0 ? ends.sort().reverse()[0] : parentTask.planned_end

  // 기간
  const duration = calcDuration(minStart, maxEnd)

  // 작업량: 리프 자식 합계
  const totalWorkload = leafChildren.reduce((sum, t) => sum + (t.total_workload || 0), 0)

  const updated = tasks.map((t) =>
    t.id === parentTask.id
      ? {
          ...t,
          planned_start: minStart,
          planned_end: maxEnd,
          total_duration: duration,
          total_workload: totalWorkload || t.total_workload,
        }
      : t
  )

  // 재귀: 부모의 부모도 갱신
  return rollupGroupDates(updated, parentTask.id)
}

interface TaskState {
  tasks: Task[]
  dependencies: Dependency[]
  selectedTaskIds: Set<string>
  editingCell: { taskId: string; field: string } | null
  isLoading: boolean

  // Task CRUD
  setTasks: (tasks: Task[]) => void
  addTask: (task: Task) => void
  updateTask: (taskId: string, changes: Partial<Task>) => void
  deleteTask: (taskId: string) => void
  toggleCollapse: (taskId: string) => void

  // Dependencies
  setDependencies: (deps: Dependency[]) => void
  addDependency: (dep: Dependency) => void
  removeDependency: (depId: string) => void

  // Selection
  selectTask: (taskId: string, multi?: boolean) => void
  clearSelection: () => void

  // Reorder (drag & drop)
  reorderTask: (taskId: string, targetIndex: number, targetParentId?: string) => void

  // Editing
  startEditing: (taskId: string, field: string) => void
  stopEditing: () => void

  setLoading: (loading: boolean) => void

  /** Undo/Redo 복원 전용 - 스냅샷 저장 없이 상태 교체 */
  _restoreFromSnapshot: (tasks: Task[], dependencies: Dependency[]) => void
}

/** 현재 tasks/dependencies 스냅샷을 undo 스택에 저장 */
function pushCurrentSnapshot() {
  const { tasks, dependencies } = useTaskStore.getState()
  useUndoStore.getState().pushSnapshot({ tasks, dependencies })
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  dependencies: [],
  selectedTaskIds: new Set(),
  editingCell: null,
  isLoading: false,

  setTasks: (inTasks) => {
    // 기간 자동 계산
    let tasks = inTasks.map((t) => ({
      ...t,
      total_duration: t.total_duration ?? calcDuration(t.planned_start, t.planned_end),
    }))

    // 그룹 작업 롤업: 리프 작업부터 상위로 (높은 wbs_level부터)
    const groups = tasks.filter((t) => t.is_group).sort((a, b) => b.wbs_level - a.wbs_level)
    for (const group of groups) {
      const allChildren = tasks.filter(
        (t) => t.id !== group.id && t.wbs_code.startsWith(group.wbs_code + '.')
      )
      const leafChildren = allChildren.filter((t) => !t.is_group)
      if (allChildren.length === 0) continue

      const starts = allChildren.map((t) => t.planned_start).filter(Boolean) as string[]
      const ends = allChildren.map((t) => t.planned_end).filter(Boolean) as string[]
      const minStart = starts.length > 0 ? starts.sort()[0] : group.planned_start
      const maxEnd = ends.length > 0 ? ends.sort().reverse()[0] : group.planned_end
      const duration = calcDuration(minStart, maxEnd)
      const totalWorkload = leafChildren.reduce((sum, t) => sum + (t.total_workload || 0), 0)

      tasks = tasks.map((t) =>
        t.id === group.id
          ? { ...t, planned_start: minStart, planned_end: maxEnd, total_duration: duration, total_workload: totalWorkload || t.total_workload }
          : t
      )
    }

    set({ tasks })
  },

  addTask: (task) => {
    pushCurrentSnapshot()
    set((state) => ({ tasks: [...state.tasks, task] }))
    logTaskActivity({
      action: 'create',
      targetType: 'task',
      targetId: task.id,
      targetName: task.name,
      details: `작업 '${task.name}' 추가`,
    })
  },

  updateTask: (taskId, changes) => {
    const beforeTask = useTaskStore.getState().tasks.find((t) => t.id === taskId)
    pushCurrentSnapshot()
    set((state) => {
      // 1. 기본 업데이트 적용
      let tasks = state.tasks.map((t) => {
        if (t.id !== taskId) return t
        const updated = { ...t, ...changes }

        // 2. 날짜가 변경되면 기간(근무일수) 자동 계산
        const start = changes.planned_start ?? t.planned_start
        const end = changes.planned_end ?? t.planned_end
        if (changes.planned_start !== undefined || changes.planned_end !== undefined) {
          updated.total_duration = calcDuration(start, end)
        }

        return updated
      })

      // 3. 그룹 작업 롤업 (자식의 날짜/작업량 변경 시 부모 갱신)
      const changedTask = tasks.find((t) => t.id === taskId)
      const needsRollup = changes.planned_start !== undefined ||
        changes.planned_end !== undefined ||
        changes.total_workload !== undefined
      if (changedTask && !changedTask.is_group && needsRollup) {
        tasks = rollupGroupDates(tasks, taskId)
      }

      return { tasks }
    })
    // 진척률 변경 시만 로그
    if (beforeTask && changes.progress !== undefined && changes.progress !== beforeTask.progress) {
      logTaskActivity({
        action: changes.progress === 100 ? 'complete' : 'update',
        targetType: 'task',
        targetId: taskId,
        targetName: beforeTask.name,
        details: `진척률 ${beforeTask.progress ?? 0}% → ${changes.progress}%`,
      })
    }
  },

  deleteTask: (taskId) => {
    const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
    pushCurrentSnapshot()
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
      dependencies: state.dependencies.filter(
        (d) => d.predecessor_id !== taskId && d.successor_id !== taskId
      ),
    }))
    if (task) {
      logTaskActivity({
        action: 'delete',
        targetType: 'task',
        targetId: taskId,
        targetName: task.name,
        details: `작업 '${task.name}' 삭제`,
      })
    }
  },

  toggleCollapse: (taskId) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, is_collapsed: !t.is_collapsed } : t
      ),
    })),

  setDependencies: (dependencies) => set({ dependencies }),

  addDependency: (dep) => {
    pushCurrentSnapshot()
    set((state) => ({
      dependencies: [...state.dependencies, dep],
    }))
  },

  removeDependency: (depId) => {
    pushCurrentSnapshot()
    set((state) => ({
      dependencies: state.dependencies.filter((d) => d.id !== depId),
    }))
  },

  reorderTask: (taskId, targetIndex, targetParentId) => {
    pushCurrentSnapshot()
    set((state) => {
      const sorted = [...state.tasks].sort((a, b) => a.sort_order - b.sort_order)
      const task = sorted.find((t) => t.id === taskId)
      if (!task) return state

      // Collect the task and all its descendants (for group tasks)
      const movingIds = new Set<string>([taskId])
      if (task.is_group) {
        for (const t of sorted) {
          if (t.id !== taskId && t.wbs_code.startsWith(task.wbs_code + '.')) {
            movingIds.add(t.id)
          }
        }
      }

      // Separate moving tasks from remaining
      const movingTasks = sorted.filter((t) => movingIds.has(t.id))
      const remaining = sorted.filter((t) => !movingIds.has(t.id))

      // Clamp target index
      const clampedIndex = Math.max(0, Math.min(targetIndex, remaining.length))

      // Insert moving tasks at target position
      const reordered = [
        ...remaining.slice(0, clampedIndex),
        ...movingTasks,
        ...remaining.slice(clampedIndex),
      ]

      // Reassign sort_order with gaps of 1000
      let tasks = reordered.map((t, i) => ({
        ...t,
        sort_order: (i + 1) * 1000,
      }))

      // If targetParentId changed, update parent_id and wbs_level for the dragged task
      if (targetParentId !== undefined) {
        const newParent = targetParentId ? tasks.find((t) => t.id === targetParentId) : null
        const newLevel = newParent ? newParent.wbs_level + 1 : 1
        const levelDiff = newLevel - task.wbs_level

        tasks = tasks.map((t) => {
          if (movingIds.has(t.id)) {
            return {
              ...t,
              wbs_level: t.wbs_level + levelDiff,
              parent_id: t.id === taskId ? (targetParentId || undefined) : t.parent_id,
            }
          }
          return t
        })
      }

      // Recalculate WBS codes
      tasks = recalculateWBSCodes(tasks)

      return { tasks }
    })
  },

  selectTask: (taskId, multi = false) =>
    set((state) => {
      const newSelection = new Set(multi ? state.selectedTaskIds : [])
      if (newSelection.has(taskId)) {
        newSelection.delete(taskId)
      } else {
        newSelection.add(taskId)
      }
      return { selectedTaskIds: newSelection }
    }),

  clearSelection: () => set({ selectedTaskIds: new Set() }),

  startEditing: (taskId, field) =>
    set({ editingCell: { taskId, field } }),

  stopEditing: () => set({ editingCell: null }),

  setLoading: (isLoading) => set({ isLoading }),

  _restoreFromSnapshot: (tasks, dependencies) =>
    set({ tasks, dependencies }),
}))
