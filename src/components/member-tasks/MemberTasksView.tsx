import { useState, useMemo, useCallback } from 'react'
import { Search, Users, ClipboardList, ExternalLink, UserCheck, List, LayoutGrid, ChevronDown, ChevronRight, Clock, ArrowUpDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useResourceStore } from '@/stores/resource-store'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { TaskEditDialog } from '@/components/gantt/TaskEditDialog'
import { CardDetailModal } from '@/components/mytasks/CardDetailModal'
import type { Task } from '@/lib/types'
import type { TaskAssignment, TaskDetail } from '@/lib/resource-types'

// ============================================================
// Types
// ============================================================

interface MemberTaskInfo {
  task: Task
  assignment: TaskAssignment
  details: TaskDetail[]
}

// ============================================================
// Status badge component
// ============================================================

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  todo: { label: '대기', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' },
  in_progress: { label: '진행', bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-600 dark:text-blue-400' },
  done: { label: '완료', bg: 'bg-green-50 dark:bg-green-950', text: 'text-green-600 dark:text-green-400' },
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.todo
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', config.bg, config.text)}>
      {config.label}
    </span>
  )
}

// ============================================================
// Role badge component
// ============================================================

const ROLE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  owner: { label: 'Owner', bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-600 dark:text-purple-400' },
  pm: { label: 'PM', bg: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-600 dark:text-orange-400' },
  editor: { label: '편집자', bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-600 dark:text-blue-400' },
  viewer: { label: '뷰어', bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400' },
}

function RoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.viewer
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', config.bg, config.text)}>
      {config.label}
    </span>
  )
}

// ============================================================
// Main MemberTasksView
// ============================================================

export function MemberTasksView() {
  const { companies, members, assignments, taskDetails } = useResourceStore()
  const tasks = useTaskStore((s) => s.tasks)
  const project = useProjectStore((s) => s.currentProject)
  const { projectMembers } = useProjectStore()
  const allUsers = useAuthStore((s) => s.users)

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [hideDone, setHideDone] = useState(false)
  const [detailViewMode, setDetailViewMode] = useState<'list' | 'card'>('list')
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set())
  const [cardDetailId, setCardDetailId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'wbs' | 'name' | 'allocation' | 'date' | 'progress'>('wbs')
  const [sortAsc, setSortAsc] = useState(true)
  const [taskSearchQuery, setTaskSearchQuery] = useState('')

  const handleOpenTask = useCallback((taskId: string) => {
    setEditTaskId(taskId)
    setDialogOpen(true)
  }, [])

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setEditTaskId(null)
  }, [])

  // Task count per member (non-group tasks only, task_assignments + detail assignee_ids)
  const memberTaskCounts = useMemo(() => {
    const memberTasks: Record<string, Set<string>> = {}
    // 1. task_assignments 기반
    for (const a of assignments) {
      const task = tasks.find((t) => t.id === a.task_id && !t.is_group)
      if (task) {
        if (!memberTasks[a.member_id]) memberTasks[a.member_id] = new Set()
        memberTasks[a.member_id].add(task.id)
      }
    }
    // 2. task_details.assignee_ids 기반 (세부항목 담당자도 포함)
    for (const detail of taskDetails) {
      const task = tasks.find((t) => t.id === detail.task_id && !t.is_group)
      if (!task) continue
      const assigneeIds = detail.assignee_ids || (detail.assignee_id ? [detail.assignee_id] : [])
      for (const memberId of assigneeIds) {
        if (!memberTasks[memberId]) memberTasks[memberId] = new Set()
        memberTasks[memberId].add(task.id)
      }
    }
    const counts: Record<string, number> = {}
    for (const [memberId, taskSet] of Object.entries(memberTasks)) {
      counts[memberId] = taskSet.size
    }
    return counts
  }, [assignments, tasks, taskDetails])

  // Completion rate per member (task_assignments + detail assignee_ids)
  const memberCompletionRates = useMemo(() => {
    const rates: Record<string, number> = {}
    for (const member of members) {
      // task_assignments + detail assignee_ids 합산
      const taskIdSet = new Set<string>()
      for (const a of assignments) {
        if (a.member_id === member.id) taskIdSet.add(a.task_id)
      }
      for (const d of taskDetails) {
        const ids = d.assignee_ids || (d.assignee_id ? [d.assignee_id] : [])
        if (ids.includes(member.id)) taskIdSet.add(d.task_id)
      }
      const memberTasks = [...taskIdSet]
        .map((tid) => tasks.find((t) => t.id === tid && !t.is_group))
        .filter(Boolean) as Task[]
      if (memberTasks.length === 0) {
        rates[member.id] = 0
        continue
      }
      const totalProgress = memberTasks.reduce((sum, t) => sum + (t.actual_progress || 0), 0)
      rates[member.id] = totalProgress / memberTasks.length
    }
    return rates
  }, [members, assignments, tasks, taskDetails])

  // Project role per member (match by email or name, case-insensitive)
  const memberProjectRoles = useMemo(() => {
    if (!project) return {} as Record<string, string>
    const currentProjectMembers = projectMembers.filter((m) => m.projectId === project.id)
    const roles: Record<string, string> = {}
    for (const member of members) {
      // Find matching user by email (case-insensitive) or name
      const matchedUser = allUsers.find(
        (u) => (member.email && u.email?.toLowerCase() === member.email.toLowerCase()) || u.name === member.name
      )
      if (matchedUser) {
        const pm = currentProjectMembers.find((m) => m.userId === matchedUser.id)
        if (pm) roles[member.id] = pm.role
      }
    }
    return roles
  }, [project, projectMembers, members, allUsers])

  // Filter members by search query
  const filteredCompanies = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    return companies
      .map((company) => {
        const companyMembers = members.filter((m) => m.company_id === company.id)
        if (!query) return { company, members: companyMembers }
        const matchesCompany = company.name.toLowerCase().includes(query) || company.shortName.toLowerCase().includes(query)
        const filtered = matchesCompany
          ? companyMembers
          : companyMembers.filter((m) => m.name.toLowerCase().includes(query))
        return { company, members: filtered }
      })
      .filter((g) => g.members.length > 0)
  }, [companies, members, searchQuery])

  // Total counts
  const totalMembers = members.length
  const totalAssignedTasks = useMemo(() => {
    const taskIds = new Set<string>()
    for (const a of assignments) {
      const task = tasks.find((t) => t.id === a.task_id && !t.is_group)
      if (task) taskIds.add(task.id)
    }
    for (const d of taskDetails) {
      if ((d.assignee_ids?.length || 0) > 0 || d.assignee_id) {
        const task = tasks.find((t) => t.id === d.task_id && !t.is_group)
        if (task) taskIds.add(task.id)
      }
    }
    return taskIds.size
  }, [assignments, tasks, taskDetails])

  // WBS 코드 비교 (자연순: 1.1 < 1.2 < 1.10 < 2.1)
  const compareWbs = useCallback((a: string, b: string) => {
    const pa = (a || '').split('.').map(Number)
    const pb = (b || '').split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0, nb = pb[i] ?? 0
      if (na !== nb) return na - nb
    }
    return 0
  }, [])

  // Selected member tasks (task_assignments + detail assignee_ids)
  const selectedMemberTasks: MemberTaskInfo[] = useMemo(() => {
    if (!selectedMemberId) return []
    const memberAssigns = assignments.filter((a) => a.member_id === selectedMemberId)
    const taskIdSet = new Set(memberAssigns.map((a) => a.task_id))
    for (const detail of taskDetails) {
      const ids = detail.assignee_ids || (detail.assignee_id ? [detail.assignee_id] : [])
      if (ids.includes(selectedMemberId)) {
        taskIdSet.add(detail.task_id)
      }
    }
    const result: MemberTaskInfo[] = []
    for (const taskId of taskIdSet) {
      const task = tasks.find((t) => t.id === taskId && !t.is_group)
      if (!task) continue
      if (hideDone && task.actual_progress >= 1) continue
      const assign = memberAssigns.find((a) => a.task_id === taskId) || { id: '', task_id: taskId, member_id: selectedMemberId, allocation_percent: 100 }
      const dets = taskDetails.filter((d) => d.task_id === task.id).sort((a, b) => a.sort_order - b.sort_order)
      result.push({ task, assignment: assign, details: hideDone ? dets.filter((d) => d.status !== 'done') : dets })
    }
    // 정렬
    result.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'wbs') cmp = compareWbs(a.task.wbs_code, b.task.wbs_code)
      else if (sortBy === 'name') cmp = (a.task.task_name || '').localeCompare(b.task.task_name || '', 'ko')
      else if (sortBy === 'date') cmp = (a.task.planned_start || '9999').localeCompare(b.task.planned_start || '9999')
      else if (sortBy === 'progress') cmp = (a.task.actual_progress || 0) - (b.task.actual_progress || 0)
      else if (sortBy === 'allocation') cmp = (a.assignment.allocation_percent || 0) - (b.assignment.allocation_percent || 0)
      return sortAsc ? cmp : -cmp
    })
    return result
  }, [selectedMemberId, assignments, tasks, taskDetails, hideDone, sortBy, sortAsc, compareWbs])

  // 작업명 검색 필터
  const filteredMemberTasks = useMemo(() => {
    if (!taskSearchQuery.trim()) return selectedMemberTasks
    const q = taskSearchQuery.trim().toLowerCase()
    return selectedMemberTasks.filter(({ task, details }) =>
      task.task_name?.toLowerCase().includes(q) ||
      task.wbs_code?.toLowerCase().includes(q) ||
      details.some((d) => d.title.toLowerCase().includes(q))
    )
  }, [selectedMemberTasks, taskSearchQuery])

  const selectedMember = selectedMemberId ? members.find((m) => m.id === selectedMemberId) : null
  const selectedMemberCompany = selectedMember ? companies.find((c) => c.id === selectedMember.company_id) : null

  return (
    <div className="flex h-full overflow-hidden">
      {/* ===== Left Panel: Member List ===== */}
      <div className="w-[320px] flex-shrink-0 border-r border-border/40 flex flex-col bg-background">
        {/* Summary */}
        <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">담당자별 업무</h2>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground whitespace-nowrap">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {totalMembers}명
            </span>
            <span className="flex items-center gap-1">
              <ClipboardList className="h-3 w-3" />
              {totalAssignedTasks}건
            </span>
            <label className="flex items-center gap-1 cursor-pointer select-none ml-auto">
              <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="w-3 h-3 rounded accent-primary" />
              <span>완료숨김</span>
            </label>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border/30">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              placeholder="담당자/회사명 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {/* Member list grouped by company */}
        <div className="flex-1 overflow-y-auto">
          {filteredCompanies.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground/50">
              {searchQuery ? '검색 결과가 없습니다' : '등록된 담당자가 없습니다'}
            </div>
          )}
          {filteredCompanies.map(({ company, members: companyMembers }) => (
            <div key={company.id}>
              {/* Company header */}
              <div className="px-3 py-1.5 bg-muted/40 text-[11px] font-semibold flex items-center gap-1.5 sticky top-0 z-10">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: company.color }} />
                <span className="truncate">{company.name}</span>
                <span className="text-muted-foreground/60 font-normal">({companyMembers.length})</span>
              </div>

              {/* Members */}
              {companyMembers.map((member) => {
                const isSelected = selectedMemberId === member.id
                const taskCount = memberTaskCounts[member.id] || 0
                const completionRate = memberCompletionRates[member.id] || 0
                const completionPct = Math.round(completionRate * 100)
                const projectRole = memberProjectRoles[member.id]

                return (
                  <div
                    key={member.id}
                    className={cn(
                      'px-3 py-2 cursor-pointer transition-all border-l-2',
                      isSelected
                        ? 'bg-primary/5 border-l-primary'
                        : 'border-l-transparent hover:bg-accent/40'
                    )}
                    onClick={() => setSelectedMemberId(member.id)}
                  >
                    <div className="flex items-center gap-2">
                      {/* Avatar */}
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                        style={{ backgroundColor: company.color }}
                      >
                        {member.name.charAt(0)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate">{member.name}</span>
                          {projectRole && <RoleBadge role={projectRole} />}
                        </div>
                        {member.role && (
                          <span className="text-[10px] text-muted-foreground">{member.role}</span>
                        )}
                      </div>

                      {/* Task count badge */}
                      <span className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0',
                        taskCount > 0
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted/60 text-muted-foreground/50'
                      )}>
                        {taskCount}
                      </span>
                    </div>

                    {/* Mini progress bar */}
                    {taskCount > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-muted/60 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              completionPct >= 100
                                ? 'bg-green-500'
                                : completionPct > 0
                                ? 'bg-primary'
                                : 'bg-muted'
                            )}
                            style={{ width: `${Math.min(completionPct, 100)}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground font-mono w-7 text-right">
                          {completionPct}%
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ===== Right Panel: Task List ===== */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {!selectedMember ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <UserCheck className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/60">좌측에서 담당자를 선택하세요</p>
              <p className="text-[11px] text-muted-foreground/40 mt-1">배정된 작업 목록과 세부항목을 확인할 수 있습니다</p>
            </div>
          </div>
        ) : (
          <>
            {/* Selected member header */}
            <div className="px-5 py-3 border-b border-border/40 bg-muted/10 flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: selectedMemberCompany?.color || '#888' }}
              >
                {selectedMember.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{selectedMember.name}</span>
                  {selectedMember.role && (
                    <span className="text-[11px] text-muted-foreground">{selectedMember.role}</span>
                  )}
                  {memberProjectRoles[selectedMember.id] && (
                    <RoleBadge role={memberProjectRoles[selectedMember.id]} />
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                  <span>{selectedMemberCompany?.name}</span>
                  {selectedMember.email && (
                    <>
                      <span className="text-border">|</span>
                      <span>{selectedMember.email}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold text-primary">{selectedMemberTasks.length}</div>
                <div className="text-[10px] text-muted-foreground">배정 작업</div>
              </div>
            </div>

            {/* 작업 검색 + 완료 숨기기 */}
            <div className="px-4 py-2 border-b border-border/30 bg-muted/10 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <Input
                  placeholder="작업명/WBS 검색..."
                  value={taskSearchQuery}
                  onChange={(e) => setTaskSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer select-none flex-shrink-0">
                <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="w-3 h-3 rounded accent-primary" />
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">완료 숨기기</span>
              </label>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto">
              {filteredMemberTasks.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-muted-foreground/50">
                  {taskSearchQuery ? '검색 결과가 없습니다' : '배정된 작업이 없습니다'}
                </div>
              ) : (
                <div>
                  {/* Table header with sort */}
                  <div className="flex items-center px-5 py-2 bg-muted/20 border-b border-border/30 sticky top-0 z-10">
                    <div className="grid grid-cols-[20px_70px_1fr_100px_60px_60px] gap-1 flex-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <span></span>
                      <span
                        className="cursor-pointer hover:text-foreground flex items-center gap-0.5 select-none"
                        onClick={() => { if (sortBy === 'wbs') setSortAsc(!sortAsc); else { setSortBy('wbs'); setSortAsc(true) } }}
                      >
                        WBS {sortBy === 'wbs' && <ArrowUpDown className="h-2.5 w-2.5" />}
                      </span>
                      <span
                        className="cursor-pointer hover:text-foreground flex items-center gap-0.5 select-none"
                        onClick={() => { if (sortBy === 'name') setSortAsc(!sortAsc); else { setSortBy('name'); setSortAsc(true) } }}
                      >
                        작업명 {sortBy === 'name' && <ArrowUpDown className="h-2.5 w-2.5" />}
                      </span>
                      <span
                        className="text-center cursor-pointer hover:text-foreground flex items-center justify-center gap-0.5 select-none"
                        onClick={() => { if (sortBy === 'date') setSortAsc(!sortAsc); else { setSortBy('date'); setSortAsc(true) } }}
                      >
                        기간 {sortBy === 'date' && <ArrowUpDown className="h-2.5 w-2.5" />}
                      </span>
                      <span
                        className="text-right cursor-pointer hover:text-foreground flex items-center justify-end gap-0.5 select-none"
                        onClick={() => { if (sortBy === 'progress') setSortAsc(!sortAsc); else { setSortBy('progress'); setSortAsc(false) } }}
                      >
                        진척률 {sortBy === 'progress' && <ArrowUpDown className="h-2.5 w-2.5" />}
                      </span>
                      <span
                        className="text-right cursor-pointer hover:text-foreground flex items-center justify-end gap-0.5 select-none"
                        onClick={() => { if (sortBy === 'allocation') setSortAsc(!sortAsc); else { setSortBy('allocation'); setSortAsc(false) } }}
                      >
                        투입률 {sortBy === 'allocation' && <ArrowUpDown className="h-2.5 w-2.5" />}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <button
                        onClick={() => setDetailViewMode('list')}
                        className={cn('p-1 rounded', detailViewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground')}
                        title="리스트 보기"
                      >
                        <List className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDetailViewMode('card')}
                        className={cn('p-1 rounded', detailViewMode === 'card' ? 'bg-primary/10 text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground')}
                        title="카드 보기"
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Task rows */}
                  {filteredMemberTasks.map(({ task, assignment, details }) => {
                    const startStr = task.planned_start ? format(new Date(task.planned_start), 'MM/dd') : '-'
                    const endStr = task.planned_end ? format(new Date(task.planned_end), 'MM/dd') : '-'
                    const progressPct = Math.round((task.actual_progress || 0) * 100)
                    const isCollapsed = collapsedTasks.has(task.id)
                    const toggleCollapse = (e: React.MouseEvent) => {
                      e.stopPropagation()
                      setCollapsedTasks((prev) => {
                        const next = new Set(prev)
                        next.has(task.id) ? next.delete(task.id) : next.add(task.id)
                        return next
                      })
                    }

                    return (
                      <div key={`${task.id}_${assignment.id}`}>
                        {/* Task row */}
                        <div
                          className="grid grid-cols-[20px_70px_1fr_100px_60px_60px] gap-1 px-5 py-2 hover:bg-accent/30 cursor-pointer items-center group border-b border-border/20 transition-colors"
                          onClick={() => handleOpenTask(task.id)}
                          title={`${task.task_name} (클릭하여 상세 편집)`}
                        >
                          {/* 접기 토글 */}
                          <span className="flex-shrink-0">
                            {details.length > 0 && (
                              <button onClick={toggleCollapse} className="p-0.5 hover:bg-accent rounded">
                                {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                              </button>
                            )}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {task.wbs_code}
                          </span>
                          <span className="text-xs truncate flex items-center gap-1">
                            <span className="truncate">{task.task_name}</span>
                            {details.length > 0 && <span className="text-[10px] text-muted-foreground/50">({details.filter(d => d.status === 'done').length}/{details.length})</span>}
                            <ExternalLink className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                          </span>
                          <span className="text-center text-[11px] text-muted-foreground font-mono">
                            {startStr} ~ {endStr}
                          </span>
                          <span className="text-right text-xs font-mono">
                            <span className={cn(
                              progressPct >= 100 ? 'text-green-600' : progressPct > 0 ? 'text-blue-600' : 'text-muted-foreground'
                            )}>
                              {progressPct}%
                            </span>
                          </span>
                          <span className="text-right text-xs font-mono text-muted-foreground">
                            {assignment.allocation_percent}%
                          </span>
                        </div>

                        {/* Task details - 리스트 모드 */}
                        {details.length > 0 && !isCollapsed && detailViewMode === 'list' && (
                          <div className="bg-muted/10 border-b border-border/20">
                            {details.map((detail) => (
                              <div
                                key={detail.id}
                                className="flex items-center gap-2 pl-12 pr-5 py-1.5 text-[11px] hover:bg-accent/20 transition-colors cursor-pointer"
                                onClick={() => setCardDetailId(detail.id)}
                              >
                                <StatusBadge status={detail.status} />
                                <span className={cn('flex-1 truncate', detail.status === 'done' && 'line-through text-muted-foreground/60')}>
                                  {detail.title}
                                </span>
                                {detail.due_date && (
                                  <span className={cn('text-[10px] font-mono flex-shrink-0',
                                    detail.status !== 'done' && detail.due_date < new Date().toISOString().slice(0, 10) ? 'text-red-500' : 'text-muted-foreground'
                                  )}>
                                    ~{format(new Date(detail.due_date), 'MM/dd')}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Task details - 카드 모드 */}
                        {details.length > 0 && !isCollapsed && detailViewMode === 'card' && (
                          <div className="bg-muted/10 border-b border-border/20 px-5 py-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pl-7">
                              {details.map((detail) => {
                                const isOverdue = detail.status !== 'done' && detail.due_date && detail.due_date < new Date().toISOString().slice(0, 10)
                                return (
                                  <div
                                    key={detail.id}
                                    className={cn(
                                      'rounded-lg border border-border/40 border-l-[3px] p-2.5 cursor-pointer hover:shadow-md transition-all bg-card',
                                      detail.status === 'done' ? 'border-l-emerald-400' : detail.status === 'in_progress' ? 'border-l-blue-400' : 'border-l-amber-400',
                                      isOverdue && 'ring-1 ring-red-300'
                                    )}
                                    onClick={() => setCardDetailId(detail.id)}
                                  >
                                    <div className="flex items-start gap-2">
                                      <StatusBadge status={detail.status} />
                                      <span className={cn('text-xs font-medium flex-1 leading-snug', detail.status === 'done' && 'line-through text-muted-foreground/60')}>
                                        {detail.title}
                                      </span>
                                    </div>
                                    {(detail.due_date || detail.description) && (
                                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                                        {detail.due_date && (
                                          <span className={cn('flex items-center gap-0.5', isOverdue && 'text-red-500 font-medium')}>
                                            <Clock className="h-2.5 w-2.5" />{detail.due_date}
                                          </span>
                                        )}
                                        {detail.description && <span className="truncate max-w-[100px] italic">{detail.description.split('\n')[0]}</span>}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Task Edit Dialog */}
      <TaskEditDialog
        taskId={editTaskId}
        open={dialogOpen}
        onClose={handleCloseDialog}
      />

      {/* Card Detail Sliding Panel */}
      <CardDetailModal
        detailId={cardDetailId}
        open={!!cardDetailId}
        onClose={() => setCardDetailId(null)}
      />
    </div>
  )
}
