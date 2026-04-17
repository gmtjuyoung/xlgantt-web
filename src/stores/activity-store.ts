import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface ActivityLog {
  id: string
  timestamp: string
  userId: string
  userName: string
  action: 'create' | 'update' | 'delete' | 'complete' | 'status_change'
  targetType: 'task' | 'detail' | 'assignment' | 'dependency'
  targetId: string
  targetName: string
  parentTaskName?: string
  details?: string
  projectId: string
}

export interface LoadLogsOptions {
  userId?: string       // 특정 사용자만 조회 (undefined면 전체)
  fromDate?: string     // ISO date 시작 (inclusive)
  toDate?: string       // ISO date 종료 (inclusive)
  offset?: number       // 페이지네이션 오프셋 (기본 0)
  limit?: number        // 페이지 크기 (기본 50)
}

interface ActivityState {
  logs: ActivityLog[]
  totalCount: number
  isLoading: boolean
  /** 마지막으로 사용한 조회 옵션 (addLog 시 최신 여부 판단용) */
  lastOptions: LoadLogsOptions & { projectId?: string }

  /** 프로젝트별 활동로그 로드 (필터 + 페이지네이션) */
  loadLogs: (projectId: string, options?: LoadLogsOptions) => Promise<void>
  /** 새 로그를 DB에 저장 + 낙관적으로 로컬에 추가 */
  addLog: (log: Omit<ActivityLog, 'id' | 'timestamp'>) => void
  /** 현재 프로젝트의 로그 전체 삭제 */
  clearLogs: (projectId: string) => Promise<void>
}

function dbToLog(row: Record<string, unknown>): ActivityLog {
  return {
    id: row.id as string,
    timestamp: (row.created_at as string) || new Date().toISOString(),
    userId: (row.user_id as string) || '',
    userName: (row.user_name as string) || '',
    action: (row.action as ActivityLog['action']) || 'update',
    targetType: (row.target_type as ActivityLog['targetType']) || 'task',
    targetId: (row.target_id as string) || '',
    targetName: (row.target_name as string) || '',
    parentTaskName: (row.parent_task_name as string) || undefined,
    details: (row.details as string) || undefined,
    projectId: (row.project_id as string) || '',
  }
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  logs: [],
  totalCount: 0,
  isLoading: false,
  lastOptions: {},

  loadLogs: async (projectId, options = {}) => {
    if (!projectId) return
    set({ isLoading: true, lastOptions: { projectId, ...options } })
    const offset = options.offset ?? 0
    const limit = options.limit ?? 50

    let query = supabase
      .from('activity_logs')
      .select('*', { count: 'exact' })
      .eq('project_id', projectId)

    if (options.userId) {
      query = query.eq('user_id', options.userId)
    }
    if (options.fromDate) {
      query = query.gte('created_at', options.fromDate)
    }
    if (options.toDate) {
      // toDate는 날짜 기준이므로 그 날 23:59:59까지 포함
      query = query.lte('created_at', options.toDate + 'T23:59:59.999Z')
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('활동로그 로드 실패:', error.message)
      set({ isLoading: false })
      return
    }
    set({
      logs: data ? (data as Record<string, unknown>[]).map(dbToLog) : [],
      totalCount: count ?? 0,
      isLoading: false,
    })
  },

  addLog: (logData) => {
    const tempId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()
    const optimistic: ActivityLog = {
      ...logData,
      id: tempId,
      timestamp: now,
    }
    // 낙관적 추가: 현재 필터와 일치하는 경우에만 리스트에 끼워넣기
    const { lastOptions } = get()
    const matchesFilter =
      (!lastOptions.projectId || lastOptions.projectId === logData.projectId) &&
      (!lastOptions.userId || lastOptions.userId === logData.userId)
    if (matchesFilter) {
      set((state) => ({
        logs: [optimistic, ...state.logs].slice(0, lastOptions.limit ?? 50),
        totalCount: state.totalCount + 1,
      }))
    }
    // 서버 저장
    if (!logData.projectId) return
    supabase.from('activity_logs').insert({
      project_id: logData.projectId,
      user_id: logData.userId || null,
      user_name: logData.userName,
      action: logData.action,
      target_type: logData.targetType,
      target_id: logData.targetId,
      target_name: logData.targetName,
      parent_task_name: logData.parentTaskName || null,
      details: logData.details || null,
    }).select('id').single().then(({ data, error }) => {
      if (error) {
        console.error('활동로그 저장 실패:', error.message)
        // 실패 시 낙관적 항목 제거
        set((state) => ({
          logs: state.logs.filter((l) => l.id !== tempId),
          totalCount: Math.max(0, state.totalCount - 1),
        }))
        return
      }
      if (data?.id) {
        set((state) => ({
          logs: state.logs.map((l) => (l.id === tempId ? { ...l, id: data.id as string } : l)),
        }))
      }
    })
  },

  clearLogs: async (projectId) => {
    if (!projectId) return
    const { error } = await supabase
      .from('activity_logs')
      .delete()
      .eq('project_id', projectId)
    if (error) {
      console.error('활동로그 삭제 실패:', error.message)
      return
    }
    set({ logs: [], totalCount: 0 })
  },
}))
