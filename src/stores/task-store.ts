import { create } from 'zustand'
import type { Task, Dependency, CalendarType, DependencyType } from '@/lib/types'
import { countWorkingDays } from '@/lib/calendar-calc'
import { parseISO } from 'date-fns'
import { useUndoStore } from '@/stores/undo-store'
import { recalculateWBSCodes } from '@/lib/wbs'
import { useCalendarStore } from '@/stores/calendar-store'
import { useActivityStore } from '@/stores/activity-store'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectStore } from '@/stores/project-store'
import { supabase } from '@/lib/supabase'

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

  // 진척률: 작업량 가중 평균
  const weightedProgress = totalWorkload > 0
    ? leafChildren.reduce((sum, t) => sum + (t.actual_progress * (t.total_workload || 0)), 0) / totalWorkload
    : leafChildren.length > 0
      ? leafChildren.reduce((sum, t) => sum + t.actual_progress, 0) / leafChildren.length
      : 0

  const updated = tasks.map((t) =>
    t.id === parentTask.id
      ? {
          ...t,
          planned_start: minStart,
          planned_end: maxEnd,
          total_duration: duration,
          total_workload: totalWorkload || t.total_workload,
          actual_progress: weightedProgress,
        }
      : t
  )

  // 재귀: 부모의 부모도 갱신
  return rollupGroupDates(updated, parentTask.id)
}

/** DB row → 로컬 Task 변환 */
function dbToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    sort_order: (row.sort_order as number) ?? 0,
    wbs_code: (row.wbs_code as string) || '',
    wbs_level: (row.wbs_level as number) ?? 1,
    is_group: (row.is_group as boolean) ?? false,
    task_name: (row.task_name as string) || '',
    remarks: (row.remarks as string) || undefined,
    planned_start: (row.planned_start as string) || undefined,
    planned_end: (row.planned_end as string) || undefined,
    actual_start: (row.actual_start as string) || undefined,
    actual_end: (row.actual_end as string) || undefined,
    total_workload: row.total_workload != null ? Number(row.total_workload) : undefined,
    planned_workload: row.planned_workload != null ? Number(row.planned_workload) : undefined,
    actual_workload: row.actual_workload != null ? Number(row.actual_workload) : undefined,
    total_duration: row.total_duration != null ? Number(row.total_duration) : undefined,
    planned_duration: row.planned_duration != null ? Number(row.planned_duration) : undefined,
    actual_duration: row.actual_duration != null ? Number(row.actual_duration) : undefined,
    calendar_type: (row.calendar_type as CalendarType) || 'STD',
    resource_count: row.resource_count != null ? Number(row.resource_count) : undefined,
    deliverables: (row.deliverables as string) || undefined,
    planned_progress: Number(row.planned_progress ?? 0),
    actual_progress: Number(row.actual_progress ?? 0),
    is_milestone: (row.is_milestone as boolean) ?? false,
    parent_id: (row.parent_id as string) || undefined,
    is_collapsed: (row.is_collapsed as boolean) ?? false,
    archived_at: (row.archived_at as string) || undefined,
    archived_by: (row.archived_by as string) || undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

/** 로컬 Task → DB insert/update용 객체 */
function taskToDb(t: Task): Record<string, unknown> {
  return {
    id: t.id,
    project_id: t.project_id,
    sort_order: t.sort_order,
    wbs_code: t.wbs_code,
    wbs_level: t.wbs_level,
    is_group: t.is_group,
    task_name: t.task_name,
    remarks: t.remarks || null,
    planned_start: t.planned_start || null,
    planned_end: t.planned_end || null,
    actual_start: t.actual_start || null,
    actual_end: t.actual_end || null,
    total_workload: t.total_workload ?? null,
    planned_workload: t.planned_workload ?? null,
    actual_workload: t.actual_workload ?? null,
    total_duration: t.total_duration ?? null,
    planned_duration: t.planned_duration ?? null,
    actual_duration: t.actual_duration ?? null,
    calendar_type: t.calendar_type,
    resource_count: t.resource_count ?? null,
    deliverables: t.deliverables || null,
    planned_progress: t.planned_progress,
    actual_progress: t.actual_progress,
    is_milestone: t.is_milestone,
    parent_id: t.parent_id || null,
    is_collapsed: t.is_collapsed,
  }
}

/** DB row → 로컬 Dependency 변환 */
function dbToDep(row: Record<string, unknown>): Dependency {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    predecessor_id: row.predecessor_id as string,
    successor_id: row.successor_id as string,
    dep_type: ((row.dep_type as number) ?? 1) as DependencyType,
    lag_days: (row.lag_days as number) ?? 0,
    created_at: row.created_at as string,
  }
}

/** 로컬 Dependency → DB insert용 객체 */
function depToDb(d: Dependency): Record<string, unknown> {
  return {
    id: d.id,
    project_id: d.project_id,
    predecessor_id: d.predecessor_id,
    successor_id: d.successor_id,
    dep_type: d.dep_type,
    lag_days: d.lag_days,
  }
}

interface TaskState {
  tasks: Task[]
  dependencies: Dependency[]
  selectedTaskIds: Set<string>
  lastSelectedId: string | null  // Shift+클릭 범위 선택 기준점
  editingCell: { taskId: string; field: string } | null
  isLoading: boolean

  // Load from Supabase
  loadTasks: (projectId: string) => Promise<void>
  loadDependencies: (projectId: string) => Promise<void>

  // Task CRUD
  setTasks: (tasks: Task[]) => void
  addTask: (task: Task) => void
  updateTask: (taskId: string, changes: Partial<Task>) => void
  deleteTask: (taskId: string) => void
  archiveTask: (taskId: string) => void
  restoreTask: (taskId: string) => void
  purgeTask: (taskId: string) => void  // 아카이브된 것 영구 삭제
  toggleCollapse: (taskId: string) => void

  // Dependencies
  setDependencies: (deps: Dependency[]) => void
  addDependency: (dep: Dependency) => void
  removeDependency: (depId: string) => void

  // Selection
  selectTask: (taskId: string, mode?: 'single' | 'toggle' | 'range') => void
  clearSelection: () => void

  // Reorder (drag & drop)
  reorderTask: (taskId: string, targetIndex: number, targetParentId?: string) => void

  // Editing
  startEditing: (taskId: string, field: string) => void
  stopEditing: () => void

  setLoading: (loading: boolean) => void

  /** Undo/Redo 복원 전용 - 스냅샷 저장 없이 상태 교체 */
  _restoreFromSnapshot: (tasks: Task[], dependencies: Dependency[]) => void

  /** 자동 계산 전용 - undo 스냅샷 없이 작업 업데이트 (DB 저장은 수행) */
  _updateTaskSilent: (taskId: string, changes: Partial<Task>) => void
}

/** 현재 tasks/dependencies 스냅샷을 undo 스택에 저장 */
function pushCurrentSnapshot() {
  const { tasks, dependencies } = useTaskStore.getState()
  useUndoStore.getState().pushSnapshot({ tasks, dependencies })
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  dependencies: [],
  selectedTaskIds: new Set(),
  lastSelectedId: null,
  editingCell: null,
  isLoading: false,

  loadTasks: async (projectId) => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
    if (error) {
      console.error('작업 로드 실패:', error.message)
    } else if (data) {
      const tasks = data.map(dbToTask)
      // setTasks를 통해 duration 계산 및 롤업 수행
      get().setTasks(tasks)
    }
    set({ isLoading: false })
  },

  loadDependencies: async (projectId) => {
    const { data, error } = await supabase
      .from('dependencies')
      .select('*')
      .eq('project_id', projectId)
    if (error) {
      console.error('의존관계 로드 실패:', error.message)
    } else if (data) {
      set({ dependencies: data.map(dbToDep) })
    }
  },

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

      // 진척률: 작업량 가중 평균
      const weightedProgress = totalWorkload > 0
        ? leafChildren.reduce((sum, t) => sum + (t.actual_progress * (t.total_workload || 0)), 0) / totalWorkload
        : leafChildren.length > 0
          ? leafChildren.reduce((sum, t) => sum + t.actual_progress, 0) / leafChildren.length
          : 0

      tasks = tasks.map((t) =>
        t.id === group.id
          ? { ...t, planned_start: minStart, planned_end: maxEnd, total_duration: duration, total_workload: totalWorkload || t.total_workload, actual_progress: weightedProgress }
          : t
      )
    }

    set({ tasks })
  },

  addTask: (task) => {
    pushCurrentSnapshot()
    // 낙관적 업데이트
    set((state) => ({ tasks: [...state.tasks, task] }))
    logTaskActivity({
      action: 'create',
      targetType: 'task',
      targetId: task.id,
      targetName: task.task_name,
      details: `작업 '${task.task_name}' 추가`,
    })
    // 서버 저장 (비동기)
    supabase.from('tasks').insert(taskToDb(task)).then(({ error }) => {
      if (error) console.error('작업 추가 실패:', error.message)
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
    if (beforeTask && changes.actual_progress !== undefined && changes.actual_progress !== beforeTask.actual_progress) {
      logTaskActivity({
        action: changes.actual_progress === 100 ? 'complete' : 'update',
        targetType: 'task',
        targetId: taskId,
        targetName: beforeTask.task_name,
        details: `진척률 ${beforeTask.actual_progress ?? 0}% → ${changes.actual_progress}%`,
      })
    }
    // 서버 업데이트 (비동기) - 변경된 필드만 전송
    const dbChanges: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(changes)) {
      dbChanges[key] = value ?? null
    }
    supabase.from('tasks').update(dbChanges).eq('id', taskId).then(({ error }) => {
      if (error) console.error('작업 업데이트 실패:', error.message)
    })
  },

  // 기본 deleteTask는 archiveTask로 위임 (하위 호환)
  // UI 쪽에서 진행 여부 판단 후 archiveTask/purgeTask 직접 호출 권장
  deleteTask: (taskId) => {
    useTaskStore.getState().archiveTask(taskId)
  },

  archiveTask: (taskId) => {
    const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
    if (!task) return
    pushCurrentSnapshot()
    const now = new Date().toISOString()
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, archived_at: now } : t
      ),
    }))
    logTaskActivity({
      action: 'update',
      targetType: 'task',
      targetId: taskId,
      targetName: task.task_name,
      details: `작업 '${task.task_name}' 아카이브`,
    })
    supabase.from('tasks').update({ archived_at: now }).eq('id', taskId).then(({ error }) => {
      if (error) console.error('작업 아카이브 실패:', error.message)
    })
  },

  restoreTask: (taskId) => {
    const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
    if (!task) return
    pushCurrentSnapshot()
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, archived_at: undefined, archived_by: undefined } : t
      ),
    }))
    logTaskActivity({
      action: 'update',
      targetType: 'task',
      targetId: taskId,
      targetName: task.task_name,
      details: `작업 '${task.task_name}' 복원`,
    })
    supabase.from('tasks').update({ archived_at: null, archived_by: null }).eq('id', taskId).then(({ error }) => {
      if (error) console.error('작업 복원 실패:', error.message)
    })
  },

  purgeTask: (taskId) => {
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
        targetName: task.task_name,
        details: `작업 '${task.task_name}' 영구 삭제`,
      })
    }
    supabase.from('tasks').delete().eq('id', taskId).then(({ error }) => {
      if (error) console.error('작업 영구 삭제 실패:', error.message)
    })
  },

  toggleCollapse: (taskId) => {
    const current = get().tasks.find((t) => t.id === taskId)
    const newCollapsed = !current?.is_collapsed
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, is_collapsed: newCollapsed } : t
      ),
    }))
    supabase.from('tasks').update({ is_collapsed: newCollapsed }).eq('id', taskId)
      .then(({ error }) => { if (error) console.error('접기 상태 저장 실패:', error.message) })
  },

  setDependencies: (dependencies) => set({ dependencies }),

  addDependency: (dep) => {
    pushCurrentSnapshot()
    set((state) => ({
      dependencies: [...state.dependencies, dep],
    }))
    // 서버 저장 (비동기)
    supabase.from('dependencies').insert(depToDb(dep)).then(({ error }) => {
      if (error) console.error('의존관계 추가 실패:', error.message)
    })
  },

  removeDependency: (depId) => {
    pushCurrentSnapshot()
    set((state) => ({
      dependencies: state.dependencies.filter((d) => d.id !== depId),
    }))
    // 서버 삭제 (비동기)
    supabase.from('dependencies').delete().eq('id', depId).then(({ error }) => {
      if (error) console.error('의존관계 삭제 실패:', error.message)
    })
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

      // 서버에 sort_order, wbs_code, wbs_level, parent_id 일괄 업데이트 (비동기)
      Promise.all(
        tasks.map((t) =>
          supabase.from('tasks').update({
            sort_order: t.sort_order,
            wbs_code: t.wbs_code,
            wbs_level: t.wbs_level,
            parent_id: t.parent_id || null,
          }).eq('id', t.id)
        )
      ).then((results) => {
        const failed = results.filter((r) => r.error)
        if (failed.length > 0) {
          console.error('작업 순서 업데이트 실패:', failed.length, '건')
        }
      })

      return { tasks }
    })
  },

  selectTask: (taskId, mode = 'single') =>
    set((state) => {
      if (mode === 'range' && state.lastSelectedId) {
        // Shift 클릭: sort_order 기준 범위 선택
        const sorted = [...state.tasks].sort((a, b) => a.sort_order - b.sort_order)
        const fromIdx = sorted.findIndex((t) => t.id === state.lastSelectedId)
        const toIdx = sorted.findIndex((t) => t.id === taskId)
        if (fromIdx >= 0 && toIdx >= 0) {
          const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
          const rangeIds = sorted.slice(start, end + 1).map((t) => t.id)
          return { selectedTaskIds: new Set(rangeIds) }
        }
      }
      if (mode === 'toggle') {
        // Ctrl 클릭: 토글 (기존 선택 유지)
        const newSelection = new Set(state.selectedTaskIds)
        if (newSelection.has(taskId)) newSelection.delete(taskId)
        else newSelection.add(taskId)
        return { selectedTaskIds: newSelection, lastSelectedId: taskId }
      }
      // single: 단일 선택
      return { selectedTaskIds: new Set([taskId]), lastSelectedId: taskId }
    }),

  clearSelection: () => set({ selectedTaskIds: new Set(), lastSelectedId: null }),

  startEditing: (taskId, field) =>
    set({ editingCell: { taskId, field } }),

  stopEditing: () => set({ editingCell: null }),

  setLoading: (isLoading) => set({ isLoading }),

  _restoreFromSnapshot: (tasks, dependencies) =>
    set({ tasks, dependencies }),

  _updateTaskSilent: (taskId, changes) => {
    set((state) => {
      let tasks = state.tasks.map((t) => {
        if (t.id !== taskId) return t
        return { ...t, ...changes }
      })
      // 그룹 롤업 (작업량 또는 진척률 변경 시)
      const changedTask = tasks.find((t) => t.id === taskId)
      if (changedTask && !changedTask.is_group && (changes.total_workload !== undefined || changes.actual_progress !== undefined)) {
        tasks = rollupGroupDates(tasks, taskId)
      }
      return { tasks }
    })
    // DB 저장 (비동기)
    const dbChanges: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(changes)) {
      dbChanges[key] = value ?? null
    }
    supabase.from('tasks').update(dbChanges).eq('id', taskId).then(({ error }) => {
      if (error) console.error('작업 자동 업데이트 실패:', error.message)
    })
  },
}))
