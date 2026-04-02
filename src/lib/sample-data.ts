import type { Project, Task, Dependency } from './types'

/**
 * Sample "ABC 프로젝트" data matching the XLGantt Excel file.
 */

export const SAMPLE_PROJECT: Project = {
  id: 'sample-project-001',
  name: 'ABC 프로젝트',
  description: 'XLGantt 샘플 프로젝트',
  start_date: '2025-07-18',
  end_date: '2025-12-19',
  owner_id: 'local',
  theme_id: 0,
  language: 'ko',
  zoom_level: 2,
  status_date: '2025-08-10',
  created_at: '2025-07-18T00:00:00Z',
  updated_at: '2025-07-18T00:00:00Z',
}

let _id = 0
const id = () => `task-${String(++_id).padStart(3, '0')}`

export const SAMPLE_TASKS: Task[] = [
  // WBS 1: 프로젝트 관리
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 1000,
    wbs_code: '1', wbs_level: 1, is_group: true,
    task_name: '프로젝트 관리', calendar_type: 'STD',
    planned_start: '2025-07-18', planned_end: '2025-12-19',
    total_workload: 40, planned_workload: 5, total_duration: 110, planned_duration: 15,
    planned_progress: 0.12, actual_progress: 0.10,
    is_milestone: false, is_collapsed: false,
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 2000,
    wbs_code: '1.1', wbs_level: 2, is_group: false,
    task_name: '프로젝트 착수', calendar_type: 'STD',
    planned_start: '2025-07-18', planned_end: '2025-07-25',
    total_workload: 5, planned_workload: 5, total_duration: 6, planned_duration: 6,
    planned_progress: 1.0, actual_progress: 1.0,
    is_milestone: false, is_collapsed: false, parent_id: 'task-001',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 3000,
    wbs_code: '1.2', wbs_level: 2, is_group: false,
    task_name: '요구사항 분석', calendar_type: 'STD',
    planned_start: '2025-07-28', planned_end: '2025-08-08',
    total_workload: 10, planned_workload: 10, total_duration: 10, planned_duration: 10,
    planned_progress: 0.5, actual_progress: 0.4,
    is_milestone: false, is_collapsed: false, parent_id: 'task-001',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 4000,
    wbs_code: '1.3', wbs_level: 2, is_group: false,
    task_name: '프로젝트 계획 수립', calendar_type: 'STD',
    planned_start: '2025-08-11', planned_end: '2025-08-22',
    total_workload: 10, planned_workload: 0, total_duration: 10, planned_duration: 10,
    planned_progress: 0.0, actual_progress: 0.0,
    is_milestone: false, is_collapsed: false, parent_id: 'task-001',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 5000,
    wbs_code: '1.4', wbs_level: 2, is_group: false,
    task_name: '착수 보고', calendar_type: 'STD',
    planned_start: '2025-08-25', planned_end: '2025-08-25',
    total_workload: 1, planned_workload: 0, total_duration: 1, planned_duration: 1,
    planned_progress: 0.0, actual_progress: 0.0,
    is_milestone: true, is_collapsed: false, parent_id: 'task-001',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },

  // WBS 2: 시스템 개발
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 7000,
    wbs_code: '2', wbs_level: 1, is_group: true,
    task_name: '시스템 개발', calendar_type: 'STD',
    planned_start: '2025-08-25', planned_end: '2025-12-19',
    total_workload: 204.5, planned_workload: 25.7, total_duration: 85, planned_duration: 85,
    planned_progress: 0.13, actual_progress: 0.12,
    is_milestone: false, is_collapsed: false,
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 8000,
    wbs_code: '2.1', wbs_level: 2, is_group: true,
    task_name: '설계', calendar_type: 'STD',
    planned_start: '2025-08-25', planned_end: '2025-09-19',
    total_workload: 40, planned_workload: 10, total_duration: 20, planned_duration: 20,
    planned_progress: 0.25, actual_progress: 0.20,
    is_milestone: false, is_collapsed: false, parent_id: 'task-006',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 9000,
    wbs_code: '2.1.1', wbs_level: 3, is_group: false,
    task_name: 'DB 설계', calendar_type: 'STD',
    planned_start: '2025-08-25', planned_end: '2025-09-05',
    total_workload: 15, planned_workload: 5, total_duration: 10, planned_duration: 10,
    planned_progress: 0.3, actual_progress: 0.25,
    is_milestone: false, is_collapsed: false, parent_id: 'task-007',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 10000,
    wbs_code: '2.1.2', wbs_level: 3, is_group: false,
    task_name: 'UI/UX 설계', calendar_type: 'STD',
    planned_start: '2025-09-01', planned_end: '2025-09-12',
    total_workload: 10, planned_workload: 3, total_duration: 10, planned_duration: 10,
    planned_progress: 0.2, actual_progress: 0.15,
    is_milestone: false, is_collapsed: false, parent_id: 'task-007',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 11000,
    wbs_code: '2.1.3', wbs_level: 3, is_group: false,
    task_name: 'API 설계', calendar_type: 'STD',
    planned_start: '2025-09-08', planned_end: '2025-09-19',
    total_workload: 15, planned_workload: 2, total_duration: 10, planned_duration: 10,
    planned_progress: 0.1, actual_progress: 0.08,
    is_milestone: false, is_collapsed: false, parent_id: 'task-007',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 12000,
    wbs_code: '2.2', wbs_level: 2, is_group: true,
    task_name: '개발', calendar_type: 'STD',
    planned_start: '2025-09-22', planned_end: '2025-11-14',
    total_workload: 120, planned_workload: 15.7, total_duration: 40, planned_duration: 40,
    planned_progress: 0.13, actual_progress: 0.10,
    is_milestone: false, is_collapsed: false, parent_id: 'task-006',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 13000,
    wbs_code: '2.2.1', wbs_level: 3, is_group: false,
    task_name: '백엔드 개발', calendar_type: 'STD',
    planned_start: '2025-09-22', planned_end: '2025-10-24',
    total_workload: 50, planned_workload: 8, total_duration: 25, planned_duration: 25,
    planned_progress: 0.16, actual_progress: 0.12,
    is_milestone: false, is_collapsed: false, parent_id: 'task-011',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 14000,
    wbs_code: '2.2.2', wbs_level: 3, is_group: false,
    task_name: '프론트엔드 개발', calendar_type: 'STD',
    planned_start: '2025-10-06', planned_end: '2025-11-07',
    total_workload: 45, planned_workload: 5, total_duration: 25, planned_duration: 25,
    planned_progress: 0.10, actual_progress: 0.08,
    is_milestone: false, is_collapsed: false, parent_id: 'task-011',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 15000,
    wbs_code: '2.2.3', wbs_level: 3, is_group: false,
    task_name: '통합 테스트', calendar_type: 'STD',
    planned_start: '2025-11-03', planned_end: '2025-11-14',
    total_workload: 25, planned_workload: 2.7, total_duration: 10, planned_duration: 10,
    planned_progress: 0.05, actual_progress: 0.0,
    is_milestone: false, is_collapsed: false, parent_id: 'task-011',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 16000,
    wbs_code: '2.3', wbs_level: 2, is_group: true,
    task_name: '검증 및 이관', calendar_type: 'STD',
    planned_start: '2025-11-17', planned_end: '2025-12-19',
    total_workload: 44.5, planned_workload: 0, total_duration: 25, planned_duration: 25,
    planned_progress: 0.0, actual_progress: 0.0,
    is_milestone: false, is_collapsed: false, parent_id: 'task-006',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 17000,
    wbs_code: '2.3.1', wbs_level: 3, is_group: false,
    task_name: 'UAT', calendar_type: 'STD',
    planned_start: '2025-11-17', planned_end: '2025-12-05',
    total_workload: 20, planned_workload: 0, total_duration: 15, planned_duration: 15,
    planned_progress: 0.0, actual_progress: 0.0,
    is_milestone: false, is_collapsed: false, parent_id: 'task-015',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 18000,
    wbs_code: '2.3.2', wbs_level: 3, is_group: false,
    task_name: '시스템 이관', calendar_type: 'STD',
    planned_start: '2025-12-08', planned_end: '2025-12-12',
    total_workload: 10, planned_workload: 0, total_duration: 5, planned_duration: 5,
    planned_progress: 0.0, actual_progress: 0.0,
    is_milestone: false, is_collapsed: false, parent_id: 'task-015',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 19000,
    wbs_code: '2.3.3', wbs_level: 3, is_group: false,
    task_name: '안정화 운영', calendar_type: 'STD',
    planned_start: '2025-12-15', planned_end: '2025-12-19',
    total_workload: 10, planned_workload: 0, total_duration: 5, planned_duration: 5,
    planned_progress: 0.0, actual_progress: 0.0,
    is_milestone: false, is_collapsed: false, parent_id: 'task-015',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
  {
    id: id(), project_id: SAMPLE_PROJECT.id, sort_order: 20000,
    wbs_code: '2.3.4', wbs_level: 3, is_group: false,
    task_name: '최종 보고', calendar_type: 'STD',
    planned_start: '2025-12-19', planned_end: '2025-12-19',
    total_workload: 4.5, planned_workload: 0, total_duration: 1, planned_duration: 1,
    planned_progress: 0.0, actual_progress: 0.0,
    is_milestone: true, is_collapsed: false, parent_id: 'task-015',
    created_at: '2025-07-18T00:00:00Z', updated_at: '2025-07-18T00:00:00Z',
  },
]

export const SAMPLE_DEPENDENCIES: Dependency[] = [
  // 프로젝트 착수 → 요구사항 분석 (FS)
  {
    id: 'dep-001', project_id: SAMPLE_PROJECT.id,
    predecessor_id: 'task-002', successor_id: 'task-003',
    dep_type: 1, lag_days: 0, created_at: '2025-07-18T00:00:00Z',
  },
  // 요구사항 분석 → 프로젝트 계획 수립 (FS)
  {
    id: 'dep-002', project_id: SAMPLE_PROJECT.id,
    predecessor_id: 'task-003', successor_id: 'task-004',
    dep_type: 1, lag_days: 0, created_at: '2025-07-18T00:00:00Z',
  },
  // 프로젝트 계획 수립 → 착수 보고 (FS)
  {
    id: 'dep-003', project_id: SAMPLE_PROJECT.id,
    predecessor_id: 'task-004', successor_id: 'task-005',
    dep_type: 1, lag_days: 0, created_at: '2025-07-18T00:00:00Z',
  },
  // 착수 보고 → 설계 (FS)
  {
    id: 'dep-004', project_id: SAMPLE_PROJECT.id,
    predecessor_id: 'task-005', successor_id: 'task-007',
    dep_type: 1, lag_days: 0, created_at: '2025-07-18T00:00:00Z',
  },
  // DB 설계 → UI/UX 설계 (SS with overlap)
  {
    id: 'dep-005', project_id: SAMPLE_PROJECT.id,
    predecessor_id: 'task-008', successor_id: 'task-009',
    dep_type: 2, lag_days: 5, created_at: '2025-07-18T00:00:00Z',
  },
  // 설계 → 개발 (FS)
  {
    id: 'dep-006', project_id: SAMPLE_PROJECT.id,
    predecessor_id: 'task-007', successor_id: 'task-011',
    dep_type: 1, lag_days: 0, created_at: '2025-07-18T00:00:00Z',
  },
  // 백엔드 → 프론트엔드 (SS)
  {
    id: 'dep-007', project_id: SAMPLE_PROJECT.id,
    predecessor_id: 'task-012', successor_id: 'task-013',
    dep_type: 2, lag_days: 10, created_at: '2025-07-18T00:00:00Z',
  },
  // 개발 → 검증 및 이관 (FS)
  {
    id: 'dep-008', project_id: SAMPLE_PROJECT.id,
    predecessor_id: 'task-011', successor_id: 'task-015',
    dep_type: 1, lag_days: 0, created_at: '2025-07-18T00:00:00Z',
  },
  // UAT → 시스템 이관 (FS)
  {
    id: 'dep-009', project_id: SAMPLE_PROJECT.id,
    predecessor_id: 'task-016', successor_id: 'task-017',
    dep_type: 1, lag_days: 0, created_at: '2025-07-18T00:00:00Z',
  },
  // 안정화 운영 → 최종 보고 (FS)
  {
    id: 'dep-010', project_id: SAMPLE_PROJECT.id,
    predecessor_id: 'task-018', successor_id: 'task-019',
    dep_type: 1, lag_days: 0, created_at: '2025-07-18T00:00:00Z',
  },
]
