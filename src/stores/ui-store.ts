import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ZoomLevel } from '@/lib/types'
import { DEFAULT_VISIBLE_COLUMNS, REQUIRED_COLUMNS, getTotalColumnWidth } from '@/lib/column-defs'

export type ViewMode = 'gantt' | 'progress' | 'analysis' | 'workload' | 'calendar' | 'resources' | 'settings' | 'activity' | 'mytasks' | 'memberTasks'
export type MobileTab = 'mytasks' | 'progress' | 'activity'
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
  columnWidths: Record<string, number> // 컬럼별 커스텀 너비 (localStorage 저장)
  showProgressLine: boolean // Progress Line 표시 여부
  showArchived: boolean // 아카이브된 작업 표시 여부
  customDateRange: { start: string; end: string } | null // 기간 필터 (null이면 프로젝트 전체 기간)
  ganttOptions: GanttOptions // 간트 차트 옵션
  mobileActiveTab: MobileTab // 모바일 하단 탭
  mobileTaskId: string | null // 모바일 태스크 상세 시트

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
  setColumnWidth: (columnId: string, width: number) => void
  resetColumnWidths: () => void
  toggleProgressLine: () => void
  toggleShowArchived: () => void
  setCustomDateRange: (range: { start: string; end: string } | null) => void
  setGanttOptions: (options: Partial<GanttOptions>) => void
  resetGanttOptions: () => void
  setMobileActiveTab: (tab: MobileTab) => void
  setMobileTaskId: (id: string | null) => void
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
      columnWidths: {},
      showProgressLine: false,
      showArchived: false,
      customDateRange: null,
      ganttOptions: { ...DEFAULT_GANTT_OPTIONS },
      mobileActiveTab: 'mytasks' as MobileTab,
      mobileTaskId: null,

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
          tableWidth: getTotalColumnWidth(newColumns, s.columnWidths) + 40,
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
        columnWidths: {},
        tableWidth: getTotalColumnWidth(DEFAULT_VISIBLE_COLUMNS, {}) + 40,
      }),
      setColumnWidth: (columnId, width) => set((s) => {
        const newWidths = { ...s.columnWidths, [columnId]: Math.max(30, width) }
        return {
          columnWidths: newWidths,
          tableWidth: getTotalColumnWidth(s.visibleColumns, newWidths) + 40,
        }
      }),
      resetColumnWidths: () => set({ columnWidths: {} }),
      toggleProgressLine: () => set((s) => ({ showProgressLine: !s.showProgressLine })),
      toggleShowArchived: () => set((s) => ({ showArchived: !s.showArchived })),
      setCustomDateRange: (customDateRange) => set({ customDateRange }),
      setGanttOptions: (options) => set((s) => ({
        ganttOptions: { ...s.ganttOptions, ...options },
      })),
      resetGanttOptions: () => set({ ganttOptions: { ...DEFAULT_GANTT_OPTIONS } }),
      setMobileActiveTab: (mobileActiveTab) => set({ mobileActiveTab }),
      setMobileTaskId: (mobileTaskId) => set({ mobileTaskId }),
    }),
    {
      name: 'xlgantt-ui-settings',
      // localStorage에서 복원 시 새 컬럼 자동 추가
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Record<string, unknown>) }
        // assignees 컬럼이 visibleColumns에 없으면 task_name 뒤에 삽입
        const cols = (merged as UIState).visibleColumns || [...DEFAULT_VISIBLE_COLUMNS]
        if (!cols.includes('assignees') && DEFAULT_VISIBLE_COLUMNS.includes('assignees')) {
          const nameIdx = cols.indexOf('task_name')
          cols.splice(nameIdx >= 0 ? nameIdx + 1 : 2, 0, 'assignees')
          ;(merged as Record<string, unknown>).visibleColumns = cols
          ;(merged as Record<string, unknown>).tableWidth = getTotalColumnWidth(cols, (merged as UIState).columnWidths || {}) + 40
        }
        return merged as UIState
      },
      // 런타임 상태는 저장하지 않음 (검색어, 링크모드 등)
      partialize: (state) => ({
        zoomLevel: state.zoomLevel,
        tableWidth: state.tableWidth,
        tableCollapsed: state.tableCollapsed,
        language: state.language,
        visibleColumns: state.visibleColumns,
        columnWidths: state.columnWidths,
        ganttOptions: state.ganttOptions,
        customDateRange: state.customDateRange,
      }),
    }
  )
)
