import { useNavigate } from 'react-router-dom'
import { ChevronDown, FolderOpen } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/project-store'

export function ProjectSwitcher() {
  const navigate = useNavigate()
  const { projects, currentProject } = useProjectStore()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex items-center gap-1.5 px-2 h-8 text-sm font-semibold cursor-pointer rounded-md hover:bg-accent/50 transition-colors whitespace-nowrap">
          <span className="truncate max-w-[140px]">{currentProject?.name || '프로젝트 선택'}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 flex-shrink-0" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => navigate(`/projects/${p.id}`)}
            className={p.id === currentProject?.id ? 'bg-accent' : ''}
          >
            <span className="truncate">{p.name}</span>
            {p.id === currentProject?.id && <span className="ml-auto text-xs text-primary">현재</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/projects')}>
          <FolderOpen className="h-3.5 w-3.5 mr-2" />
          모든 프로젝트
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
