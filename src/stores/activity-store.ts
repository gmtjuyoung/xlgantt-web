import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ActivityLog {
  id: string
  timestamp: string          // ISO string
  userId: string             // 누가
  userName: string           // 이름
  action: 'create' | 'update' | 'delete' | 'complete' | 'status_change'
  targetType: 'task' | 'detail' | 'assignment' | 'dependency'
  targetId: string
  targetName: string         // 작업명 또는 세부항목 제목
  parentTaskName?: string    // 세부항목인 경우 소속 작업명
  details?: string           // 추가 설명 (예: "진척률 0% → 50%", "상태: 대기 → 완료")
  projectId: string
}

const MAX_LOGS = 500

interface ActivityState {
  logs: ActivityLog[]
  addLog: (log: Omit<ActivityLog, 'id' | 'timestamp'>) => void
  clearLogs: () => void
}

export const useActivityStore = create<ActivityState>()(
  persist(
    (set) => ({
      logs: [],

      addLog: (logData) => {
        const log: ActivityLog = {
          ...logData,
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
        }
        set((state) => {
          const updated = [log, ...state.logs]
          return { logs: updated.slice(0, MAX_LOGS) }
        })
      },

      clearLogs: () => set({ logs: [] }),
    }),
    {
      name: 'xlgantt-activity-logs',
    }
  )
)
