import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Company, TeamMember, TaskAssignment, TaskDetail, TaskAttachment, TaskComment } from '@/lib/resource-types'
import { useActivityStore } from '@/stores/activity-store'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectStore } from '@/stores/project-store'
import { useTaskStore } from '@/stores/task-store'

function logActivity(params: {
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

interface ResourceState {
  companies: Company[]
  members: TeamMember[]
  assignments: TaskAssignment[]
  taskDetails: TaskDetail[]

  // Company CRUD
  addCompany: (company: Company) => void
  updateCompany: (id: string, changes: Partial<Company>) => void
  deleteCompany: (id: string) => void

  // Member CRUD
  addMember: (member: TeamMember) => void
  updateMember: (id: string, changes: Partial<TeamMember>) => void
  deleteMember: (id: string) => void

  // Assignment CRUD
  addAssignment: (assignment: TaskAssignment) => void
  updateAssignment: (id: string, changes: Partial<TaskAssignment>) => void
  removeAssignment: (id: string) => void
  getTaskAssignments: (taskId: string) => TaskAssignment[]

  // Task Detail CRUD
  addTaskDetail: (detail: TaskDetail) => void
  updateTaskDetail: (id: string, changes: Partial<TaskDetail>) => void
  deleteTaskDetail: (id: string) => void
  getTaskDetails: (taskId: string) => TaskDetail[]

  // Attachment CRUD
  addAttachment: (detailId: string, attachment: TaskAttachment) => void
  removeAttachment: (detailId: string, attachmentId: string) => void

  // Comment CRUD
  addComment: (detailId: string, comment: TaskComment) => void
  deleteComment: (detailId: string, commentId: string) => void
}

// 샘플 회사 데이터
const SAMPLE_COMPANIES: Company[] = [
  { id: 'comp-001', name: '(주) 지엠티', shortName: 'GMT', color: '#3b82f6', created_at: new Date().toISOString() },
  { id: 'comp-002', name: '삼성SDS', shortName: '삼성', color: '#1d4ed8', created_at: new Date().toISOString() },
  { id: 'comp-003', name: '엘지CNS', shortName: 'LG', color: '#dc2626', created_at: new Date().toISOString() },
]

const SAMPLE_MEMBERS: TeamMember[] = [
  { id: 'mem-001', company_id: 'comp-001', name: '홍길동', role: 'PM', email: 'hong@gmt.co.kr', created_at: new Date().toISOString() },
  { id: 'mem-002', company_id: 'comp-001', name: '김철수', role: '개발자', email: 'kim@gmt.co.kr', created_at: new Date().toISOString() },
  { id: 'mem-003', company_id: 'comp-001', name: '이영희', role: '디자이너', email: 'lee@gmt.co.kr', created_at: new Date().toISOString() },
  { id: 'mem-004', company_id: 'comp-002', name: '박민수', role: 'SA', email: 'park@samsung.com', created_at: new Date().toISOString() },
  { id: 'mem-005', company_id: 'comp-003', name: '정수진', role: 'QA', email: 'jung@lgcns.com', created_at: new Date().toISOString() },
]

export const useResourceStore = create<ResourceState>()(persist((set, get) => ({
  companies: SAMPLE_COMPANIES,
  members: SAMPLE_MEMBERS,
  assignments: [
    { id: 'assign-001', task_id: 'task-002', member_id: 'mem-002', allocation_percent: 100 },
    { id: 'assign-002', task_id: 'task-003', member_id: 'mem-002', allocation_percent: 50 },
    { id: 'assign-003', task_id: 'task-008', member_id: 'mem-002', allocation_percent: 100 },
    { id: 'assign-004', task_id: 'task-009', member_id: 'mem-002', allocation_percent: 80 },
    { id: 'assign-005', task_id: 'task-002', member_id: 'mem-001', allocation_percent: 100 },
    { id: 'assign-006', task_id: 'task-010', member_id: 'mem-003', allocation_percent: 100 },
  ],
  taskDetails: [
    { id: 'detail-001', task_id: 'task-002', sort_order: 1000, title: 'DB 스키마 설계서 작성', status: 'done', assignee_id: 'mem-002', due_date: '2025-08-01', created_at: '2025-07-20T09:00:00Z' },
    { id: 'detail-002', task_id: 'task-002', sort_order: 2000, title: '테이블 정의서 검토', status: 'in_progress', assignee_id: 'mem-002', due_date: '2025-08-05', created_at: '2025-07-22T09:00:00Z' },
    { id: 'detail-003', task_id: 'task-003', sort_order: 1000, title: 'API 목록 정리', status: 'todo', assignee_id: 'mem-002', due_date: '2025-08-10', created_at: '2025-07-25T09:00:00Z' },
    { id: 'detail-004', task_id: 'task-008', sort_order: 1000, title: '프론트엔드 컴포넌트 구조 설계', status: 'todo', assignee_id: 'mem-002', due_date: '2025-09-01', created_at: '2025-08-01T09:00:00Z' },
    { id: 'detail-005', task_id: 'task-008', sort_order: 2000, title: '공통 유틸 함수 작성', status: 'todo', assignee_id: 'mem-002', created_at: '2025-08-01T09:00:00Z' },
    { id: 'detail-006', task_id: 'task-009', sort_order: 1000, title: '단위 테스트 작성', status: 'todo', assignee_id: 'mem-002', due_date: '2025-09-15', created_at: '2025-08-05T09:00:00Z' },
  ],

  addCompany: (company) => set((s) => ({ companies: [...s.companies, company] })),
  updateCompany: (id, changes) => set((s) => ({
    companies: s.companies.map((c) => c.id === id ? { ...c, ...changes } : c),
  })),
  deleteCompany: (id) => set((s) => ({
    companies: s.companies.filter((c) => c.id !== id),
    members: s.members.filter((m) => m.company_id !== id),
  })),

  addMember: (member) => set((s) => ({ members: [...s.members, member] })),
  updateMember: (id, changes) => set((s) => ({
    members: s.members.map((m) => m.id === id ? { ...m, ...changes } : m),
  })),
  deleteMember: (id) => set((s) => ({
    members: s.members.filter((m) => m.id !== id),
    assignments: s.assignments.filter((a) => a.member_id !== id),
  })),

  addAssignment: (assignment) => {
    set((s) => ({ assignments: [...s.assignments, assignment] }))
    // 로그: 담당자 배정
    const member = get().members.find((m) => m.id === assignment.member_id)
    const task = useTaskStore.getState().tasks.find((t) => t.id === assignment.task_id)
    logActivity({
      action: 'create',
      targetType: 'assignment',
      targetId: assignment.id,
      targetName: member?.name || assignment.member_id,
      parentTaskName: task?.task_name,
      details: `[${task?.task_name || ''}]에 ${member?.name || ''} 배정`,
    })
  },
  updateAssignment: (id, changes) => set((s) => ({
    assignments: s.assignments.map((a) => a.id === id ? { ...a, ...changes } : a),
  })),
  removeAssignment: (id) => set((s) => ({ assignments: s.assignments.filter((a) => a.id !== id) })),
  getTaskAssignments: (taskId) => get().assignments.filter((a) => a.task_id === taskId),

  addTaskDetail: (detail) => {
    set((s) => ({ taskDetails: [...s.taskDetails, detail] }))
    const task = useTaskStore.getState().tasks.find((t) => t.id === detail.task_id)
    logActivity({
      action: 'create',
      targetType: 'detail',
      targetId: detail.id,
      targetName: detail.title,
      parentTaskName: task?.task_name,
      details: `[${task?.task_name || ''}]에 세부항목 '${detail.title}' 등록`,
    })
  },

  updateTaskDetail: (id, changes) => {
    const before = get().taskDetails.find((d) => d.id === id)
    // 상태 변경 시 자동 날짜 기록
    const autoFields: Partial<TaskDetail> = {}
    if (changes.status && before && changes.status !== before.status) {
      const now = new Date().toISOString()
      if (changes.status === 'in_progress' && !before.started_at) {
        autoFields.started_at = now
      }
      if (changes.status === 'done') {
        autoFields.completed_at = now
        if (!before.started_at) autoFields.started_at = now
      }
      if (changes.status === 'todo') {
        autoFields.completed_at = undefined
      }
    }
    set((s) => ({
      taskDetails: s.taskDetails.map((d) => d.id === id ? { ...d, ...changes, ...autoFields } : d),
    }))
    if (before && changes.status && changes.status !== before.status) {
      const statusLabel: Record<string, string> = { todo: '대기', in_progress: '진행중', done: '완료' }
      const task = useTaskStore.getState().tasks.find((t) => t.id === before.task_id)
      logActivity({
        action: changes.status === 'done' ? 'complete' : 'status_change',
        targetType: 'detail',
        targetId: id,
        targetName: before.title,
        parentTaskName: task?.task_name,
        details: `상태: ${statusLabel[before.status] || before.status} → ${statusLabel[changes.status] || changes.status}`,
      })
    }
  },

  deleteTaskDetail: (id) => {
    const detail = get().taskDetails.find((d) => d.id === id)
    set((s) => ({ taskDetails: s.taskDetails.filter((d) => d.id !== id) }))
    if (detail) {
      const task = useTaskStore.getState().tasks.find((t) => t.id === detail.task_id)
      logActivity({
        action: 'delete',
        targetType: 'detail',
        targetId: id,
        targetName: detail.title,
        parentTaskName: task?.task_name,
        details: `세부항목 '${detail.title}' 삭제`,
      })
    }
  },
  getTaskDetails: (taskId) => get().taskDetails.filter((d) => d.task_id === taskId),

  addAttachment: (detailId, attachment) => {
    set((s) => ({
      taskDetails: s.taskDetails.map((d) =>
        d.id === detailId
          ? { ...d, attachments: [...(d.attachments || []), attachment] }
          : d
      ),
    }))
    const detail = get().taskDetails.find((d) => d.id === detailId)
    if (detail) {
      const task = useTaskStore.getState().tasks.find((t) => t.id === detail.task_id)
      logActivity({
        action: 'update',
        targetType: 'detail',
        targetId: detailId,
        targetName: detail.title,
        parentTaskName: task?.task_name,
        details: `첨부파일 '${attachment.filename}' 추가`,
      })
    }
  },

  removeAttachment: (detailId, attachmentId) => {
    const detail = get().taskDetails.find((d) => d.id === detailId)
    const attachment = detail?.attachments?.find((a) => a.id === attachmentId)
    set((s) => ({
      taskDetails: s.taskDetails.map((d) =>
        d.id === detailId
          ? { ...d, attachments: (d.attachments || []).filter((a) => a.id !== attachmentId) }
          : d
      ),
    }))
    if (detail && attachment) {
      const task = useTaskStore.getState().tasks.find((t) => t.id === detail.task_id)
      logActivity({
        action: 'update',
        targetType: 'detail',
        targetId: detailId,
        targetName: detail.title,
        parentTaskName: task?.task_name,
        details: `첨부파일 '${attachment.filename}' 삭제`,
      })
    }
  },

  addComment: (detailId, comment) => {
    set((s) => ({
      taskDetails: s.taskDetails.map((d) =>
        d.id === detailId
          ? { ...d, comments: [...(d.comments || []), comment] }
          : d
      ),
    }))
    const detail = get().taskDetails.find((d) => d.id === detailId)
    if (detail) {
      const task = useTaskStore.getState().tasks.find((t) => t.id === detail.task_id)
      logActivity({
        action: 'update',
        targetType: 'detail',
        targetId: detailId,
        targetName: detail.title,
        parentTaskName: task?.task_name,
        details: `코멘트 등록: "${comment.content.slice(0, 30)}${comment.content.length > 30 ? '...' : ''}"`,
      })
    }
  },

  deleteComment: (detailId, commentId) => {
    const detail = get().taskDetails.find((d) => d.id === detailId)
    const comment = detail?.comments?.find((c) => c.id === commentId)
    set((s) => ({
      taskDetails: s.taskDetails.map((d) =>
        d.id === detailId
          ? { ...d, comments: (d.comments || []).filter((c) => c.id !== commentId) }
          : d
      ),
    }))
    if (detail && comment) {
      const task = useTaskStore.getState().tasks.find((t) => t.id === detail.task_id)
      logActivity({
        action: 'update',
        targetType: 'detail',
        targetId: detailId,
        targetName: detail.title,
        parentTaskName: task?.task_name,
        details: `코멘트 삭제`,
      })
    }
  },
}), {
  name: 'xlgantt-resources',
  version: 1,
  merge: (persisted: unknown, current: ResourceState) => {
    const p = persisted as Partial<ResourceState> | undefined
    if (!p) return current
    return {
      ...current,
      companies: p.companies?.length ? p.companies : current.companies,
      members: p.members?.length ? p.members : current.members,
      assignments: p.assignments || current.assignments,
      taskDetails: p.taskDetails || current.taskDetails,
    }
  },
}))
