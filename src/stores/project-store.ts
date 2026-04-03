import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project, ColorTheme } from '@/lib/types'
import { THEME_PRESETS } from '@/lib/types'
import { supabase } from '@/lib/supabase'

export type ProjectRole = 'owner' | 'pm' | 'editor' | 'viewer'

export interface ProjectMember {
  projectId: string
  userId: string    // auth-store User.id
  role: ProjectRole
}

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  theme: ColorTheme
  isLoading: boolean
  projectMembers: ProjectMember[]  // 프로젝트별 멤버/역할

  loadProjects: () => Promise<void>
  setProjects: (projects: Project[]) => void
  addProject: (project: Project) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  switchProject: (id: string) => void
  setProject: (project: Project) => void
  updateProject: (changes: Partial<Project>) => Promise<void>
  setTheme: (themeId: number) => void
  setLoading: (loading: boolean) => void

  // 프로젝트 멤버 관리
  addProjectMember: (member: ProjectMember) => void
  removeProjectMember: (projectId: string, userId: string) => void
  updateProjectMemberRole: (projectId: string, userId: string, role: ProjectRole) => void
  getProjectMembers: (projectId: string) => ProjectMember[]
  getMyProjectRole: (projectId: string, userId: string) => ProjectRole | null
}

// 초기 샘플 프로젝트 3개
const INITIAL_PROJECTS: Project[] = [
  {
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
  },
  {
    id: 'sample-project-002',
    name: 'DEF 프로젝트',
    description: '두 번째 샘플 프로젝트',
    start_date: '2025-09-01',
    end_date: '2026-03-31',
    owner_id: 'local',
    theme_id: 1,
    language: 'ko',
    zoom_level: 2,
    status_date: '2025-10-01',
    created_at: '2025-09-01T00:00:00Z',
    updated_at: '2025-09-01T00:00:00Z',
  },
  {
    id: 'sample-project-003',
    name: '신규 프로젝트',
    description: '새로 생성된 프로젝트',
    start_date: '2026-01-05',
    end_date: '2026-06-30',
    owner_id: 'local',
    theme_id: 2,
    language: 'ko',
    zoom_level: 2,
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z',
  },
]

/** DB row → 로컬 Project 변환 */
function dbToProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || undefined,
    start_date: row.start_date as string,
    end_date: row.end_date as string,
    owner_id: row.owner_id as string,
    theme_id: (row.theme_id as number) ?? 0,
    language: (row.language as 'ko' | 'en') || 'ko',
    zoom_level: (row.zoom_level as 1 | 2 | 3) ?? 2,
    status_date: (row.status_date as string) || undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

/** 로컬 Project → DB insert/update용 객체 */
function projectToDb(p: Project): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    description: p.description || null,
    start_date: p.start_date,
    end_date: p.end_date,
    owner_id: p.owner_id,
    theme_id: p.theme_id,
    language: p.language,
    zoom_level: p.zoom_level,
    status_date: p.status_date || null,
  }
}

export const useProjectStore = create<ProjectState>()(persist((set, get) => ({
  projects: INITIAL_PROJECTS,
  currentProject: null,
  theme: THEME_PRESETS[0],
  isLoading: false,
  projectMembers: [] as ProjectMember[],

  loadProjects: async () => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) {
      console.error('프로젝트 목록 로드 실패:', error.message)
      // 폴백: INITIAL_PROJECTS 유지
    } else if (data && data.length > 0) {
      set({ projects: data.map(dbToProject) })
    }
    // data가 빈 배열인 경우도 INITIAL_PROJECTS 폴백 유지
    set({ isLoading: false })
  },

  setProjects: (projects) => set({ projects }),

  addProject: async (project) => {
    // 낙관적 업데이트
    set((state) => ({
      projects: [...state.projects, project],
    }))
    // 서버 저장
    const { error } = await supabase.from('projects').insert(projectToDb(project))
    if (error) {
      console.error('프로젝트 추가 실패:', error.message)
    }
  },

  deleteProject: async (id) => {
    // 낙관적 업데이트
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    }))
    // 서버 삭제
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) {
      console.error('프로젝트 삭제 실패:', error.message)
    }
  },

  switchProject: (id) => {
    const project = get().projects.find((p) => p.id === id)
    if (project) {
      set({
        currentProject: project,
        theme: THEME_PRESETS[project.theme_id] || THEME_PRESETS[0],
      })
    }
  },

  setProject: (project) =>
    set((state) => {
      const exists = state.projects.some((p) => p.id === project.id)
      return {
        currentProject: project,
        projects: exists
          ? state.projects.map((p) => (p.id === project.id ? project : p))
          : [...state.projects, project],
        theme: THEME_PRESETS[project.theme_id] || THEME_PRESETS[0],
      }
    }),

  updateProject: async (changes) => {
    const currentProject = get().currentProject
    if (!currentProject) return
    const updated = { ...currentProject, ...changes }
    // 낙관적 업데이트
    set((state) => ({
      currentProject: updated,
      projects: state.projects.map((p) =>
        p.id === updated.id ? updated : p
      ),
    }))
    // 서버 업데이트
    const { error } = await supabase
      .from('projects')
      .update(projectToDb(updated))
      .eq('id', updated.id)
    if (error) {
      console.error('프로젝트 업데이트 실패:', error.message)
    }
  },

  setTheme: (themeId) =>
    set({ theme: THEME_PRESETS[themeId] || THEME_PRESETS[0] }),

  setLoading: (isLoading) => set({ isLoading }),

  // 프로젝트 멤버 관리
  addProjectMember: (member) => {
    set((s) => ({
      projectMembers: [...s.projectMembers.filter((m) => !(m.projectId === member.projectId && m.userId === member.userId)), member],
    }))
    supabase.from('project_members').upsert({
      project_id: member.projectId,
      user_id: member.userId,
      role: member.role === 'pm' ? 'editor' : member.role, // DB는 owner/editor/viewer만
    }).then(({ error }) => {
      if (error) console.error('프로젝트 멤버 추가 실패:', error.message)
    })
  },

  removeProjectMember: (projectId, userId) => {
    set((s) => ({
      projectMembers: s.projectMembers.filter((m) => !(m.projectId === projectId && m.userId === userId)),
    }))
    supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
      .then(({ error }) => { if (error) console.error('프로젝트 멤버 삭제 실패:', error.message) })
  },

  updateProjectMemberRole: (projectId, userId, role) => {
    set((s) => ({
      projectMembers: s.projectMembers.map((m) =>
        m.projectId === projectId && m.userId === userId ? { ...m, role } : m
      ),
    }))
    supabase.from('project_members').update({ role: role === 'pm' ? 'editor' : role })
      .eq('project_id', projectId).eq('user_id', userId)
      .then(({ error }) => { if (error) console.error('프로젝트 멤버 역할 변경 실패:', error.message) })
  },

  getProjectMembers: (projectId) => get().projectMembers.filter((m) => m.projectId === projectId),

  getMyProjectRole: (projectId, userId) => {
    const member = get().projectMembers.find((m) => m.projectId === projectId && m.userId === userId)
    return member?.role || null
  },
}), {
  name: 'xlgantt-projects',
  partialize: (state) => ({ projects: state.projects, projectMembers: state.projectMembers }),
}))
