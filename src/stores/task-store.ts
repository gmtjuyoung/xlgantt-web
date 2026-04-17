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
import { clampProgress, getEffectiveActualProgress, getEffectivePlannedProgress, resolveStatusDate } from '@/lib/task-progress'
import { supabase } from '@/lib/supabase'
import { clipboardManager } from '@/lib/clipboard-manager'

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

function getProgressWeight(task: Task): number {
  const w = task.total_workload
  return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 1
}

function stripOverrideColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const fallback = { ...payload }
  delete fallback.planned_progress_override
  delete fallback.actual_progress_override
  return fallback
}

function isMissingOverrideColumnError(error: { message?: string; details?: string; hint?: string; code?: string } | null): boolean {
  if (!error) return false
  const text = `${error.code || ''} ${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return text.includes('planned_progress_override') ||
    text.includes('actual_progress_override') ||
    text.includes('column') && text.includes('does not exist') ||
    text.includes('pgrst204')
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
  const statusDate = resolveStatusDate(useProjectStore.getState().currentProject?.status_date)

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
  const totalWeight = leafChildren.reduce((sum, t) => sum + getProgressWeight(t), 0)
  const weightedActualProgress = totalWeight > 0
    ? leafChildren.reduce((sum, t) => sum + (getEffectiveActualProgress(t) * getProgressWeight(t)), 0) / totalWeight
    : 0

  const weightedPlannedProgress = totalWeight > 0
    ? leafChildren.reduce((sum, t) => sum + (getEffectivePlannedProgress(t, statusDate) * getProgressWeight(t)), 0) / totalWeight
    : 0

  const updated = tasks.map((t) =>
    t.id === parentTask.id
      ? {
          ...t,
          planned_start: minStart,
          planned_end: maxEnd,
          total_duration: duration,
          total_workload: totalWorkload || t.total_workload,
          planned_progress: clampProgress(weightedPlannedProgress),
          actual_progress: clampProgress(weightedActualProgress),
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
    planned_progress_override: row.planned_progress_override != null ? Number(row.planned_progress_override) : undefined,
    actual_progress_override: row.actual_progress_override != null ? Number(row.actual_progress_override) : undefined,
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
    planned_progress: t.planned_progress ?? null,
    actual_progress: t.actual_progress,
    planned_progress_override: t.planned_progress_override ?? null,
    actual_progress_override: t.actual_progress_override ?? null,
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

  // Clipboard (copy & paste)
  copiedTask: Task | null
  copyTask: (taskId: string) => void
  pasteTask: (referenceTaskId: string, position: 'above' | 'below') => void
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
  copiedTask: null,

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
      const rawTasks = data.map(dbToTask)

      // 아카이브된 작업은 재계산에서 제외 (원래 자리 유지)
      const activeTasks = rawTasks.filter((t) => !t.archived_at)
      const archivedTasks = rawTasks.filter((t) => t.archived_at)

      // WBS 자동 정합화: DFS 트리 재계산 + 빈 그룹 해제
      let recalculated = recalculateWBSCodes(activeTasks)
      recalculated = recalculated.map((task) => {
        if (task.is_group) {
          const hasChildren = recalculated.some((t) => t.parent_id === task.id)
          if (!hasChildren) return { ...task, is_group: false }
        }
        return task
      })

      // 변경된 rows만 추출
      const changedRows = recalculated.filter((task) => {
        const original = activeTasks.find((t) => t.id === task.id)
        if (!original) return false
        return (
          original.wbs_code !== task.wbs_code ||
          original.wbs_level !== task.wbs_level ||
          original.is_group !== task.is_group ||
          original.sort_order !== task.sort_order
        )
      })

      // 스토어에 반영 (아카이브 포함)
      get().setTasks([...recalculated, ...archivedTasks])

      // stale한 rows만 DB에 비동기 동기화
      if (changedRows.length > 0) {
        console.log(`[WBS auto-cleanup] ${changedRows.length}개 작업 정리`)
        for (const task of changedRows) {
          supabase.from('tasks').update({
            wbs_code: task.wbs_code,
            wbs_level: task.wbs_level,
            is_group: task.is_group,
            sort_order: task.sort_order,
          }).eq('id', task.id).then(({ error }) => {
            if (error) console.error('WBS 자동 정리 실패:', error.message)
          })
        }
      }
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
    const statusDate = resolveStatusDate(useProjectStore.getState().currentProject?.status_date)

    // 기간 자동 계산
    let tasks = inTasks.map((t) => ({
      ...t,
      total_duration: t.total_duration ?? calcDuration(t.planned_start, t.planned_end),
      planned_progress: getEffectivePlannedProgress(t, statusDate),
      actual_progress: getEffectiveActualProgress(t),
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
      const totalWeight = leafChildren.reduce((sum, t) => sum + getProgressWeight(t), 0)
      const weightedActualProgress = totalWeight > 0
        ? leafChildren.reduce((sum, t) => sum + (t.actual_progress * getProgressWeight(t)), 0) / totalWeight
        : 0

      const weightedPlannedProgress = totalWeight > 0
        ? leafChildren.reduce((sum, t) => sum + (t.planned_progress * getProgressWeight(t)), 0) / totalWeight
        : 0

      tasks = tasks.map((t) =>
        t.id === group.id
          ? {
              ...t,
              planned_start: minStart,
              planned_end: maxEnd,
              total_duration: duration,
              total_workload: totalWorkload || t.total_workload,
              planned_progress: clampProgress(weightedPlannedProgress),
              actual_progress: clampProgress(weightedActualProgress),
            }
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
    const payload = taskToDb(task)
    supabase.from('tasks').insert(payload).then(async ({ error }) => {
      if (!error) return
      if (isMissingOverrideColumnError(error)) {
        const fallback = stripOverrideColumns(payload)
        const { error: retryError } = await supabase.from('tasks').insert(fallback)
        if (retryError) {
          console.error('작업 추가(레거시 fallback) 실패:', retryError.message)
        }
        return
      }
      console.error('작업 추가 실패:', error.message)
    })
  },

  updateTask: (taskId, changes) => {
    const normalizedChanges: Partial<Task> = { ...changes }
    const hasPlannedOverrideField = Object.prototype.hasOwnProperty.call(changes, 'planned_progress_override')
    const hasActualOverrideField = Object.prototype.hasOwnProperty.call(changes, 'actual_progress_override')

    if (changes.planned_progress !== undefined && !hasPlannedOverrideField) {
      normalizedChanges.planned_progress_override = clampProgress(changes.planned_progress)
    }
    if (changes.actual_progress !== undefined && !hasActualOverrideField) {
      normalizedChanges.actual_progress_override = clampProgress(changes.actual_progress)
    }

    const beforeTask = useTaskStore.getState().tasks.find((t) => t.id === taskId)
    pushCurrentSnapshot()
    set((state) => {
      const statusDate = resolveStatusDate(useProjectStore.getState().currentProject?.status_date)
      // 1. 기본 업데이트 적용
      let tasks = state.tasks.map((t) => {
        if (t.id !== taskId) return t
        const updated = { ...t, ...normalizedChanges }

        // 2. 날짜가 변경되면 기간(근무일수) 자동 계산
        const start = normalizedChanges.planned_start ?? t.planned_start
        const end = normalizedChanges.planned_end ?? t.planned_end
        if (normalizedChanges.planned_start !== undefined || normalizedChanges.planned_end !== undefined) {
          updated.total_duration = calcDuration(start, end)
        }

        updated.planned_progress = getEffectivePlannedProgress(updated, statusDate)
        updated.actual_progress = getEffectiveActualProgress(updated)

        return updated
      })

      // 3. 그룹 작업 롤업 (자식의 날짜/작업량 변경 시 부모 갱신)
      const changedTask = tasks.find((t) => t.id === taskId)
      const needsRollup = normalizedChanges.planned_start !== undefined ||
        normalizedChanges.planned_end !== undefined ||
        normalizedChanges.total_workload !== undefined ||
        normalizedChanges.planned_progress_override !== undefined ||
        normalizedChanges.actual_progress_override !== undefined
      if (changedTask && !changedTask.is_group && needsRollup) {
        tasks = rollupGroupDates(tasks, taskId)
      }

      return { tasks }
    })
    // 진척률 변경 시만 로그
    if (beforeTask && normalizedChanges.actual_progress !== undefined && normalizedChanges.actual_progress !== beforeTask.actual_progress) {
      logTaskActivity({
        action: normalizedChanges.actual_progress === 1 ? 'complete' : 'update',
        targetType: 'task',
        targetId: taskId,
        targetName: beforeTask.task_name,
        details: `진척률 ${Math.round((beforeTask.actual_progress ?? 0) * 100)}% → ${Math.round((normalizedChanges.actual_progress ?? 0) * 100)}%`,
      })
    }
    // 서버 업데이트 (비동기) - 변경된 필드만 전송
    const dbChanges: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(normalizedChanges)) {
      dbChanges[key] = value ?? null
    }
    supabase.from('tasks').update(dbChanges).eq('id', taskId).then(async ({ error }) => {
      if (!error) return
      if (isMissingOverrideColumnError(error)) {
        const fallback = stripOverrideColumns(dbChanges)
        const { error: retryError } = await supabase.from('tasks').update(fallback).eq('id', taskId)
        if (retryError) {
          console.error('작업 업데이트(레거시 fallback) 실패:', retryError.message)
        }
        return
      }
      console.error('작업 업데이트 실패:', error.message)
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
    const currentTask = get().tasks.find((t) => t.id === taskId)
    const dbSafeChanges: Partial<Task> = { ...changes }
    if (currentTask?.actual_progress_override != null && dbSafeChanges.actual_progress !== undefined) {
      delete dbSafeChanges.actual_progress
    }

    set((state) => {
      const statusDate = resolveStatusDate(useProjectStore.getState().currentProject?.status_date)
      let tasks = state.tasks.map((t) => {
        if (t.id !== taskId) return t
        const normalized = { ...dbSafeChanges }
        if (t.actual_progress_override != null && normalized.actual_progress !== undefined) {
          delete normalized.actual_progress
        }
        const updated = { ...t, ...normalized }
        updated.planned_progress = getEffectivePlannedProgress(updated, statusDate)
        updated.actual_progress = getEffectiveActualProgress(updated)
        return updated
      })
      // 그룹 롤업 (작업량 또는 진척률 변경 시)
      const changedTask = tasks.find((t) => t.id === taskId)
      if (changedTask && !changedTask.is_group && (dbSafeChanges.total_workload !== undefined || dbSafeChanges.actual_progress !== undefined)) {
        tasks = rollupGroupDates(tasks, taskId)
      }
      return { tasks }
    })
    // DB 저장 (비동기)
    const dbChanges: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(dbSafeChanges)) {
      dbChanges[key] = value ?? null
    }
    supabase.from('tasks').update(dbChanges).eq('id', taskId).then(({ error }) => {
      if (error) console.error('작업 자동 업데이트 실패:', error.message)
    })
  },

  // 작업 복사: 클립보드와 스토어 상태에 복사본 저장
  copyTask: (taskId) => {
    const task = get().tasks.find((t) => t.id === taskId)
    if (!task) {
      console.warn('[copyTask] 작업을 찾을 수 없습니다:', taskId)
      return
    }
    clipboardManager.copy(task)
    set({ copiedTask: task })
    console.log('[copyTask] 작업 복사 완료:', task.task_name)
  },

  // 작업 붙여넣기: referenceTaskId 기준으로 위/아래에 복사된 작업 생성
  pasteTask: (referenceTaskId, position) => {
    const copiedData = clipboardManager.paste()
    if (!copiedData) {
      console.warn('[pasteTask] 클립보드에 복사된 작업이 없습니다')
      return
    }
    const project = useProjectStore.getState().currentProject
    if (!project) {
      console.warn('[pasteTask] 현재 프로젝트를 찾을 수 없습니다')
      return
    }
    const tasks = get().tasks
    const refTask = tasks.find((t) => t.id === referenceTaskId)
    if (!refTask) {
      console.warn('[pasteTask] 기준 작업을 찾을 수 없습니다:', referenceTaskId)
      return
    }

    const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((t) => t.id === referenceTaskId)

    let newSortOrder: number
    if (position === 'above') {
      const prevTask = index > 0 ? sorted[index - 1] : null
      newSortOrder = prevTask
        ? Math.floor((prevTask.sort_order + refTask.sort_order) / 2)
        : refTask.sort_order - 1000
    } else {
      const nextTask = index < sorted.length - 1 ? sorted[index + 1] : null
      newSortOrder = nextTask
        ? Math.floor((refTask.sort_order + nextTask.sort_order) / 2)
        : refTask.sort_order + 1000
    }

    const newTask: Task = {
      ...copiedData,
      id: crypto.randomUUID(),
      project_id: project.id,
      sort_order: newSortOrder,
      wbs_code: '', // recalcWBS()가 붙여넣기 후 호출되어 재계산됩니다
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    get().addTask(newTask)
    get().selectTask(newTask.id)
    console.log('[pasteTask] 작업 붙여넣기 완료:', newTask.task_name, '→', position === 'above' ? '위' : '아래')
  },
}))
