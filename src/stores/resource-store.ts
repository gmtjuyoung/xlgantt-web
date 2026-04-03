import { create } from 'zustand'
import type { Company, TeamMember, TaskAssignment, TaskDetail, TaskAttachment, TaskComment } from '@/lib/resource-types'
import { useActivityStore } from '@/stores/activity-store'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectStore } from '@/stores/project-store'
import { useTaskStore } from '@/stores/task-store'
import { supabase } from '@/lib/supabase'

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

/** DB row → 로컬 Company 변환 */
function dbToCompany(row: Record<string, unknown>): Company {
  return {
    id: row.id as string,
    name: row.name as string,
    shortName: (row.short_name as string) || '',
    color: (row.color as string) || '#3b82f6',
    created_at: row.created_at as string,
  }
}

/** DB row → 로컬 TeamMember 변환 */
function dbToMember(row: Record<string, unknown>): TeamMember {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    name: row.name as string,
    email: (row.email as string) || undefined,
    role: (row.role as string) || undefined,
    phone: (row.phone as string) || undefined,
    created_at: row.created_at as string,
  }
}

/** DB row → 로컬 TaskAssignment 변환 */
function dbToAssignment(row: Record<string, unknown>): TaskAssignment {
  return {
    id: row.id as string,
    task_id: row.task_id as string,
    member_id: row.member_id as string,
    allocation_percent: (row.allocation_percent as number) ?? 100,
  }
}

/** DB row → 로컬 TaskDetail 변환 */
function dbToTaskDetail(row: Record<string, unknown>): TaskDetail {
  return {
    id: row.id as string,
    task_id: row.task_id as string,
    sort_order: (row.sort_order as number) ?? 0,
    title: (row.title as string) || '',
    description: (row.description as string) || undefined,
    status: (row.status as 'todo' | 'in_progress' | 'done') || 'todo',
    assignee_id: undefined,
    assignee_ids: (row.assignee_ids as string[]) || undefined,
    due_date: (row.due_date as string) || undefined,
    started_at: undefined,
    completed_at: undefined,
    created_at: row.created_at as string,
    attachments: [],
    comments: [],
  }
}

interface ResourceState {
  companies: Company[]
  members: TeamMember[]
  assignments: TaskAssignment[]
  taskDetails: TaskDetail[]

  // Load from Supabase
  loadResources: (projectId: string) => Promise<void>

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

export const useResourceStore = create<ResourceState>()((set, get) => ({
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

  loadResources: async (projectId) => {
    // 1. companies (프로젝트에 직접 연결)
    const { data: compData, error: compErr } = await supabase
      .from('companies')
      .select('*')
      .eq('project_id', projectId)
    if (compErr) {
      console.error('회사 로드 실패:', compErr.message)
    }
    const companies = compData ? compData.map(dbToCompany) : undefined

    // 2. team_members (companies를 통해 프로젝트에 연결)
    let members: TeamMember[] | undefined
    if (compData && compData.length > 0) {
      const companyIds = compData.map((c: Record<string, unknown>) => c.id as string)
      const { data: memData, error: memErr } = await supabase
        .from('team_members')
        .select('*')
        .in('company_id', companyIds)
      if (memErr) {
        console.error('팀원 로드 실패:', memErr.message)
      } else if (memData) {
        members = memData.map(dbToMember)
      }
    }

    // 3. task_assignments (tasks를 통해 프로젝트에 연결)
    const { data: taskData } = await supabase
      .from('tasks')
      .select('id')
      .eq('project_id', projectId)
    let assignments: TaskAssignment[] | undefined
    if (taskData && taskData.length > 0) {
      const taskIds = taskData.map((t: Record<string, unknown>) => t.id as string)
      const { data: assignData, error: assignErr } = await supabase
        .from('task_assignments')
        .select('*')
        .in('task_id', taskIds)
      if (assignErr) {
        console.error('배정 로드 실패:', assignErr.message)
      } else if (assignData) {
        assignments = assignData.map(dbToAssignment)
      }

      // 4. task_details
      const { data: detailData, error: detailErr } = await supabase
        .from('task_details')
        .select('*')
        .in('task_id', taskIds)
        .order('sort_order', { ascending: true })
      if (detailErr) {
        console.error('세부항목 로드 실패:', detailErr.message)
      } else if (detailData) {
        set({ taskDetails: detailData.map(dbToTaskDetail) })
      }
    }

    // 데이터가 있는 경우에만 로컬 상태 교체 (없으면 폴백 유지)
    const update: Partial<ResourceState> = {}
    if (companies && companies.length > 0) update.companies = companies
    if (members) update.members = members
    if (assignments) update.assignments = assignments
    if (Object.keys(update).length > 0) set(update as ResourceState)
  },

  addCompany: (company) => {
    set((s) => ({ companies: [...s.companies, company] }))
    const projectId = useProjectStore.getState().currentProject?.id
    supabase.from('companies').insert({
      id: company.id,
      project_id: projectId,
      name: company.name,
      short_name: company.shortName,
      color: company.color,
    }).then(({ error }) => {
      if (error) console.error('회사 추가 실패:', error.message)
    })
  },
  updateCompany: (id, changes) => {
    set((s) => ({
      companies: s.companies.map((c) => c.id === id ? { ...c, ...changes } : c),
    }))
    const dbChanges: Record<string, unknown> = {}
    if (changes.name !== undefined) dbChanges.name = changes.name
    if (changes.shortName !== undefined) dbChanges.short_name = changes.shortName
    if (changes.color !== undefined) dbChanges.color = changes.color
    if (Object.keys(dbChanges).length > 0) {
      supabase.from('companies').update(dbChanges).eq('id', id).then(({ error }) => {
        if (error) console.error('회사 업데이트 실패:', error.message)
      })
    }
  },
  deleteCompany: (id) => {
    set((s) => ({
      companies: s.companies.filter((c) => c.id !== id),
      members: s.members.filter((m) => m.company_id !== id),
    }))
    supabase.from('companies').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('회사 삭제 실패:', error.message)
    })
  },

  addMember: (member) => {
    set((s) => ({ members: [...s.members, member] }))
    supabase.from('team_members').insert({
      id: member.id,
      company_id: member.company_id,
      name: member.name,
      email: member.email || null,
      role: member.role || null,
      phone: member.phone || null,
    }).then(({ error }) => {
      if (error) console.error('팀원 추가 실패:', error.message)
    })
  },
  updateMember: (id, changes) => {
    set((s) => ({
      members: s.members.map((m) => m.id === id ? { ...m, ...changes } : m),
    }))
    const dbChanges: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(changes)) {
      dbChanges[key] = value ?? null
    }
    if (Object.keys(dbChanges).length > 0) {
      supabase.from('team_members').update(dbChanges).eq('id', id).then(({ error }) => {
        if (error) console.error('팀원 업데이트 실패:', error.message)
      })
    }
  },
  deleteMember: (id) => {
    set((s) => ({
      members: s.members.filter((m) => m.id !== id),
      assignments: s.assignments.filter((a) => a.member_id !== id),
    }))
    supabase.from('team_members').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('팀원 삭제 실패:', error.message)
    })
  },

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
    supabase.from('task_assignments').insert({
      id: assignment.id,
      task_id: assignment.task_id,
      member_id: assignment.member_id,
      allocation_percent: assignment.allocation_percent,
    }).then(({ error }) => {
      if (error) console.error('배정 추가 실패:', error.message)
    })
  },
  updateAssignment: (id, changes) => {
    set((s) => ({
      assignments: s.assignments.map((a) => a.id === id ? { ...a, ...changes } : a),
    }))
    const dbChanges: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(changes)) {
      dbChanges[key] = value ?? null
    }
    if (Object.keys(dbChanges).length > 0) {
      supabase.from('task_assignments').update(dbChanges).eq('id', id).then(({ error }) => {
        if (error) console.error('배정 업데이트 실패:', error.message)
      })
    }
  },
  removeAssignment: (id) => {
    set((s) => ({ assignments: s.assignments.filter((a) => a.id !== id) }))
    supabase.from('task_assignments').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('배정 삭제 실패:', error.message)
    })
  },
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
    supabase.from('task_details').insert({
      id: detail.id,
      task_id: detail.task_id,
      sort_order: detail.sort_order,
      title: detail.title,
      description: detail.description || null,
      status: detail.status,
      assignee_ids: detail.assignee_ids || [],
      due_date: detail.due_date || null,
    }).then(({ error }) => {
      if (error) console.error('세부항목 추가 실패:', error.message)
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
    // 서버 업데이트
    const dbChanges: Record<string, unknown> = {}
    if (changes.title !== undefined) dbChanges.title = changes.title
    if (changes.description !== undefined) dbChanges.description = changes.description || null
    if (changes.status !== undefined) dbChanges.status = changes.status
    if (changes.assignee_ids !== undefined) dbChanges.assignee_ids = changes.assignee_ids || []
    if (changes.due_date !== undefined) dbChanges.due_date = changes.due_date || null
    if (changes.sort_order !== undefined) dbChanges.sort_order = changes.sort_order
    if (Object.keys(dbChanges).length > 0) {
      supabase.from('task_details').update(dbChanges).eq('id', id).then(({ error }) => {
        if (error) console.error('세부항목 업데이트 실패:', error.message)
      })
    }
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
    supabase.from('task_details').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('세부항목 삭제 실패:', error.message)
    })
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
}))
