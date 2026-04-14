import { useUIStore } from '@/stores/ui-store'
import { MobileMyTasks } from './MobileMyTasks'
import { MobileProgressView } from './MobileProgressView'
import { MobileActivity } from './MobileActivity'
import { MobileTaskDetailSheet } from './MobileTaskDetailSheet'

export function MobileContent() {
  const activeTab = useUIStore((s) => s.mobileActiveTab)
  const mobileTaskId = useUIStore((s) => s.mobileTaskId)

  return (
    <>
      {activeTab === 'mytasks' && <MobileMyTasks />}
      {activeTab === 'progress' && <MobileProgressView />}
      {activeTab === 'activity' && <MobileActivity />}

      {/* 작업 상세 하단 시트 (어느 탭에서든 열림) */}
      {mobileTaskId && <MobileTaskDetailSheet />}
    </>
  )
}
