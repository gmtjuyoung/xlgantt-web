import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { GanttView } from '@/components/gantt/GanttView'
import { ProgressDashboard } from '@/components/progress/ProgressDashboard'
import { AnalysisReport } from '@/components/analysis/AnalysisReport'
import { WorkloadView } from '@/components/workload/WorkloadView'
import { CalendarManager } from '@/components/calendar/CalendarManager'
import { ProjectSettings } from '@/components/settings/ProjectSettings'
import { ResourceManager } from '@/components/settings/ResourceManager'
import { ActivityTimeline } from '@/components/activity/ActivityTimeline'
import { MyTasksDashboard } from '@/components/mytasks/MyTasksDashboard'
import { useProjectStore } from '@/stores/project-store'
import { useTaskStore } from '@/stores/task-store'
import { useUIStore } from '@/stores/ui-store'
import { useUndoStore } from '@/stores/undo-store'
import { SAMPLE_PROJECT, SAMPLE_TASKS, SAMPLE_DEPENDENCIES } from '@/lib/sample-data'

function MainContent() {
  const activeView = useUIStore((s) => s.activeView)

  switch (activeView) {
    case 'gantt':
      return <GanttView />
    case 'progress':
      return <ProgressDashboard />
    case 'analysis':
      return <AnalysisReport />
    case 'workload':
      return <WorkloadView />
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
    default:
      return <GanttView />
  }
}

export function ProjectWorkspace() {
  const { projectId } = useParams<{ projectId: string }>()
  const { switchProject, currentProject, setProject } = useProjectStore()
  const { setTasks, setDependencies } = useTaskStore()
  const clearUndo = useUndoStore((s) => s.clear)

  useEffect(() => {
    if (!projectId) return

    // 프로젝트 전환 시 undo 스택 초기화
    clearUndo()
    switchProject(projectId)

    // sample-project-001인 경우 샘플 데이터 로드, 그 외는 초기화
    if (projectId === SAMPLE_PROJECT.id) {
      if (!currentProject || currentProject.id !== SAMPLE_PROJECT.id) {
        setProject(SAMPLE_PROJECT)
      }
      setTasks(SAMPLE_TASKS)
      setDependencies(SAMPLE_DEPENDENCIES)
    } else {
      // 다른 프로젝트는 빈 상태로 시작 (나중에 DB에서 로드)
      setTasks([])
      setDependencies([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  return (
    <AppShell>
      <MainContent />
    </AppShell>
  )
}
