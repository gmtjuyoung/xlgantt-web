import { ArrowLeft, Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '@/stores/project-store'
import { useAuthStore } from '@/stores/auth-store'

export function MobileHeader() {
  const navigate = useNavigate()
  const project = useProjectStore((s) => s.currentProject)
  const user = useAuthStore((s) => s.currentUser)

  return (
    <div className="flex items-center h-12 px-3 border-b border-border/40 bg-background flex-shrink-0 safe-top">
      <button
        onClick={() => navigate('/projects')}
        className="p-1.5 -ml-1 rounded-lg hover:bg-accent/50 active:bg-accent"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="flex-1 min-w-0 mx-2">
        <h1 className="text-sm font-bold truncate">{project?.name || 'XLGantt'}</h1>
      </div>

      <button className="p-1.5 rounded-lg hover:bg-accent/50 active:bg-accent relative">
        <Bell className="h-5 w-5 text-muted-foreground" />
      </button>

      {user && (
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold ml-1.5 flex-shrink-0">
          {user.name.charAt(0)}
        </div>
      )}
    </div>
  )
}
