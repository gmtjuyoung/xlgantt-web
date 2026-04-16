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
    progress_percent: (row.progress_percent as number) ?? 0,
  }
}

/** DB row → 로컬 TaskDetail 변환 */
function dbToTaskDetail(row: Record<string, unknown>): TaskDetail {
  // JSONB → 배열 파싱 (DB에서 string 또는 배열로 올 수 있음)
  const parseJson = <T>(val: unknown): T[] => {
    if (!val) return []
    if (Array.isArray(val)) return val as T[]
    if (typeof val === 'string') {
      try { return JSON.parse(val) } catch { return [] }
    }
    return []
  }
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
    attachments: parseJson(row.attachments),
    comments: parseJson(row.comments),
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

  // Attachment CRUD (Supabase Storage 연동)
  uploadAttachment: (detailId: string, file: File) => Promise<TaskAttachment | null>
  removeAttachment: (detailId: string, attachmentId: string) => void

  // Comment CRUD
  addComment: (detailId: string, comment: TaskComment) => void
  deleteComment: (detailId: string, commentId: string) => void
}

/** 세부항목 기반 진척률/작업량 자동 계산 (B방식) */
function syncTaskProgress(taskId: string, taskDetails: TaskDetail[]) {
  const details = taskDetails.filter((d) => d.task_id === taskId)
  if (details.length === 0) return // 세부항목 없으면 수동 모드 유지
  const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
  if (!task) return

  const doneCount = details.filter((d) => d.status === 'done').length
  const detailProgress = doneCount / details.length
  const workload = details.length // 1 세부항목 = 1 M/D

  // 담당자 진척률이 하나라도 0% 초과로 입력된 경우에만 담당자값을 우선 적용.
  // (기본값 0%로 생성된 담당자 배정이 세부항목 자동 100%를 덮어쓰지 않도록)
  const assignments = useResourceStore.getState().assignments.filter((a) => a.task_id === taskId)
  const hasMeaningfulAssignmentProgress = assignments.some((a) => (a.progress_percent || 0) > 0)
  let progress = detailProgress
  if (hasMeaningfulAssignmentProgress) {
    const totalAllocation = assignments.reduce((sum, a) => sum + Math.max(0, a.allocation_percent || 0), 0)
    const totalWeight = totalAllocation > 0 ? totalAllocation : assignments.length
    if (totalWeight > 0) {
      progress = assignments.reduce((sum, a) => {
        const weight = totalAllocation > 0 ? Math.max(0, a.allocation_percent || 0) : 1
        const memberProgress = Math.max(0, Math.min(100, a.progress_percent || 0)) / 100
        return sum + (memberProgress * weight)
      }, 0) / totalWeight
    }
  }

  // undo 스냅샷 없이 자동 업데이트
  useTaskStore.getState()._updateTaskSilent(
    taskId,
    task.actual_progress_override != null
      ? { total_workload: workload }
      : { actual_progress: progress, total_workload: workload }
  )
}

/** 담당자별 진척률 기반 자동 계산 (담당자 지정 시 우선 소스) */
function syncTaskProgressFromAssignments(taskId: string, assignments: TaskAssignment[]) {
  const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
  if (!task || task.actual_progress_override != null) return

  const taskAssigns = assignments.filter((a) => a.task_id === taskId)
  if (taskAssigns.length === 0) return

  const details = useResourceStore.getState().taskDetails.filter((d) => d.task_id === taskId)
  const hasDetails = details.length > 0

  const totalAllocation = taskAssigns.reduce((sum, a) => sum + Math.max(0, a.allocation_percent || 0), 0)
  const totalWeight = totalAllocation > 0 ? totalAllocation : taskAssigns.length
  if (totalWeight <= 0) return

  const assignmentProgress = taskAssigns.reduce((sum, a) => {
    const weight = totalAllocation > 0 ? Math.max(0, a.allocation_percent || 0) : 1
    const memberProgress = Math.max(0, Math.min(100, a.progress_percent || 0)) / 100
    return sum + (memberProgress * weight)
  }, 0) / totalWeight

  let progress = assignmentProgress
  if (hasDetails) {
    const doneCount = details.filter((d) => d.status === 'done').length
    const detailProgress = doneCount / details.length
    const hasMeaningfulAssignmentProgress = taskAssigns.some((a) => (a.progress_percent || 0) > 0)
    progress = hasMeaningfulAssignmentProgress ? assignmentProgress : detailProgress
  }

  useTaskStore.getState()._updateTaskSilent(taskId, { actual_progress: progress })
}

// 샘플 데이터 제거 - DB가 단일 진실 소스

export const useResourceStore = create<ResourceState>()((set, get) => ({
  companies: [],
  members: [],
  assignments: [],
  taskDetails: [],

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

    // 서버 데이터로 교체 (비어있으면 빈 배열)
    set({
      companies: companies || [],
      members: members || [],
      assignments: assignments || [],
      taskDetails: get().taskDetails, // taskDetails는 위에서 이미 set됨, 안 됐으면 유지
    })
    // task가 없어서 taskDetails 쿼리가 안 돈 경우 빈 배열로
    if (!taskData || taskData.length === 0) {
      set({ taskDetails: [] })
    }

    // 담당자 진척률 우선 동기화
    if (taskData && taskData.length > 0) {
      const allTaskIds = taskData.map((t: Record<string, unknown>) => t.id as string)
      for (const tid of allTaskIds) {
        syncTaskProgressFromAssignments(tid, get().assignments)
      }
    }

    // 담당자가 없는 작업은 세부항목 기반으로 동기화
    const allDetails = get().taskDetails
    const taskIdsWithDetails = [...new Set(allDetails.map((d) => d.task_id))]
    for (const tid of taskIdsWithDetails) {
      syncTaskProgress(tid, allDetails)
    }
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
      progress_percent: assignment.progress_percent ?? 0,
    }).then(({ error }) => {
      if (error) console.error('배정 추가 실패:', error.message)
    })
    syncTaskProgressFromAssignments(assignment.task_id, get().assignments)
  },
  updateAssignment: (id, changes) => {
    const before = get().assignments.find((a) => a.id === id)
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
    const updated = get().assignments.find((a) => a.id === id)
    const taskId = updated?.task_id || before?.task_id
    if (taskId) {
      syncTaskProgressFromAssignments(taskId, get().assignments)
    }
  },
  removeAssignment: (id) => {
    const before = get().assignments.find((a) => a.id === id)
    set((s) => ({ assignments: s.assignments.filter((a) => a.id !== id) }))
    supabase.from('task_assignments').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('배정 삭제 실패:', error.message)
    })
    if (before?.task_id) {
      syncTaskProgressFromAssignments(before.task_id, get().assignments)
    }
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
    // 세부항목 기반 진척률/작업량 자동 재계산
    syncTaskProgress(detail.task_id, get().taskDetails)
    // 세부항목 담당자 → task_assignments 자동 동기화
    if (detail.assignee_ids && detail.assignee_ids.length > 0) {
      const existingAssigns = get().assignments.filter((a) => a.task_id === detail.task_id)
      const existingMemberIds = new Set(existingAssigns.map((a) => a.member_id))
      for (const memberId of detail.assignee_ids) {
        if (!existingMemberIds.has(memberId)) {
          get().addAssignment({
            id: crypto.randomUUID(),
            task_id: detail.task_id,
            member_id: memberId,
            allocation_percent: 100,
            progress_percent: 0,
          })
        }
      }
    }
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
    if (changes.assignee_id !== undefined) dbChanges.assignee_ids = changes.assignee_ids || (changes.assignee_id ? [changes.assignee_id] : [])
    if (changes.due_date !== undefined) dbChanges.due_date = changes.due_date || null
    if (changes.sort_order !== undefined) dbChanges.sort_order = changes.sort_order
    if (changes.attachments !== undefined) dbChanges.attachments = JSON.stringify(changes.attachments || [])
    if (changes.comments !== undefined) dbChanges.comments = JSON.stringify(changes.comments || [])
    // autoFields도 반영
    if (autoFields.started_at !== undefined) dbChanges.started_at = autoFields.started_at || null
    if (autoFields.completed_at !== undefined) dbChanges.completed_at = autoFields.completed_at || null
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
    // 세부항목 담당자 변경 시 → task_assignments 자동 동기화
    if (before && changes.assignee_ids) {
      const newIds = changes.assignee_ids || []
      const existingAssigns = get().assignments.filter((a) => a.task_id === before.task_id)
      const existingMemberIds = new Set(existingAssigns.map((a) => a.member_id))
      for (const memberId of newIds) {
        if (!existingMemberIds.has(memberId)) {
          // task_assignment가 없으면 자동 생성
          get().addAssignment({
            id: crypto.randomUUID(),
            task_id: before.task_id,
            member_id: memberId,
            allocation_percent: 100,
            progress_percent: 0,
          })
        }
      }
    }
    // 세부항목 기반 진척률/작업량 자동 재계산
    if (before) {
      syncTaskProgress(before.task_id, get().taskDetails)
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
      // 세부항목 기반 진척률/작업량 자동 재계산
      syncTaskProgress(detail.task_id, get().taskDetails)
    }
    supabase.from('task_details').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('세부항목 삭제 실패:', error.message)
    })
  },
  getTaskDetails: (taskId) => get().taskDetails.filter((d) => d.task_id === taskId),

  uploadAttachment: async (detailId, file) => {
    const detail = get().taskDetails.find((d) => d.id === detailId)
    if (!detail) return null

    const attachId = crypto.randomUUID()
    const storagePath = `${detail.task_id}/${detailId}/${attachId}_${file.name}`

    // 1. Supabase Storage에 파일 업로드
    const { error: uploadErr } = await supabase.storage
      .from('task-attachments')
      .upload(storagePath, file, { contentType: file.type, upsert: false })
    if (uploadErr) {
      console.error('파일 업로드 실패:', uploadErr.message)
      return null
    }

    // 2. 공개 URL 생성
    const { data: urlData } = supabase.storage
      .from('task-attachments')
      .getPublicUrl(storagePath)

    const user = useAuthStore.getState().currentUser
    const attachment: TaskAttachment = {
      id: attachId,
      filename: file.name,
      size: file.size,
      type: file.type,
      storage_path: storagePath,
      url: urlData.publicUrl,
      uploaded_by: user?.name || '시스템',
      uploaded_at: new Date().toISOString(),
    }

    // 3. 로컬 상태 업데이트
    set((s) => ({
      taskDetails: s.taskDetails.map((d) =>
        d.id === detailId
          ? { ...d, attachments: [...(d.attachments || []), attachment] }
          : d
      ),
    }))

    // 4. DB JSONB 업데이트
    const updated = get().taskDetails.find((d) => d.id === detailId)
    await supabase.from('task_details')
      .update({ attachments: JSON.stringify(updated?.attachments || []) })
      .eq('id', detailId)
      .then(({ error }) => { if (error) console.error('첨부파일 메타 저장 실패:', error.message) })

    const task = useTaskStore.getState().tasks.find((t) => t.id === detail.task_id)
    logActivity({
      action: 'update',
      targetType: 'detail',
      targetId: detailId,
      targetName: detail.title,
      parentTaskName: task?.task_name,
      details: `첨부파일 '${attachment.filename}' 추가`,
    })

    return attachment
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
      // Storage에서 파일 삭제
      if (attachment.storage_path) {
        supabase.storage.from('task-attachments').remove([attachment.storage_path])
          .then(({ error }) => { if (error) console.error('Storage 파일 삭제 실패:', error.message) })
      }
      // DB JSONB 업데이트
      const updated = get().taskDetails.find((d) => d.id === detailId)
      supabase.from('task_details').update({ attachments: JSON.stringify(updated?.attachments || []) }).eq('id', detailId)
        .then(({ error }) => { if (error) console.error('첨부파일 삭제 저장 실패:', error.message) })
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
      supabase.from('task_details').update({ comments: JSON.stringify(detail.comments || []) }).eq('id', detailId)
        .then(({ error }) => { if (error) console.error('코멘트 저장 실패:', error.message) })
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
      const updated = get().taskDetails.find((d) => d.id === detailId)
      supabase.from('task_details').update({ comments: JSON.stringify(updated?.comments || []) }).eq('id', detailId)
        .then(({ error }) => { if (error) console.error('코멘트 삭제 저장 실패:', error.message) })
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
