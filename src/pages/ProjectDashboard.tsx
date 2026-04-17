import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Calendar, Trash2, FolderOpen, User, Shield, LogOut, ChevronDown, Diamond, CheckCircle2, Folder, ArrowDownUp, FolderPlus, Tag, Gauge, FolderKanban, AlertTriangle, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useProjectStore } from '@/stores/project-store'
import { useAuthStore } from '@/stores/auth-store'
import { DatePicker } from '@/components/ui/date-picker'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type SortMode = 'updated' | 'name' | 'progress'

interface ProjectStats {
  plannedProgress: number  // 0~1
  actualProgress: number   // 0~1
  doneCount: number        // 진척률 100% 리프 작업 수
  totalCount: number       // 전체 리프 작업 수 (그룹/아카이브 제외)
  milestoneCount: number
}

function computeStatus(planned: number, actual: number): 'green' | 'yellow' | 'red' {
  const diff = planned - actual  // 양수면 actual이 뒤쳐짐
  if (diff < 0.05) return 'green'
  if (diff < 0.15) return 'yellow'
  return 'red'
}

function daysBetween(end: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endDate = new Date(end)
  endDate.setHours(0, 0, 0, 0)
  return Math.round((endDate.getTime() - today.getTime()) / 86400000)
}

export function ProjectDashboard() {
  const navigate = useNavigate()
  const { projects, addProject, deleteProject, loadProjects, updateProject, switchProject } = useProjectStore()

  useEffect(() => {
    loadProjects()
  }, [])
  const { currentUser, logout } = useAuthStore()
  const isAdmin = currentUser?.role === 'admin'
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [statsMap, setStatsMap] = useState<Record<string, ProjectStats>>({})
  const [sortMode, setSortMode] = useState<SortMode>('updated')
  const [groupByCategory, setGroupByCategory] = useState(true)
  const [masterCategories, setMasterCategories] = useState<{ id: string; name: string }[]>([])

  // project_categories 테이블에서 마스터 목록 로드
  const loadCategories = async () => {
    const { data, error } = await supabase
      .from('project_categories')
      .select('id, name')
      .order('name', { ascending: true })
    if (error) {
      console.error('카테고리 로드 실패:', error.message)
      return
    }
    if (data) setMasterCategories(data as { id: string; name: string }[])
  }

  useEffect(() => {
    loadCategories()
  }, [])

  // 전체 카테고리 목록 = 마스터 테이블 + 프로젝트에 박힌 값 (일관성 보정용 union)
  const allCategories = useMemo(() => {
    const set = new Set<string>()
    for (const c of masterCategories) set.add(c.name)
    for (const p of projects) {
      const name = p.category?.trim()
      if (name) set.add(name)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [projects, masterCategories])

  // 인라인 카테고리 변경 (현재 프로젝트 컨텍스트로 전환 후 update)
  const changeProjectCategory = async (projectId: string, newCategoryValue: string | undefined) => {
    const target = projects.find((p) => p.id === projectId)
    if (!target) return
    switchProject(projectId)
    await updateProject({ category: newCategoryValue })
  }

  const handleCreateCategory = async () => {
    if (!isAdmin) {
      alert('카테고리 생성은 관리자만 가능합니다.')
      return
    }
    const input = prompt('새 카테고리 이름을 입력하세요:')
    if (!input) return
    const name = input.trim()
    if (!name) return
    if (allCategories.includes(name)) {
      alert('이미 존재하는 카테고리입니다.')
      return
    }
    const { error } = await supabase
      .from('project_categories')
      .insert({ name, created_by: currentUser?.id })
    if (error) {
      alert(`카테고리 생성 실패: ${error.message}`)
      return
    }
    await loadCategories()
  }

  const handleDeleteCategory = async (name: string) => {
    if (!isAdmin) return
    const master = masterCategories.find((c) => c.name === name)
    if (!master) return
    const inUse = projects.some((p) => p.category === name)
    if (inUse) {
      const ok = confirm(`"${name}" 카테고리를 사용 중인 프로젝트가 있습니다.\n삭제하면 해당 프로젝트는 '카테고리 없음'으로 변경됩니다. 계속하시겠습니까?`)
      if (!ok) return
    } else {
      const ok = confirm(`"${name}" 카테고리를 삭제하시겠습니까?`)
      if (!ok) return
    }
    // 먼저 해당 카테고리를 쓰는 프로젝트들을 NULL로 업데이트
    if (inUse) {
      const { error: updErr } = await supabase
        .from('projects')
        .update({ category: null })
        .eq('category', name)
      if (updErr) {
        alert(`프로젝트 카테고리 해제 실패: ${updErr.message}`)
        return
      }
      await loadProjects()
    }
    const { error } = await supabase
      .from('project_categories')
      .delete()
      .eq('id', master.id)
    if (error) {
      alert(`카테고리 삭제 실패: ${error.message}`)
      return
    }
    await loadCategories()
  }

  // 프로젝트별 집계 (작업량 가중 평균 + 카운트)
  useEffect(() => {
    if (projects.length === 0) return
    let cancelled = false
    ;(async () => {
      const projectIds = projects.map((p) => p.id)
      const { data, error } = await supabase
        .from('tasks')
        .select('project_id, actual_progress, planned_progress, total_workload, is_group, is_milestone, archived_at')
        .in('project_id', projectIds)
      if (error || !data || cancelled) return

      type Row = {
        project_id: string
        actual_progress: number | null
        planned_progress: number | null
        total_workload: number | null
        is_group: boolean | null
        is_milestone: boolean | null
        archived_at: string | null
      }

      const grouped: Record<string, { leaves: Array<{ actual: number; planned: number; workload: number }>; milestones: number }> = {}
      for (const t of data as Row[]) {
        if (t.archived_at) continue
        const pid = t.project_id
        if (!grouped[pid]) grouped[pid] = { leaves: [], milestones: 0 }
        if (t.is_milestone) grouped[pid].milestones += 1
        if (t.is_group) continue
        grouped[pid].leaves.push({
          actual: Number(t.actual_progress || 0),
          planned: Number(t.planned_progress || 0),
          workload: Number(t.total_workload || 0),
        })
      }

      const map: Record<string, ProjectStats> = {}
      for (const pid of projectIds) {
        const bucket = grouped[pid] || { leaves: [], milestones: 0 }
        const leaves = bucket.leaves
        if (leaves.length === 0) {
          map[pid] = { plannedProgress: 0, actualProgress: 0, doneCount: 0, totalCount: 0, milestoneCount: bucket.milestones }
          continue
        }
        const totalW = leaves.reduce((s, t) => s + t.workload, 0)
        const avg = (picker: (l: typeof leaves[number]) => number) =>
          totalW > 0
            ? leaves.reduce((s, t) => s + picker(t) * t.workload, 0) / totalW
            : leaves.reduce((s, t) => s + picker(t), 0) / leaves.length
        map[pid] = {
          plannedProgress: avg((l) => l.planned),
          actualProgress: avg((l) => l.actual),
          doneCount: leaves.filter((l) => l.actual >= 1).length,
          totalCount: leaves.length,
          milestoneCount: bucket.milestones,
        }
      }
      setStatsMap(map)
    })()
    return () => { cancelled = true }
  }, [projects])

  // 정렬 + 그룹핑
  const sortedProjects = useMemo(() => {
    const arr = [...projects]
    switch (sortMode) {
      case 'name':
        arr.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'progress':
        arr.sort((a, b) => (statsMap[b.id]?.actualProgress ?? 0) - (statsMap[a.id]?.actualProgress ?? 0))
        break
      case 'updated':
      default:
        arr.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    }
    return arr
  }, [projects, sortMode, statsMap])

  const grouped = useMemo(() => {
    if (!groupByCategory) return null
    const groups = new Map<string, typeof sortedProjects>()
    // 마스터 카테고리는 모두 빈 그룹으로 선초기화 (사용 중 여부와 무관하게 보이도록)
    for (const c of masterCategories) {
      groups.set(c.name, [])
    }
    for (const p of sortedProjects) {
      const key = p.category?.trim() || '카테고리 없음'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }
    // 카테고리 없음을 뒤로
    const entries = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === '카테고리 없음') return 1
      if (b === '카테고리 없음') return -1
      return a.localeCompare(b)
    })
    return entries
  }, [sortedProjects, groupByCategory, masterCategories])

  const dashboardSummary = useMemo(() => {
    if (projects.length === 0) {
      return { avgActual: 0, avgPlanned: 0, delayedCount: 0, totalMilestones: 0 }
    }
    const entries = projects.map((p) => statsMap[p.id]).filter(Boolean) as ProjectStats[]
    if (entries.length === 0) {
      return { avgActual: 0, avgPlanned: 0, delayedCount: 0, totalMilestones: 0 }
    }
    const avgActual = entries.reduce((sum, s) => sum + s.actualProgress, 0) / entries.length
    const avgPlanned = entries.reduce((sum, s) => sum + s.plannedProgress, 0) / entries.length
    const delayedCount = entries.filter((s) => computeStatus(s.plannedProgress, s.actualProgress) === 'red').length
    const totalMilestones = entries.reduce((sum, s) => sum + s.milestoneCount, 0)
    return { avgActual, avgPlanned, delayedCount, totalMilestones }
  }, [projects, statsMap])

  const handleCreate = () => {
    if (!newName.trim()) return
    const id = crypto.randomUUID()
    addProject({
      id,
      name: newName,
      description: newDescription || '',
      category: newCategory || undefined,
      start_date: newStart || new Date().toISOString().split('T')[0],
      end_date: newEnd || new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
      owner_id: currentUser?.id || 'local',
      theme_id: 0,
      language: 'ko',
      zoom_level: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    setNewName('')
    setNewStart('')
    setNewEnd('')
    setNewCategory('')
    setNewDescription('')
    setShowCreate(false)
    navigate(`/projects/${id}`)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // 렌더: 개별 카드
  const renderCard = (p: typeof projects[number]) => {
    const stats = statsMap[p.id]
    const planned = stats?.plannedProgress ?? 0
    const actual = stats?.actualProgress ?? 0
    const status = computeStatus(planned, actual)
    const statusLabel = status === 'green' ? '정상' : status === 'yellow' ? '주의' : '지연'
    const statusClasses = {
      green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      yellow: 'bg-amber-50 text-amber-700 border-amber-200',
      red: 'bg-rose-50 text-rose-700 border-rose-200',
    }[status]
    const dotClass = {
      green: 'bg-emerald-500',
      yellow: 'bg-amber-500',
      red: 'bg-rose-500',
    }[status]
    const remaining = daysBetween(p.end_date)
    const dLabel = remaining >= 0 ? `D-${remaining}` : `D+${-remaining} 초과`

    return (
      <div
        key={p.id}
        className="project-card group"
        onClick={() => navigate(`/projects/${p.id}`)}
      >
        <div className="h-1.5 -mx-4 -mt-4 mb-3 rounded-t-xl bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-500" />

        {/* 헤더 */}
        <div className="project-card-head">
          <h3 className="text-base font-bold truncate flex-1 text-slate-800">{p.name}</h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className={cn('project-chip', statusClasses)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', dotClass)} />
              {statusLabel}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mr-1 opacity-0 group-hover:opacity-50 hover:!opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                const input = prompt(`프로젝트를 삭제하려면 프로젝트 이름을 입력하세요:\n\n"${p.name}"`)
                if (input === p.name) deleteProject(p.id)
                else if (input !== null) alert('프로젝트 이름이 일치하지 않습니다.')
              }}
            >
              <Trash2 className="h-3 w-3 text-red-500" />
            </Button>
          </div>
        </div>

        {/* 카테고리 — admin만 편집 가능, 그 외엔 읽기 전용 chip */}
        <div onClick={(e) => e.stopPropagation()} className="project-card-meta">
          {isAdmin ? (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <button className="project-chip text-slate-600 hover:text-primary border-dashed border-slate-300 hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  <Tag className="h-2.5 w-2.5" />
                  {p.category || '카테고리 없음'}
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem
                  onClick={() => changeProjectCategory(p.id, undefined)}
                  className="text-xs cursor-pointer"
                >
                  카테고리 없음
                </DropdownMenuItem>
                {allCategories.length > 0 && <DropdownMenuSeparator />}
                {allCategories.map((cat) => (
                  <DropdownMenuItem
                    key={cat}
                    onClick={() => changeProjectCategory(p.id, cat)}
                    className={cn('text-xs cursor-pointer', p.category === cat && 'bg-accent')}
                  >
                    <Tag className="h-3 w-3 mr-1.5" />
                    {cat}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleCreateCategory} className="text-xs cursor-pointer text-primary">
                  <FolderPlus className="h-3 w-3 mr-1.5" />
                  새 카테고리 만들기
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            p.category ? (
              <span className="project-chip text-slate-600 bg-slate-100 border-slate-200">
                <Tag className="h-2.5 w-2.5" />
                {p.category}
              </span>
            ) : (
              <span className="project-chip text-slate-400 border-slate-200">
                <Tag className="h-2.5 w-2.5" />
                카테고리 없음
              </span>
            )
          )}
          <span className={cn('project-chip', remaining < 0 ? 'text-rose-600 border-rose-200 bg-rose-50' : 'text-slate-600 border-slate-200 bg-slate-100')}>
            <Timer className="h-3 w-3" />
            {dLabel}
          </span>
        </div>

        {/* 날짜 + 잔여일수 */}
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {p.start_date} ~ {p.end_date}
          </span>
        </div>

        {/* 설명 */}
        {p.description && (
          <p className="text-[11px] text-slate-500 line-clamp-2">{p.description}</p>
        )}

        {/* 진행률 비교 */}
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-muted-foreground/70 w-7">계획</span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-sky-400 rounded-full transition-all" style={{ width: `${Math.round(planned * 100)}%` }} />
            </div>
            <span className="text-[10px] font-semibold tabular-nums w-8 text-right text-muted-foreground">{Math.round(planned * 100)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-muted-foreground/70 w-7">실제</span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.round(actual * 100)}%` }} />
            </div>
            <span className="text-[10px] font-semibold tabular-nums w-8 text-right">{Math.round(actual * 100)}%</span>
          </div>
        </div>

        {/* 작업 요약 */}
        <div className="flex items-center gap-3 text-[10px] text-slate-600 pt-1 border-t border-slate-200">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span className="font-semibold text-foreground/80 tabular-nums">{stats?.doneCount ?? 0}</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="tabular-nums">{stats?.totalCount ?? 0}</span>
            <span>완료</span>
          </span>
          {(stats?.milestoneCount ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <Diamond className="h-3 w-3 text-purple-500" />
              <span className="tabular-nums">{stats?.milestoneCount}</span>
              <span>마일스톤</span>
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="std-page">
      {/* 헤더 */}
      <header className="std-page-header">
        <div className="std-page-header-inner">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="GMT" className="w-7 h-7 object-contain" />
            <span className="text-base font-bold tracking-tight">GMTgantts</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold">
                  {currentUser?.name?.[0] || 'U'}
                </div>
                <span className="max-w-[100px] truncate">{currentUser?.name || '사용자'}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{currentUser?.name}</p>
                <p className="text-xs text-muted-foreground">{currentUser?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')} className="text-xs cursor-pointer">
                <User className="h-3.5 w-3.5 mr-2" />내 프로필
              </DropdownMenuItem>
              {currentUser?.role === 'admin' && (
                <DropdownMenuItem onClick={() => navigate('/admin')} className="text-xs cursor-pointer">
                  <Shield className="h-3.5 w-3.5 mr-2" />사용자 관리
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-xs cursor-pointer text-red-500 focus:text-red-500">
                <LogOut className="h-3.5 w-3.5 mr-2" />로그아웃
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* 본문 */}
      <main className="std-page-main">
        <section className="project-hero">
          <div className="project-hero-head">
            <div>
              <h1 className="project-hero-title">프로젝트 상황판</h1>
              <p className="project-hero-sub">전체 프로젝트의 계획 대비 실적, 리스크, 일정 압박을 한 번에 확인합니다.</p>
            </div>
          </div>
          <div className="project-hero-grid">
            <div className="project-hero-item">
              <FolderKanban className="h-3.5 w-3.5 text-blue-600 mb-1" />
              <strong>{projects.length}</strong>
              <span>전체 프로젝트</span>
            </div>
            <div className="project-hero-item">
              <Gauge className="h-3.5 w-3.5 text-blue-600 mb-1" />
              <strong>{Math.round(dashboardSummary.avgPlanned * 100)}%</strong>
              <span>평균 계획 진척</span>
            </div>
            <div className="project-hero-item">
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 mb-1" />
              <strong>{Math.round(dashboardSummary.avgActual * 100)}%</strong>
              <span>평균 실제 진척</span>
            </div>
            <div className="project-hero-item">
              <AlertTriangle className="h-3.5 w-3.5 text-blue-600 mb-1" />
              <strong>{dashboardSummary.delayedCount}</strong>
              <span>지연 프로젝트</span>
            </div>
          </div>
        </section>

        <div className="project-toolbar">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-800">프로젝트 목록</h2>
            <p className="text-xs text-slate-500 mt-0.5">마일스톤 총 {dashboardSummary.totalMilestones}개</p>
          </div>
          <div className="project-toolbar-actions">
            {/* 정렬 */}
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <ArrowDownUp className="h-3 w-3" />
                  {sortMode === 'updated' ? '최근 수정순' : sortMode === 'name' ? '이름순' : '진행률순'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={() => setSortMode('updated')} className="text-xs cursor-pointer">최근 수정순</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortMode('name')} className="text-xs cursor-pointer">이름순</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortMode('progress')} className="text-xs cursor-pointer">진행률순</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* 그룹 토글 */}
            <Button
              variant={groupByCategory ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setGroupByCategory((v) => !v)}
              title="카테고리로 그룹화"
            >
              <Folder className="h-3 w-3" />
              그룹
            </Button>
            {/* 카테고리 만들기 (admin 전용) */}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={handleCreateCategory}
                title="새 카테고리 만들기 (관리자 전용)"
              >
                <FolderPlus className="h-3 w-3" />
                카테고리
              </Button>
            )}
            <Button size="sm" onClick={() => setShowCreate(true)} className="h-8 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />새 프로젝트
            </Button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-slate-300 rounded-xl bg-white/40">
            <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-sm font-medium text-muted-foreground/50">프로젝트가 없습니다</p>
            <Button size="sm" className="mt-4 h-8 text-xs" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />프로젝트 만들기
            </Button>
          </div>
        ) : groupByCategory && grouped ? (
          <div className="space-y-6">
            {grouped.map(([category, list]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <Folder className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">{category}</h2>
                  <span className="text-[10px] text-muted-foreground/50">({list.length})</span>
                  <div className="flex-1 h-px bg-border/50 ml-1" />
                  {isAdmin && category !== '카테고리 없음' && (
                    <button
                      onClick={() => handleDeleteCategory(category)}
                      className="text-[10px] text-muted-foreground/50 hover:text-rose-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
                      title="카테고리 삭제 (관리자 전용)"
                    >
                      × 제거
                    </button>
                  )}
                </div>
                {list.length === 0 ? (
                  <div className="border border-dashed border-border/40 rounded-lg py-6 text-center">
                    <FolderOpen className="h-6 w-6 mx-auto text-muted-foreground/20 mb-1.5" />
                    <p className="text-[11px] text-muted-foreground/50">
                      프로젝트의 카테고리 칩을 눌러 이 그룹에 추가하세요
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {list.map(renderCard)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedProjects.map(renderCard)}
          </div>
        )}
      </main>

      {/* 프로젝트 생성 다이얼로그 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">새 프로젝트</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div>
              <label className="block text-xs font-medium mb-1">프로젝트 이름</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="프로젝트 이름" className="h-8 text-sm" autoFocus />
            </div>
            {isAdmin && (
              <div>
                <label className="block text-xs font-medium mb-1">카테고리 (선택)</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                className="w-full h-8 text-sm border border-border rounded-md px-2 bg-background outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <option value="">카테고리 없음</option>
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium mb-1">설명 (선택)</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="프로젝트 간략 설명"
                rows={2}
                className="w-full text-sm border border-border rounded-md px-2 py-1.5 resize-y outline-none focus:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">시작일</label>
                <DatePicker value={newStart} onChange={setNewStart} placeholder="시작일 선택" className="h-8 text-xs" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">종료일</label>
                <DatePicker value={newEnd} onChange={setNewEnd} placeholder="종료일 선택" className="h-8 text-xs" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>취소</Button>
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>생성</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
