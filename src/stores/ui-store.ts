import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ZoomLevel } from '@/lib/types'
import { DEFAULT_VISIBLE_COLUMNS, REQUIRED_COLUMNS, getTotalColumnWidth } from '@/lib/column-defs'

export type ViewMode = 'gantt' | 'progress' | 'analysis' | 'workload' | 'calendar' | 'resources' | 'settings' | 'activity' | 'mytasks'
export type FilterStatus = 'all' | 'delayed' | 'completed' | 'in_progress'

export interface GanttOptions {
  barHeight: number                              // 바 높이 (기본 16, 범위 12~24)
  showTaskName: 'right' | 'inside' | 'none'     // 작업명 표시 위치
  showProgress: boolean                          // 바 안에 진척률 표시
  showDependencies: boolean                      // 의존관계 화살표 표시
  showNonWorkingDays: boolean                    // 비근무일 밴드 표시
  showTodayLine: boolean                         // Today 라인 표시
  colorByProgress: boolean                       // 진척률에 따라 바 색상 변경 (지연=빨강)
}

export const DEFAULT_GANTT_OPTIONS: GanttOptions = {
  barHeight: 16,
  showTaskName: 'right',
  showProgress: true,
  showDependencies: true,
  showNonWorkingDays: true,
  showTodayLine: true,
  colorByProgress: false,
}

interface UIState {
  activeView: ViewMode
  zoomLevel: ZoomLevel
  sidebarOpen: boolean
  tableWidth: number
  tableCollapsed: boolean
  language: 'ko' | 'en'
  linkMode: boolean // for creating dependencies
  linkSourceTaskId: string | null // first-clicked task in link mode
  searchQuery: string
  filterStatus: FilterStatus
  visibleColumns: string[] // 표시할 컬럼 ID 목록
  showProgressLine: boolean // Progress Line 표시 여부
  ganttOptions: GanttOptions // 간트 차트 옵션

  setActiveView: (view: ViewMode) => void
  setZoomLevel: (level: ZoomLevel) => void
  toggleSidebar: () => void
  setTableWidth: (width: number) => void
  setTableCollapsed: (collapsed: boolean) => void
  setLanguage: (lang: 'ko' | 'en') => void
  toggleLinkMode: () => void
  setLinkSource: (taskId: string | null) => void
  cancelLinkMode: () => void
  setSearchQuery: (query: string) => void
  setFilterStatus: (status: FilterStatus) => void
  toggleColumn: (columnId: string) => void
  moveColumn: (columnId: string, direction: 'up' | 'down') => void
  resetColumns: () => void
  toggleProgressLine: () => void
  setGanttOptions: (options: Partial<GanttOptions>) => void
  resetGanttOptions: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeView: 'gantt',
      zoomLevel: 2,
      sidebarOpen: true,
      tableWidth: getTotalColumnWidth(DEFAULT_VISIBLE_COLUMNS) + 40,
      tableCollapsed: false,
      language: 'ko',
      linkMode: false,
      linkSourceTaskId: null,
      searchQuery: '',
      filterStatus: 'all' as FilterStatus,
      visibleColumns: [...DEFAULT_VISIBLE_COLUMNS],
      showProgressLine: false,
      ganttOptions: { ...DEFAULT_GANTT_OPTIONS },

      setActiveView: (activeView) => set({ activeView }),
      setZoomLevel: (zoomLevel) => set({ zoomLevel }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTableWidth: (tableWidth) => set({ tableWidth }),
      setTableCollapsed: (tableCollapsed) => set({ tableCollapsed }),
      setLanguage: (language) => set({ language }),
      toggleLinkMode: () => set((s) => ({
        linkMode: !s.linkMode,
        linkSourceTaskId: null,
      })),
      setLinkSource: (taskId) => set({ linkSourceTaskId: taskId }),
      cancelLinkMode: () => set({ linkMode: false, linkSourceTaskId: null }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setFilterStatus: (filterStatus) => set({ filterStatus }),
      toggleColumn: (columnId) => set((s) => {
        if (REQUIRED_COLUMNS.includes(columnId) && s.visibleColumns.includes(columnId)) {
          return s
        }
        const isVisible = s.visibleColumns.includes(columnId)
        const newColumns = isVisible
          ? s.visibleColumns.filter((id) => id !== columnId)
          : [...s.visibleColumns, columnId]
        return {
          visibleColumns: newColumns,
          tableWidth: getTotalColumnWidth(newColumns) + 40,
        }
      }),
      moveColumn: (columnId, direction) => set((s) => {
        const cols = [...s.visibleColumns]
        const idx = cols.indexOf(columnId)
        if (idx < 0) return s
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1
        if (targetIdx < 0 || targetIdx >= cols.length) return s
        ;[cols[idx], cols[targetIdx]] = [cols[targetIdx], cols[idx]]
        return { visibleColumns: cols }
      }),
      resetColumns: () => set({
        visibleColumns: [...DEFAULT_VISIBLE_COLUMNS],
        tableWidth: getTotalColumnWidth(DEFAULT_VISIBLE_COLUMNS) + 40,
      }),
      toggleProgressLine: () => set((s) => ({ showProgressLine: !s.showProgressLine })),
      setGanttOptions: (options) => set((s) => ({
        ganttOptions: { ...s.ganttOptions, ...options },
      })),
      resetGanttOptions: () => set({ ganttOptions: { ...DEFAULT_GANTT_OPTIONS } }),
    }),
    {
      name: 'xlgantt-ui-settings',
      // 런타임 상태는 저장하지 않음 (검색어, 링크모드 등)
      partialize: (state) => ({
        zoomLevel: state.zoomLevel,
        tableWidth: state.tableWidth,
        tableCollapsed: state.tableCollapsed,
        language: state.language,
        visibleColumns: state.visibleColumns,
        ganttOptions: state.ganttOptions,
      }),
    }
  )
)
