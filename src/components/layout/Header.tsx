import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Bell,
  Calendar,
  CalendarClock,
  ChevronDown,
  BarChart3,
  Download,
  Link,
  ZoomIn,
  ZoomOut,
  Settings,
  Users,
  UserCheck,
  TrendingUp,
  ClipboardList,
  PieChart,
  Activity,
  Clock,
  AlertTriangle,
  X,
  User,
  Shield,
  LogOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectStore } from '@/stores/project-store'
import { useTaskStore } from '@/stores/task-store'
import { useResourceStore } from '@/stores/resource-store'
import { useUIStore, type ViewMode } from '@/stores/ui-store'
import { exportToExcel } from '@/lib/excel-export'
import type { ZoomLevel } from '@/lib/types'
import { cn } from '@/lib/utils'
import { DatePicker } from '@/components/ui/date-picker'
import { ProjectSwitcher } from '@/components/layout/ProjectSwitcher'
import { useNavigate } from 'react-router-dom'

/* 그룹화된 탭 구조 - role 기반 표시 */
type TabDef = { key: ViewMode; label: string; icon: React.ReactNode; adminOnly?: boolean; pmOrAdmin?: boolean }
type TabGroup = { tabs: TabDef[] }

const TAB_GROUPS: TabGroup[] = [
  { tabs: [
    { key: 'gantt', label: '스케줄', icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { key: 'mytasks', label: '내 업무', icon: <ClipboardList className="h-3.5 w-3.5" /> },
    { key: 'memberTasks', label: '담당자 업무', icon: <UserCheck className="h-3.5 w-3.5" /> },
  ]},
  { tabs: [
    { key: 'progress', label: '진척현황', icon: <PieChart className="h-3.5 w-3.5" /> },
    { key: 'analysis', label: '분석', icon: <Activity className="h-3.5 w-3.5" /> },
    { key: 'workload', label: '작업량', icon: <TrendingUp className="h-3.5 w-3.5" />, pmOrAdmin: true },
  ]},
  { tabs: [
    { key: 'calendar', label: '달력', icon: <Calendar className="h-3.5 w-3.5" />, pmOrAdmin: true },
    { key: 'resources', label: '담당자', icon: <Users className="h-3.5 w-3.5" />, pmOrAdmin: true },
  ]},
]

const ICON_TABS: { key: ViewMode; icon: React.ReactNode; title: string; adminOnly?: boolean; pmOrAdmin?: boolean }[] = [
  { key: 'activity', icon: <Clock className="h-3.5 w-3.5" />, title: '활동 로그' },
  { key: 'settings', icon: <Settings className="h-3.5 w-3.5" />, title: '설정', adminOnly: true },
]

export function Header() {
  const navigate = useNavigate()
  const { currentUser, logout } = useAuthStore()
  const { currentProject: project, updateProject } = useProjectStore()
  const { tasks, dependencies } = useTaskStore()
  const { companies, members, assignments, taskDetails } = useResourceStore()
  const { activeView, setActiveView, zoomLevel, setZoomLevel, linkMode, toggleLinkMode, linkSourceTaskId } =
    useUIStore()

  const isAdmin = currentUser?.role === 'admin'
  // 프로젝트 역할도 체크 (프로젝트 내 PM이면 관리 메뉴 접근)
  const projectRole = project ? useProjectStore.getState().getMyProjectRole(project.id, currentUser?.id || '') : null
  const isPmOrAdmin = isAdmin || currentUser?.role === 'pm' || projectRole === 'pm'

  // role 기반 보이는 탭 목록 (모바일용)
  const allVisibleTabs = useMemo(() => {
    const tabs = TAB_GROUPS.flatMap((g) => g.tabs).filter((t) => (!t.adminOnly || isAdmin) && (!t.pmOrAdmin || isPmOrAdmin))
    const icons = ICON_TABS.filter((t) => (!t.adminOnly || isAdmin) && (!t.pmOrAdmin || isPmOrAdmin)).map((t) => ({ key: t.key, label: t.title, icon: t.icon }))
    return [...tabs, ...icons]
  }, [isAdmin, isPmOrAdmin])

  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  // 벨 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!bellOpen) return
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [bellOpen])

  // 현재 사용자 매칭 멤버
  const myMember = useMemo(() => {
    if (!currentUser) return null
    return (
      members.find((m) => m.email && m.email === currentUser.email) ||
      members.find((m) => m.name === currentUser.name) ||
      null
    )
  }, [currentUser, members])

  // 내게 배정된 작업 ID
  const myTaskIds = useMemo(() => {
    if (!myMember) return new Set<string>()
    return new Set(assignments.filter((a) => a.member_id === myMember.id).map((a) => a.task_id))
  }, [myMember, assignments])

  // 알림 항목 생성
  const notifications = useMemo(() => {
    if (!myMember) return []
    const ref = project?.status_date || new Date().toISOString().slice(0, 10)
    const items: { id: string; type: 'overdue_detail' | 'delayed_task' | 'new_task'; text: string; color: string }[] = []

    // 세부항목 기한 초과
    for (const taskId of myTaskIds) {
      const details = taskDetails.filter((d) => d.task_id === taskId && d.status !== 'done')
      for (const d of details) {
        const isMyDetail =
          !d.assignee_id && (!d.assignee_ids || d.assignee_ids.length === 0) ||
          d.assignee_id === myMember.id ||
          d.assignee_ids?.includes(myMember.id)
        if (isMyDetail && d.due_date && d.due_date < ref) {
          items.push({ id: `od-${d.id}`, type: 'overdue_detail', text: `세부항목 '${d.title}' 기한 초과`, color: 'text-red-600' })
        }
      }
    }

    // 지연 작업
    for (const taskId of myTaskIds) {
      const task = tasks.find((t) => t.id === taskId)
      if (task && task.planned_end && task.planned_end < ref && task.actual_progress < 1 && !task.is_group) {
        items.push({ id: `dt-${task.id}`, type: 'delayed_task', text: `작업 '${task.task_name}' 지연 중`, color: 'text-orange-600' })
      }
    }

    return items
  }, [myMember, myTaskIds, taskDetails, tasks, project?.status_date])

  // 읽은 알림 ID 추적
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const activeNotifications = notifications.filter((n) => !dismissedIds.has(n.id))
  const bellCount = activeNotifications.length

  const handleZoom = (delta: number) => {
    const newLevel = Math.max(1, Math.min(3, zoomLevel + delta)) as ZoomLevel
    setZoomLevel(newLevel)
  }

  const handleExport = () => {
    if (!project) return
    try {
      exportToExcel({ project, tasks, dependencies, companies, members, assignments })
    } catch (err) {
      alert(`엑셀 내보내기 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <header className="flex h-12 items-center border-b border-border/40 bg-background px-4 gap-3">
      {/* Home + Logo + Project Switcher */}
      <div className="flex items-center gap-2 mr-2 flex-shrink-0">
        <button
          onClick={() => navigate('/projects')}
          className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shadow-sm hover:opacity-80 transition-opacity"
          title="프로젝트 목록으로"
        >
          <BarChart3 className="h-3.5 w-3.5 text-primary-foreground" />
        </button>
        <ProjectSwitcher />
      </div>

      <div className="w-px h-6 bg-border/40 flex-shrink-0" />

      {/* View Tabs - Grouped (role-based) */}
      <nav className="hidden md:flex items-center">
        {TAB_GROUPS.map((group, gi) => {
          const visibleTabs = group.tabs.filter((t) => (!t.adminOnly || isAdmin) && (!t.pmOrAdmin || isPmOrAdmin))
          if (visibleTabs.length === 0) return null
          return (
            <div key={gi} className="flex items-center">
              {gi > 0 && <div className="w-px h-4 bg-border/40 mx-1" />}
              {visibleTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveView(tab.key)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-medium rounded-md transition-all",
                    activeView === tab.key
                      ? "text-primary bg-primary/8"
                      : "text-muted-foreground/70 hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {activeView === tab.key && (
                    <span className="absolute -bottom-[9px] left-2 right-2 h-[2px] bg-primary rounded-full" />
                  )}
                </button>
              ))}
            </div>
          )
        })}
      </nav>

      {/* Mobile view selector */}
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm">
            {allVisibleTabs.find((t) => t.key === activeView)?.label || '메뉴'}
            <ChevronDown className="ml-1 h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {allVisibleTabs.map((tab) => (
              <DropdownMenuItem key={tab.key} onClick={() => setActiveView(tab.key)}>
                {tab.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1" />

      {/* Icon Tabs (활동/설정) - role-based */}
      <div className="hidden md:flex items-center gap-0.5 flex-shrink-0">
        {ICON_TABS.filter((t) => (!t.adminOnly || isAdmin) && (!t.pmOrAdmin || isPmOrAdmin)).map((tab) => (
          <Button
            key={tab.key}
            variant={activeView === tab.key ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setActiveView(tab.key)}
            title={tab.title}
          >
            {tab.icon}
          </Button>
        ))}
      </div>

      <div className="w-px h-5 bg-border/30 flex-shrink-0" />

      {/* Status Date */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="text-[11px] font-medium text-muted-foreground/60 select-none">기준일</span>
        <DatePicker
          value={project?.status_date || ''}
          onChange={(d) => updateProject({ status_date: d || undefined })}
          placeholder="선택"
          className="h-7 text-xs font-medium w-[190px]"
        />
        {project?.status_date && (
          <button
            onClick={() => updateProject({ status_date: undefined })}
            className="p-0.5 rounded hover:bg-red-50 text-muted-foreground/50 hover:text-red-500 transition-colors"
            title="기준일 해제"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="w-px h-5 bg-border/30 flex-shrink-0" />

      {/* Export */}
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExport} title="엑셀 내보내기">
        <Download className="h-3.5 w-3.5" />
      </Button>

      {/* Notification Bell */}
      <div className="relative flex-shrink-0" ref={bellRef}>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 relative"
          onClick={() => setBellOpen((v) => !v)}
          title="알림"
        >
          <Bell className="h-3.5 w-3.5" />
          {bellCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5 leading-none">
              {bellCount > 99 ? '99+' : bellCount}
            </span>
          )}
        </Button>
        {bellOpen && (
          <div className="absolute right-0 top-9 w-72 bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-border/40 bg-muted/30 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold">알림</span>
                {bellCount > 0 && <span className="text-[10px] text-muted-foreground ml-2">{bellCount}건</span>}
              </div>
              {bellCount > 0 && (
                <button
                  className="text-[10px] text-muted-foreground hover:text-primary"
                  onClick={() => setDismissedIds(new Set(notifications.map((n) => n.id)))}
                >
                  모두 읽음
                </button>
              )}
            </div>
            <div className="max-h-60 overflow-y-auto">
              {activeNotifications.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground/40">
                  알림이 없습니다
                </div>
              )}
              {activeNotifications.map((n) => (
                <div key={n.id} className="px-3 py-1.5 border-b border-border/20 hover:bg-accent/30 transition-colors group/noti">
                  <div className="flex items-start gap-1.5">
                    {n.type === 'overdue_detail' && <AlertTriangle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />}
                    {n.type === 'delayed_task' && <Clock className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />}
                    <span className={cn('text-[11px] flex-1', n.color)}>{n.text}</span>
                    <button
                      className="text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover/noti:opacity-100 flex-shrink-0"
                      onClick={(e) => { e.stopPropagation(); setDismissedIds((prev) => new Set([...prev, n.id])) }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t border-border/40">
              <button
                className="w-full text-center text-xs font-medium text-primary hover:underline"
                onClick={() => {
                  setActiveView('mytasks')
                  setBellOpen(false)
                }}
              >
                내 업무 보기
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-border/30 flex-shrink-0" />

      {/* Zoom + Link */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleZoom(-1)}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-medium text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 min-w-[24px] text-center select-none">
          {zoomLevel === 1 ? '일' : zoomLevel === 2 ? '주' : '월'}
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleZoom(1)}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>

        <div className="w-px h-4 bg-border/30 mx-0.5" />

        <Button
          variant={linkMode ? 'default' : 'ghost'}
          size="icon"
          className={cn("h-7 w-7", linkMode && "ring-2 ring-orange-400 ring-offset-1")}
          onClick={toggleLinkMode}
          title="의존관계 연결 모드"
        >
          <Link className="h-3.5 w-3.5" />
        </Button>
        {linkMode && (
          <span className="text-[11px] font-medium text-orange-600 bg-orange-50 rounded px-2 py-0.5 ml-1 animate-pulse select-none">
            {linkSourceTaskId ? '후행 클릭' : '선행 클릭'}
          </span>
        )}
      </div>

      {/* User Menu */}
      {currentUser && (
        <>
          <div className="w-px h-5 bg-border/30 flex-shrink-0" />
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 flex-shrink-0 px-2">
                <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                  {currentUser.name?.[0] || 'U'}
                </div>
                <span className="max-w-[80px] truncate hidden lg:inline">{currentUser.name}</span>
                <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{currentUser.name}</p>
                <p className="text-[11px] text-muted-foreground">{currentUser.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')} className="text-xs cursor-pointer">
                <User className="h-3.5 w-3.5 mr-2" />내 프로필
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem onClick={() => navigate('/admin')} className="text-xs cursor-pointer">
                  <Shield className="h-3.5 w-3.5 mr-2" />사용자 관리
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { logout().then(() => navigate('/login')) }} className="text-xs cursor-pointer text-red-500 focus:text-red-500">
                <LogOut className="h-3.5 w-3.5 mr-2" />로그아웃
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </header>
  )
}
