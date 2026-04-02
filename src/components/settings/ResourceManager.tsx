import { useState, useMemo, useCallback } from 'react'
import { Plus, Trash2, Building2, Users, ClipboardList, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useResourceStore } from '@/stores/resource-store'
import { useTaskStore } from '@/stores/task-store'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { TaskEditDialog } from '@/components/gantt/TaskEditDialog'
import type { Task } from '@/lib/types'
import type { TaskAssignment } from '@/lib/resource-types'

const COLORS = ['#3b82f6', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#0891b2', '#e11d48', '#4f46e5']

// ============================================================
// Member task list sub-component
// ============================================================

interface MemberTaskInfo {
  task: Task
  assignment: TaskAssignment
}

function MemberTaskList({
  memberId,
  memberName,
  onOpenTask,
}: {
  memberId: string
  memberName: string
  onOpenTask: (taskId: string) => void
}) {
  const tasks = useTaskStore((s) => s.tasks)
  const assignments = useResourceStore((s) => s.assignments)

  const memberTasks: MemberTaskInfo[] = useMemo(() => {
    const memberAssigns = assignments.filter((a) => a.member_id === memberId)
    const result: MemberTaskInfo[] = []
    for (const assign of memberAssigns) {
      const task = tasks.find((t) => t.id === assign.task_id)
      if (task && !task.is_group) {
        result.push({ task, assignment: assign })
      }
    }
    // Sort by planned_start
    result.sort((a, b) => {
      const aDate = a.task.planned_start || '9999'
      const bDate = b.task.planned_start || '9999'
      return aDate.localeCompare(bDate)
    })
    return result
  }, [memberId, tasks, assignments])

  if (memberTasks.length === 0) {
    return (
      <div className="px-4 py-2 text-xs text-muted-foreground italic">
        배정된 작업이 없습니다.
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/20">
      {/* Header */}
      <div className="grid grid-cols-[1fr_100px_60px_60px] gap-1 px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20">
        <span>작업명</span>
        <span className="text-center">기간</span>
        <span className="text-right">진척률</span>
        <span className="text-right">투입률</span>
      </div>
      {memberTasks.map(({ task, assignment }) => {
        const startStr = task.planned_start ? format(new Date(task.planned_start), 'MM/dd') : '-'
        const endStr = task.planned_end ? format(new Date(task.planned_end), 'MM/dd') : '-'
        const progressPct = Math.round(task.actual_progress * 100)

        return (
          <div
            key={`${task.id}_${assignment.id}`}
            className="grid grid-cols-[1fr_100px_60px_60px] gap-1 px-4 py-1.5 hover:bg-accent/30 cursor-pointer items-center group text-xs"
            onClick={() => onOpenTask(task.id)}
            title={`${task.task_name} (클릭하여 상세 편집)`}
          >
            <span className="truncate flex items-center gap-1">
              <span className="truncate">{task.task_name}</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
            </span>
            <span className="text-center text-muted-foreground font-mono text-[10px]">
              {startStr} ~ {endStr}
            </span>
            <span className="text-right font-mono">
              <span className={cn(
                progressPct >= 100 ? 'text-green-600 dark:text-green-400' :
                progressPct > 0 ? 'text-blue-600 dark:text-blue-400' :
                'text-muted-foreground'
              )}>
                {progressPct}%
              </span>
            </span>
            <span className="text-right font-mono text-muted-foreground">
              {assignment.allocation_percent}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// Main ResourceManager component
// ============================================================

export function ResourceManager() {
  const {
    companies, members, assignments,
    addCompany, updateCompany, deleteCompany,
    addMember, updateMember, deleteMember,
  } = useResourceStore()

  const tasks = useTaskStore((s) => s.tasks)

  // Company form
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyShort, setNewCompanyShort] = useState('')
  const [newCompanyColor, setNewCompanyColor] = useState(COLORS[0])

  // Member form
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('')
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [newMemberCompany, setNewMemberCompany] = useState('')

  // Expanded member (to show task list)
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)

  // Task detail dialog
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleOpenTask = useCallback((taskId: string) => {
    setEditTaskId(taskId)
    setDialogOpen(true)
  }, [])

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setEditTaskId(null)
  }, [])

  const toggleMemberExpand = useCallback((memberId: string) => {
    setExpandedMemberId((prev) => prev === memberId ? null : memberId)
  }, [])

  // Task count per member
  const memberTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of assignments) {
      const task = tasks.find((t) => t.id === a.task_id && !t.is_group)
      if (task) {
        counts[a.member_id] = (counts[a.member_id] || 0) + 1
      }
    }
    return counts
  }, [assignments, tasks])

  const handleAddCompany = () => {
    if (!newCompanyName.trim()) return
    addCompany({
      id: crypto.randomUUID(),
      name: newCompanyName,
      shortName: newCompanyShort || newCompanyName.substring(0, 3),
      color: newCompanyColor,
      created_at: new Date().toISOString(),
    })
    setNewCompanyName('')
    setNewCompanyShort('')
  }

  const handleAddMember = () => {
    if (!newMemberName.trim() || !newMemberCompany) return
    addMember({
      id: crypto.randomUUID(),
      company_id: newMemberCompany,
      name: newMemberName,
      role: newMemberRole || undefined,
      email: newMemberEmail || undefined,
      created_at: new Date().toISOString(),
    })
    setNewMemberName('')
    setNewMemberRole('')
    setNewMemberEmail('')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <div>
        <h2 className="text-lg font-bold text-foreground">담당자 관리</h2>
        <p className="text-sm text-muted-foreground mt-0.5">회사 및 인원을 등록하고 관리합니다</p>
      </div>

      {/* ========== 회사 관리 ========== */}
      <div className="bg-card rounded-xl border border-border/50 shadow-sm">
        <div className="px-5 py-3 border-b border-border/40 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">회사 관리</h3>
          <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md font-medium">{companies.length}개</span>
        </div>

        {/* 회사 추가 */}
        <div className="p-4 border-b bg-muted/30">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">회사명</label>
              <Input
                placeholder="예: (주) 지엠티"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
              />
            </div>
            <div className="w-28">
              <label className="text-xs text-muted-foreground">약칭</label>
              <Input
                placeholder="GMT"
                value={newCompanyShort}
                onChange={(e) => setNewCompanyShort(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">색상</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={newCompanyColor}
                  onChange={(e) => setNewCompanyColor(e.target.value)}
                  className="w-8 h-8 rounded border border-border cursor-pointer p-0"
                />
                <span className="text-xs text-muted-foreground font-mono">{newCompanyColor}</span>
              </div>
            </div>
            <Button onClick={handleAddCompany} size="sm" className="mb-0.5">
              <Plus className="h-4 w-4 mr-1" />
              추가
            </Button>
          </div>
        </div>

        {/* 회사 목록 */}
        <div className="divide-y">
          {companies.map((company) => (
            <div key={company.id} className="flex items-center px-4 py-2.5 hover:bg-accent/30 gap-2">
              {/* 색상 변경 - 클릭하면 다음 색상으로 */}
              <input
                type="color"
                value={company.color}
                onChange={(e) => updateCompany(company.id, { color: e.target.value })}
                className="w-6 h-6 rounded-full border-0 cursor-pointer p-0"
                title="색상 변경"
              />
              <div className="flex-1 min-w-0">
                <input
                  className="font-medium text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-full"
                  defaultValue={company.name}
                  onBlur={(e) => updateCompany(company.id, { name: e.target.value })}
                />
                <input
                  className="text-xs text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-16 ml-1"
                  defaultValue={company.shortName}
                  onBlur={(e) => updateCompany(company.id, { shortName: e.target.value })}
                />
              </div>
              <span className="text-xs text-muted-foreground mr-2">
                {members.filter((m) => m.company_id === company.id).length}명
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  if (confirm(`"${company.name}" 회사를 삭제하시겠습니까?\n소속 인원도 함께 삭제됩니다.`)) {
                    deleteCompany(company.id)
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* ========== 인원 관리 + 담당자별 작업 ========== */}
      <div className="bg-card rounded-xl border border-border/50 shadow-sm">
        <div className="px-5 py-3 border-b border-border/40 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">인원 관리</h3>
          <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md font-medium">{members.length}명</span>
          <span className="ml-auto text-[10px] text-muted-foreground">담당자를 클릭하면 배정 작업 목록을 확인할 수 있습니다</span>
        </div>

        {/* 인원 추가 */}
        <div className="p-4 border-b bg-muted/30">
          <div className="flex gap-2 items-end">
            <div className="w-36">
              <label className="text-xs text-muted-foreground">소속 회사</label>
              <Select value={newMemberCompany} onValueChange={(v) => v && setNewMemberCompany(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="회사 선택">
                    {newMemberCompany ? companies.find(c => c.id === newMemberCompany)?.shortName || '선택' : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.shortName}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">이름</label>
              <Input
                placeholder="홍길동"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
              />
            </div>
            <div className="w-28">
              <label className="text-xs text-muted-foreground">직책/역할</label>
              <Input
                placeholder="PM"
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">이메일</label>
              <Input
                placeholder="email@company.com"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
              />
            </div>
            <Button onClick={handleAddMember} size="sm" className="mb-0.5" disabled={!newMemberCompany}>
              <Plus className="h-4 w-4 mr-1" />
              추가
            </Button>
          </div>
        </div>

        {/* 인원 목록 (회사별 그룹) */}
        {companies.map((company) => {
          const companyMembers = members.filter((m) => m.company_id === company.id)
          if (companyMembers.length === 0) return null

          return (
            <div key={company.id}>
              <div className="px-4 py-1.5 bg-muted/50 text-xs font-semibold flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: company.color }} />
                {company.name} ({companyMembers.length}명)
              </div>
              <div className="divide-y">
                {companyMembers.map((member) => {
                  const isExpanded = expandedMemberId === member.id
                  const taskCount = memberTaskCounts[member.id] || 0

                  return (
                    <div key={member.id}>
                      <div
                        className={cn(
                          "flex items-center px-4 py-2 hover:bg-accent/30 text-sm gap-2 cursor-pointer transition-colors",
                          isExpanded && "bg-accent/20"
                        )}
                        onClick={() => toggleMemberExpand(member.id)}
                      >
                        {/* Expand/collapse chevron */}
                        <span className="text-muted-foreground w-4 flex-shrink-0">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: company.color }}>
                          {member.name.charAt(0)}
                        </div>
                        <input
                          className="font-medium bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-20"
                          defaultValue={member.name}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => updateMember(member.id, { name: e.target.value })}
                        />
                        <input
                          className="text-xs text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-16"
                          defaultValue={member.role || ''}
                          placeholder="직책"
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => updateMember(member.id, { role: e.target.value || undefined })}
                        />
                        <input
                          className="text-xs text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none flex-1"
                          defaultValue={member.email || ''}
                          placeholder="이메일"
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => updateMember(member.id, { email: e.target.value || undefined })}
                        />
                        {/* Task count badge */}
                        {taskCount > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md">
                            <ClipboardList className="h-3 w-3" />
                            {taskCount}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`"${member.name}" 인원을 삭제하시겠습니까?`)) {
                              deleteMember(member.id)
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>

                      {/* Expanded: task list */}
                      {isExpanded && (
                        <div className="bg-muted/10 border-t border-border/20">
                          <MemberTaskList
                            memberId={member.id}
                            memberName={member.name}
                            onOpenTask={handleOpenTask}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Task Edit Dialog */}
      <TaskEditDialog
        taskId={editTaskId}
        open={dialogOpen}
        onClose={handleCloseDialog}
      />
    </div>
  )
}
