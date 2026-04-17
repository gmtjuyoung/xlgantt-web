// ============================================================
// XLGantt Web - Core Type Definitions
// Mirrors the Excel Schedule sheet data model (Columns A-AE)
// ============================================================

export interface Project {
  id: string
  name: string
  description?: string
  category?: string
  start_date: string // ISO date
  end_date: string
  owner_id: string
  theme_id: number // 0-4 for 5 presets
  language: 'ko' | 'en'
  zoom_level: ZoomLevel
  status_date?: string
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  project_id: string
  sort_order: number
  wbs_code: string        // Col D: "1", "1.1", "1.1.2.1"
  wbs_level: number       // Col C: hierarchy level 1-10
  is_group: boolean       // Col B: "G" flag
  task_name: string       // Col E-N: task name
  remarks?: string        // Col O

  // Planned schedule
  planned_start?: string  // Col P: start date
  planned_end?: string    // Col Q: end date

  // Actual schedule
  actual_start?: string   // Col W
  actual_end?: string     // Col X

  // Workload (Man/Day)
  total_workload?: number   // Col S
  planned_workload?: number // Col T
  actual_workload?: number  // Col Y

  // Duration (days)
  total_duration?: number   // Col U
  planned_duration?: number // Col V
  actual_duration?: number  // Col Z

  // Calendar
  calendar_type: CalendarType // Col R

  // Resources
  resource_count?: number // Col AA

  // Deliverables
  deliverables?: string   // Col AC

  // Progress (0-1)
  planned_progress: number // Col AD
  actual_progress: number  // Col AE
  planned_progress_override?: number
  actual_progress_override?: number

  // Milestone (derived)
  is_milestone: boolean

  // Hierarchy
  parent_id?: string
  is_collapsed: boolean

  // Archive
  archived_at?: string    // null이면 활성, 값 있으면 아카이브됨
  archived_by?: string    // 아카이브한 user_id

  created_at: string
  updated_at: string
}

export interface Dependency {
  id: string
  project_id: string
  predecessor_id: string
  successor_id: string
  dep_type: DependencyType
  lag_days: number
  created_at: string
}

export interface Resource {
  id: string
  project_id: string
  name: string
  email?: string
  role?: string
  cost_rate?: number
}

export interface ResourceAssignment {
  id: string
  task_id: string
  resource_id: string
  allocation_percent: number // 1-100
}

export interface Calendar {
  id: string
  project_id: string
  calendar_type: CalendarType
  name: string
  work_days: number[] // 0=Sun..6=Sat, default [1,2,3,4,5]
  created_at: string
}

export interface CalendarException {
  id: string
  calendar_id: string
  exception_date: string
  is_working: boolean // false=holiday, true=working exception
  name?: string
}

export interface ColorTheme {
  id: number
  name: string
  colors: string[] // 15 hex colors
}

export interface ProjectMember {
  project_id: string
  user_id: string
  role: 'owner' | 'editor' | 'viewer'
  joined_at: string
}

// ============================================================
// Enums & Constants
// ============================================================

export type DependencyType = 1 | 2 | 3 | 4
// 1 = FS (Finish-to-Start)
// 2 = SS (Start-to-Start)
// 3 = FF (Finish-to-Finish)
// 4 = SF (Start-to-Finish)

export const DEP_TYPE_LABELS: Record<DependencyType, string> = {
  1: '종료→시작',
  2: '시작→시작',
  3: '종료→종료',
  4: '시작→종료',
}

export type CalendarType = 'STD' | 'UD1' | 'UD2'

export type ZoomLevel = 1 | 2 | 3
// 1 = Day view
// 2 = Week view (default)
// 3 = Month view

export const ZOOM_CONFIG: Record<ZoomLevel, { pixelsPerDay: number; label: string }> = {
  1: { pixelsPerDay: 40, label: '일' },
  2: { pixelsPerDay: 12, label: '주' },
  3: { pixelsPerDay: 3, label: '월' },
}

export const ROW_HEIGHT = 40
export const HEADER_HEIGHT = 64
export const MIN_TABLE_WIDTH = 600
export const DEFAULT_TABLE_WIDTH = 800

// ============================================================
// Gantt rendering
// ============================================================

export interface GanttScale {
  startDate: Date
  endDate: Date
  pixelsPerDay: number
  totalWidth: number
}

export interface BarRect {
  x: number
  width: number
  y: number
  height: number
}

// ============================================================
// Color Theme Presets (from Excel Settings sheet)
// ============================================================

export const THEME_PRESETS: ColorTheme[] = [
  {
    id: 0,
    name: 'Classic',
    colors: [
      '#999900', '#999900', '#0066FF', '#808080', '#0066FF',
      '#808080', '#FFCCCC', '#FF6600', '#00FF00', '#FF6600',
      '#0033FF', '#00FF00', '#DDDDDD', '#00FFFF', '#0000FF',
    ],
  },
  {
    id: 1,
    name: 'Ocean',
    colors: [
      '#006699', '#006699', '#0099CC', '#669999', '#0099CC',
      '#669999', '#CCE5FF', '#FF6633', '#33CC99', '#FF6633',
      '#003366', '#33CC99', '#E0E0E0', '#66CCFF', '#003399',
    ],
  },
  {
    id: 2,
    name: 'Forest',
    colors: [
      '#336633', '#336633', '#669933', '#999966', '#669933',
      '#999966', '#CCFFCC', '#FF6600', '#33CC33', '#FF6600',
      '#003300', '#33CC33', '#E0E0E0', '#99FF99', '#006600',
    ],
  },
  {
    id: 3,
    name: 'Sunset',
    colors: [
      '#CC6600', '#CC6600', '#FF9933', '#CC9966', '#FF9933',
      '#CC9966', '#FFE5CC', '#CC0000', '#FFCC00', '#CC0000',
      '#993300', '#FFCC00', '#E0E0E0', '#FFE066', '#CC3300',
    ],
  },
  {
    id: 4,
    name: 'Midnight',
    colors: [
      '#333366', '#333366', '#6666CC', '#666699', '#6666CC',
      '#666699', '#CCCCFF', '#FF3366', '#66CC66', '#FF3366',
      '#000066', '#66CC66', '#404040', '#9999FF', '#000099',
    ],
  },
]

// Theme color index meanings
export const THEME_COLOR_KEYS = [
  'groupPlanned',      // 0
  'groupActual',       // 1
  'subPlanned',        // 2
  'subActual',         // 3
  'leafPlanned',       // 4
  'leafActual',        // 5
  'milestonePlanned',  // 6
  'milestoneActual',   // 7
  'completePlanned',   // 8
  'completeActual',    // 9
  'behindSchedule',    // 10
  'dependencyLine',    // 11
  'todayLine',         // 12
  'progressLine',      // 13
  'timescaleHeader',   // 14
] as const
