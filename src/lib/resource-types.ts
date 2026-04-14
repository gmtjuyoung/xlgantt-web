// ============================================================
// 회사/담당자 관리 타입 정의
// ============================================================

export interface Company {
  id: string
  name: string
  shortName: string  // 약칭 (예: "GMT", "삼성SDS")
  color: string      // 구분 색상
  created_at: string
}

export interface TeamMember {
  id: string
  company_id: string
  name: string
  email?: string
  role?: string        // 직책/역할
  phone?: string
  created_at: string
}

export interface TaskAssignment {
  id: string
  task_id: string
  member_id: string
  allocation_percent: number // 1-100
}

// WBS 세부항목 (작업의 하위 체크리스트/작업항목)
export interface TaskDetail {
  id: string
  task_id: string
  sort_order: number
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done'
  assignee_id?: string  // TeamMember id (deprecated, use assignee_ids)
  assignee_ids?: string[]  // TeamMember ids
  due_date?: string
  started_at?: string    // 진행 시작일
  completed_at?: string  // 완료일
  created_at: string
  attachments?: TaskAttachment[]
  comments?: TaskComment[]
}

export interface TaskAttachment {
  id: string
  filename: string
  size: number        // bytes
  type: string        // MIME type
  storage_path: string // Supabase Storage 경로
  url: string          // 공개 다운로드 URL
  uploaded_by: string  // user name
  uploaded_at: string
}

export interface TaskComment {
  id: string
  user_id: string
  user_name: string
  content: string
  created_at: string
}
