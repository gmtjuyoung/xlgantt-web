import { create } from 'zustand'
import type { Project, ColorTheme } from '@/lib/types'
import { THEME_PRESETS } from '@/lib/types'

interface ProjectState {
  projects: Project[]           // 모든 프로젝트 목록
  currentProject: Project | null // 현재 선택된 프로젝트
  theme: ColorTheme
  isLoading: boolean

  setProjects: (projects: Project[]) => void
  addProject: (project: Project) => void
  deleteProject: (id: string) => void
  switchProject: (id: string) => void  // currentProject 변경
  setProject: (project: Project) => void  // 하위 호환: currentProject 설정 + projects에 추가
  updateProject: (changes: Partial<Project>) => void  // currentProject 수정
  setTheme: (themeId: number) => void
  setLoading: (loading: boolean) => void
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

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: INITIAL_PROJECTS,
  currentProject: null,
  theme: THEME_PRESETS[0],
  isLoading: false,

  setProjects: (projects) => set({ projects }),

  addProject: (project) =>
    set((state) => ({
      projects: [...state.projects, project],
    })),

  deleteProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    })),

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

  updateProject: (changes) =>
    set((state) => {
      if (!state.currentProject) return {}
      const updated = { ...state.currentProject, ...changes }
      return {
        currentProject: updated,
        projects: state.projects.map((p) =>
          p.id === updated.id ? updated : p
        ),
      }
    }),

  setTheme: (themeId) =>
    set({ theme: THEME_PRESETS[themeId] || THEME_PRESETS[0] }),

  setLoading: (isLoading) => set({ isLoading }),
}))
