import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { GanttView } from '@/components/gantt/GanttView'
import { ProgressDashboard } from '@/components/progress/ProgressDashboard'
import { CalendarManager } from '@/components/calendar/CalendarManager'
import { ProjectSettings } from '@/components/settings/ProjectSettings'
import { ResourceManager } from '@/components/settings/ResourceManager'
import { ActivityTimeline } from '@/components/activity/ActivityTimeline'
import { MyTasksDashboard } from '@/components/mytasks/MyTasksDashboard'
import { MemberTasksView } from '@/components/member-tasks/MemberTasksView'
import { useProjectStore } from '@/stores/project-store'
import { useTaskStore } from '@/stores/task-store'
import { useResourceStore } from '@/stores/resource-store'
import { useUIStore } from '@/stores/ui-store'
import { useUndoStore } from '@/stores/undo-store'
import { useAuthStore } from '@/stores/auth-store'
import { useActivityStore } from '@/stores/activity-store'
import { SAMPLE_PROJECT, SAMPLE_TASKS, SAMPLE_DEPENDENCIES } from '@/lib/sample-data'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { MobileShell } from '@/components/mobile/MobileShell'
import { MobileContent } from '@/components/mobile/MobileContent'

function MainContent() {
  const activeView = useUIStore((s) => s.activeView)

  switch (activeView) {
    case 'gantt':
      return <GanttView />
    case 'progress':
      return <ProgressDashboard />
    case 'analysis':
      return <ProgressDashboard />
    case 'workload':
      return <ProgressDashboard />
    case 'calendar':
      return <CalendarManager />
    case 'resources':
      return <ResourceManager />
    case 'settings':
      return <ProjectSettings />
    case 'activity':
      return <ActivityTimeline />
    case 'mytasks':
      return <MyTasksDashboard />
    case 'memberTasks':
      return <MemberTasksView />
    default:
      return <GanttView />
  }
}

export function ProjectWorkspace() {
  const { projectId } = useParams<{ projectId: string }>()
  const { switchProject, currentProject, setProject, loadProjectMembers } = useProjectStore()
  const { setTasks, setDependencies, loadTasks, loadDependencies } = useTaskStore()
  const { loadResources } = useResourceStore()
  const fetchAllUsers = useAuthStore((s) => s.fetchAllUsers)
  const loadActivityLogs = useActivityStore((s) => s.loadLogs)
  const currentUserId = useAuthStore((s) => s.currentUser?.id)
  const clearUndo = useUndoStore((s) => s.clear)

  useEffect(() => {
    if (!projectId) return

    // 프로젝트 전환 시 undo 스택 초기화
    clearUndo()
    switchProject(projectId)

    // Supabase에서 데이터 로드 시도
    const loadFromServer = async () => {
      try {
        await Promise.all([
          loadTasks(projectId),
          loadDependencies(projectId),
          loadResources(projectId),
          loadProjectMembers(projectId),
          fetchAllUsers(),
          // 활동로그도 DB에서 로드 (현재 사용자 기준, 첫 페이지)
          loadActivityLogs(projectId, { userId: currentUserId, offset: 0, limit: 50 }),
        ])
        // 서버에서 작업 데이터가 비어있고, 샘플 프로젝트인 경우 폴백
        const { tasks } = useTaskStore.getState()
        if (tasks.length === 0 && projectId === SAMPLE_PROJECT.id) {
          if (!currentProject || currentProject.id !== SAMPLE_PROJECT.id) {
            setProject(SAMPLE_PROJECT)
          }
          setTasks(SAMPLE_TASKS)
          setDependencies(SAMPLE_DEPENDENCIES)
        }
      } catch (err) {
        console.error('서버 데이터 로드 실패, 폴백 사용:', err)
        // 폴백: 샘플 프로젝트인 경우 샘플 데이터 사용
        if (projectId === SAMPLE_PROJECT.id) {
          if (!currentProject || currentProject.id !== SAMPLE_PROJECT.id) {
            setProject(SAMPLE_PROJECT)
          }
          setTasks(SAMPLE_TASKS)
          setDependencies(SAMPLE_DEPENDENCIES)
        } else {
          setTasks([])
          setDependencies([])
        }
      }
    }
    loadFromServer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <MobileShell>
        <MobileContent />
      </MobileShell>
    )
  }

  return (
    <AppShell>
      <MainContent />
    </AppShell>
  )
}
