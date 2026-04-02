// ============================================================
// XLGantt Web - Column Definitions
// All available WBS table columns with metadata
// ============================================================

export interface ColumnDef {
  id: string
  label: string
  width: number
  visible: boolean      // 기본 표시 여부
  align?: 'left' | 'center' | 'right'
  required?: boolean    // true면 숨기기 불가
  type?: 'text' | 'date' | 'number' | 'percent' | 'boolean' | 'select'
  readOnlyForGroup?: boolean  // 그룹 행에서 읽기전용
}

export const ALL_COLUMNS: ColumnDef[] = [
  // 기본 표시 컬럼 (현재 8개)
  { id: 'wbs_code',         label: 'WBS',        width: 65,  visible: true,  align: 'center', required: true, type: 'text' },
  { id: 'task_name',        label: '작업명',      width: 260, visible: true,  align: 'left',   required: true, type: 'text' },
  { id: 'deliverables',     label: '담당',        width: 100, visible: true,  align: 'center', type: 'text' },
  { id: 'planned_start',    label: '시작일',      width: 110, visible: true,  align: 'center', type: 'date',   readOnlyForGroup: true },
  { id: 'planned_end',      label: '완료일',      width: 110, visible: true,  align: 'center', type: 'date',   readOnlyForGroup: true },
  { id: 'total_duration',   label: '기간',        width: 55,  visible: true,  align: 'right',  type: 'number', readOnlyForGroup: true },
  { id: 'total_workload',   label: '작업량',      width: 65,  visible: true,  align: 'right',  type: 'number', readOnlyForGroup: true },
  { id: 'actual_progress',  label: '진척률',      width: 70,  visible: true,  align: 'center', type: 'percent' },

  // 추가 컬럼 (기본 숨김)
  { id: 'actual_start',     label: '실제시작일',   width: 110, visible: false, align: 'center', type: 'date' },
  { id: 'actual_end',       label: '실제완료일',   width: 110, visible: false, align: 'center', type: 'date' },
  { id: 'actual_workload',  label: '실제작업량',   width: 75,  visible: false, align: 'right',  type: 'number' },
  { id: 'actual_duration',  label: '실제기간',     width: 65,  visible: false, align: 'right',  type: 'number' },
  { id: 'remarks',          label: '비고',         width: 150, visible: false, align: 'left',   type: 'text' },
  { id: 'is_milestone',     label: '마일스톤',     width: 70,  visible: false, align: 'center', type: 'boolean' },
  { id: 'calendar_type',    label: '달력유형',     width: 75,  visible: false, align: 'center', type: 'select' },
  { id: 'wbs_level',        label: 'WBS레벨',     width: 65,  visible: false, align: 'center', type: 'number' },
  { id: 'is_group',         label: '그룹여부',     width: 65,  visible: false, align: 'center', type: 'boolean' },
  { id: 'planned_progress', label: '계획진척률',   width: 80,  visible: false, align: 'center', type: 'percent' },
]

/** 기본 표시 컬럼 ID 목록 */
export const DEFAULT_VISIBLE_COLUMNS: string[] = ALL_COLUMNS
  .filter((col) => col.visible)
  .map((col) => col.id)

/** 필수 컬럼 ID 목록 (숨기기 불가) */
export const REQUIRED_COLUMNS: string[] = ALL_COLUMNS
  .filter((col) => col.required)
  .map((col) => col.id)

/** 컬럼 ID로 ColumnDef 찾기 */
export function getColumnDef(id: string): ColumnDef | undefined {
  return ALL_COLUMNS.find((col) => col.id === id)
}

/** 표시할 컬럼 정의 목록 반환 (visibleIds 순서 유지) */
export function getVisibleColumnDefs(visibleIds: string[]): ColumnDef[] {
  const colMap = new Map(ALL_COLUMNS.map((col) => [col.id, col]))
  return visibleIds.map((id) => colMap.get(id)).filter((col): col is ColumnDef => !!col)
}

/** 표시 컬럼의 총 너비 계산 */
export function getTotalColumnWidth(visibleIds: string[]): number {
  return getVisibleColumnDefs(visibleIds).reduce((sum, col) => sum + col.width, 0)
}
