import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, X, Trash2, CheckSquare, Square, Paperclip, ChevronDown, ChevronUp, StickyNote, Calendar, User, GripVertical, Maximize2, Minimize2, Link2, Users, FileText, ArrowRight, ArrowLeft } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useTaskStore } from '@/stores/task-store'
import { useResourceStore } from '@/stores/resource-store'
import type { DependencyType } from '@/lib/types'
import { DEP_TYPE_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { MemberPicker } from '@/components/common/MemberPicker'
import { DatePicker } from '@/components/ui/date-picker'

interface TaskEditDialogProps {
  taskId: string | null
  open: boolean
  onClose: () => void
}

/* ─── 섹션 래퍼 ─── */
function Section({ icon: Icon, title, count, children, className }: {
  icon?: React.ElementType
  title: string
  count?: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("rounded-lg border border-border/60 bg-card", className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/30 rounded-t-lg">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-xs font-semibold tracking-wide text-foreground/70 uppercase">{title}</span>
        {count !== undefined && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-auto">{count}</Badge>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

/* ─── 라벨+입력 한 쌍 ─── */
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-medium text-muted-foreground/80 mb-0.5 tracking-tight">{label}</label>
      {children}
    </div>
  )
}

export function TaskEditDialog({ taskId, open, onClose }: TaskEditDialogProps) {
  const { tasks, dependencies, updateTask, addDependency, removeDependency } = useTaskStore()
  const { companies, members, assignments, addAssignment, updateAssignment, removeAssignment, taskDetails, addTaskDetail, updateTaskDetail, deleteTaskDetail } = useResourceStore()
  const task = taskId ? tasks.find((t) => t.id === taskId) : null

  // Form state
  const [taskName, setTaskName] = useState('')
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedEnd, setPlannedEnd] = useState('')
  const [actualStart, setActualStart] = useState('')
  const [actualEnd, setActualEnd] = useState('')
  const [totalWorkload, setTotalWorkload] = useState('')
  const [actualProgress, setActualProgress] = useState('')
  const [remarks, setRemarks] = useState('')
  const [calendarType, setCalendarType] = useState('STD')
  const [isMilestone, setIsMilestone] = useState(false)

  const [newPredId, setNewPredId] = useState('')
  const [newPredType, setNewPredType] = useState<DependencyType>(1)
  const [newSuccId, setNewSuccId] = useState('')
  const [newSuccType, setNewSuccType] = useState<DependencyType>(1)
  const [newAssignMemberIds, setNewAssignMemberIds] = useState<string[]>([])
  const [newAssignPercent, setNewAssignPercent] = useState('100')
  const [newDetailTitle, setNewDetailTitle] = useState('')
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (task) {
      setTaskName(task.task_name || '')
      setPlannedStart(task.planned_start || '')
      setPlannedEnd(task.planned_end || '')
      setActualStart(task.actual_start || '')
      setActualEnd(task.actual_end || '')
      setTotalWorkload(task.total_workload?.toString() || '')
      setActualProgress((task.actual_progress * 100).toString())
      setRemarks(task.remarks || '')
      setCalendarType(task.calendar_type || 'STD')
      setIsMilestone(task.is_milestone || false)
    }
  }, [task])

  const taskAssignments = useMemo(() => {
    if (!taskId) return []
    return assignments.filter((a) => a.task_id === taskId).map((a) => {
      const member = members.find((m) => m.id === a.member_id)
      const company = member ? companies.find((c) => c.id === member.company_id) : null
      return { ...a, member, company }
    })
  }, [taskId, assignments, members, companies])

  const predecessors = useMemo(() => {
    if (!taskId) return []
    return dependencies.filter((d) => d.successor_id === taskId).map((d) => ({
      ...d, task: tasks.find((t) => t.id === d.predecessor_id)
    }))
  }, [taskId, dependencies, tasks])

  const successors = useMemo(() => {
    if (!taskId) return []
    return dependencies.filter((d) => d.predecessor_id === taskId).map((d) => ({
      ...d, task: tasks.find((t) => t.id === d.successor_id)
    }))
  }, [taskId, dependencies, tasks])

  const availableForPred = useMemo(() => {
    if (!taskId) return []
    const existingIds = new Set(predecessors.map((p) => p.predecessor_id))
    return tasks.filter((t) => t.id !== taskId && !existingIds.has(t.id))
  }, [taskId, tasks, predecessors])

  const availableForSucc = useMemo(() => {
    if (!taskId) return []
    const existingIds = new Set(successors.map((s) => s.successor_id))
    return tasks.filter((t) => t.id !== taskId && !existingIds.has(t.id))
  }, [taskId, tasks, successors])

  const currentDetails = useMemo(() => {
    if (!taskId) return []
    return taskDetails.filter((d) => d.task_id === taskId).sort((a, b) => a.sort_order - b.sort_order)
  }, [taskId, taskDetails])

  const detailProgress = useMemo(() => {
    if (currentDetails.length === 0) return null
    const done = currentDetails.filter((d) => d.status === 'done').length
    return Math.round((done / currentDetails.length) * 100)
  }, [currentDetails])

  const handleDetailStatusChange = (detailId: string, currentStatus: string) => {
    const next = currentStatus === 'todo' ? 'in_progress' : currentStatus === 'in_progress' ? 'done' : 'todo'
    handleDetailStatusSet(detailId, next as 'todo' | 'in_progress' | 'done')
  }

  const handleDetailStatusSet = (detailId: string, newStatus: 'todo' | 'in_progress' | 'done') => {
    updateTaskDetail(detailId, { status: newStatus })
    const updated = currentDetails.map((d) => d.id === detailId ? { ...d, status: newStatus } : d)
    const doneCount = updated.filter((d) => d.status === 'done').length
    const newProgress = Math.round((doneCount / updated.length) * 100)
    setActualProgress(String(newProgress))
  }

  const handleSave = () => {
    if (!taskId) return
    updateTask(taskId, {
      task_name: taskName,
      planned_start: plannedStart || undefined,
      planned_end: isMilestone && plannedStart ? plannedStart : (plannedEnd || undefined),
      actual_start: actualStart || undefined,
      actual_end: actualEnd || undefined,
      total_workload: totalWorkload ? parseFloat(totalWorkload) : undefined,
      actual_progress: actualProgress ? parseFloat(actualProgress) / 100 : 0,
      remarks: remarks || undefined,
      calendar_type: calendarType as 'STD' | 'UD1' | 'UD2',
      is_milestone: isMilestone,
    })
    onClose()
  }

  const handleAddPred = () => {
    if (!taskId || !newPredId) return
    addDependency({ id: crypto.randomUUID(), project_id: task?.project_id || '', predecessor_id: newPredId, successor_id: taskId, dep_type: newPredType, lag_days: 0, created_at: new Date().toISOString() })
    setNewPredId('')
  }

  const handleAddSucc = () => {
    if (!taskId || !newSuccId) return
    addDependency({ id: crypto.randomUUID(), project_id: task?.project_id || '', predecessor_id: taskId, successor_id: newSuccId, dep_type: newSuccType, lag_days: 0, created_at: new Date().toISOString() })
    setNewSuccId('')
  }

  const handleAddAssignment = () => {
    if (!taskId || newAssignMemberIds.length === 0) return
    const existingMemberIds = new Set(taskAssignments.map(a => a.member_id))
    newAssignMemberIds.forEach((memberId) => {
      if (!existingMemberIds.has(memberId)) {
        addAssignment({ id: crypto.randomUUID(), task_id: taskId, member_id: memberId, allocation_percent: parseInt(newAssignPercent) || 100 })
      }
    })
    setNewAssignMemberIds([])
  }

  const handleAddDetail = () => {
    if (!taskId || !newDetailTitle.trim()) return
    const newId = crypto.randomUUID()
    addTaskDetail({ id: newId, task_id: taskId, sort_order: currentDetails.length * 1000 + 1000, title: newDetailTitle, status: 'todo', created_at: new Date().toISOString() })
    setNewDetailTitle('')
    setExpandedDetails(prev => new Set(prev).add(newId))
  }

  if (!task) return null

  const isGroup = task.is_group
  const fieldCls = cn("h-7 text-xs", isGroup && "bg-muted/60 text-muted-foreground")

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[1000px] w-[92vw] max-h-[90vh] overflow-y-auto p-0">
        {/* ─── 헤더 ─── */}
        <div className="sticky top-0 z-10 bg-background border-b px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-sm font-mono px-2 py-0.5 bg-primary/5 border-primary/20">{task.wbs_code}</Badge>
            <span className="text-base font-semibold">{task.task_name || '작업 상세'}</span>
            {isGroup && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">그룹</Badge>}
            {isMilestone && <Badge className="text-[10px] bg-purple-100 text-purple-700 border-purple-200">마일스톤</Badge>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
            <Button size="sm" onClick={handleSave}>저장</Button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* ─── 상단 2컬럼: 기본정보 + 선행후행 ─── */}
          <div className="grid grid-cols-2 gap-4">
            {/* 왼쪽: 기본 정보 + 담당자 */}
            <div className="space-y-4">
              <Section icon={FileText} title="기본 정보">
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Field label="작업명">
                      <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} className="h-7 text-xs" />
                    </Field>
                    <Field label="유형">
                      <label className="flex items-center gap-1.5 h-7 px-2 rounded border bg-background cursor-pointer hover:bg-accent/30 text-xs">
                        <input type="checkbox" checked={isMilestone} onChange={(e) => setIsMilestone(e.target.checked)} className="w-3 h-3 rounded accent-primary" disabled={isGroup} />
                        마일스톤
                      </label>
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label={isMilestone ? '마일스톤 날짜' : '계획 시작일'}>
                      <DatePicker value={plannedStart} onChange={setPlannedStart} placeholder="선택" disabled={isGroup} className={fieldCls} />
                    </Field>
                    {!isMilestone && (
                      <Field label="계획 완료일">
                        <DatePicker value={plannedEnd} onChange={setPlannedEnd} placeholder="선택" disabled={isGroup} className={fieldCls} />
                      </Field>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="실제 시작일">
                      <DatePicker value={actualStart} onChange={setActualStart} placeholder="선택" disabled={isGroup} className={fieldCls} />
                    </Field>
                    <Field label="실제 완료일">
                      <DatePicker value={actualEnd} onChange={setActualEnd} placeholder="선택" disabled={isGroup} className={fieldCls} />
                    </Field>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Field label="작업량 (M/D)">
                      <Input type="number" step="0.1" value={totalWorkload} onChange={(e) => setTotalWorkload(e.target.value)} className={fieldCls} disabled={isGroup} />
                    </Field>
                    <Field label="진척률 (%)">
                      <Input type="number" min="0" max="100" value={actualProgress} onChange={(e) => setActualProgress(e.target.value)} className={fieldCls} disabled={isGroup} />
                    </Field>
                    <Field label="비고">
                      <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="h-7 text-xs" placeholder="메모" />
                    </Field>
                  </div>
                </div>
              </Section>

              <Section icon={Users} title="담당자" count={taskAssignments.length}>
                <div className="space-y-1">
                  {taskAssignments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-accent/30 transition-colors group/assign">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 shadow-sm" style={{ backgroundColor: a.company?.color || '#888' }}>
                        {a.member?.name.charAt(0)}
                      </div>
                      <span className="text-xs font-medium flex-1 truncate">{a.member?.name || '?'}</span>
                      <span className="text-[10px] text-muted-foreground/60">{a.company?.shortName}</span>
                      <Input
                        type="number" min={1} max={100} value={a.allocation_percent}
                        onChange={(e) => updateAssignment(a.id, { allocation_percent: parseInt(e.target.value) || 100 })}
                        className="w-14 h-5 text-[11px] text-right px-1.5 border-transparent hover:border-border focus:border-border"
                      />
                      <span className="text-[10px] text-muted-foreground/50">%</span>
                      <Button variant="ghost" size="icon" className="h-4 w-4 opacity-0 group-hover/assign:opacity-60" onClick={() => removeAssignment(a.id)}>
                        <X className="h-2.5 w-2.5 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-1.5 pt-1">
                    <div className="flex-1">
                      <MemberPicker value={newAssignMemberIds} onChange={setNewAssignMemberIds} placeholder="담당자 선택..." size="sm" />
                    </div>
                    <Input type="number" min="1" max="100" value={newAssignPercent} onChange={(e) => setNewAssignPercent(e.target.value)} className="w-16 h-7 text-xs px-1.5" placeholder="%" />
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleAddAssignment} disabled={newAssignMemberIds.length === 0}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Section>
            </div>

            {/* 오른쪽: 선행/후행 + 첨부 */}
            <div className="space-y-4">
              <Section icon={Link2} title="의존관계" count={predecessors.length + successors.length}>
                <div className="space-y-3">
                  {/* 선행 */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <ArrowLeft className="h-3 w-3 text-blue-500" />
                      <span className="text-[11px] font-semibold text-muted-foreground">선행 작업</span>
                    </div>
                    <div className="space-y-1">
                      {predecessors.map((p) => (
                        <div key={p.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50/40 border border-blue-100/60 group/dep">
                          <code className="text-[10px] text-blue-600/70 font-mono">{p.task?.wbs_code}</code>
                          <span className="flex-1 truncate text-xs">{p.task?.task_name || '?'}</span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1 border-blue-200 text-blue-600">{DEP_TYPE_LABELS[p.dep_type]}</Badge>
                          <Button variant="ghost" size="icon" className="h-4 w-4 opacity-0 group-hover/dep:opacity-60" onClick={() => removeDependency(p.id)}>
                            <X className="h-2.5 w-2.5 text-red-500" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1.5 mt-1.5">
                      <Select value={newPredId} onValueChange={(v) => v && setNewPredId(v)}>
                        <SelectTrigger className="flex-1 h-7 text-xs">
                          <SelectValue placeholder="선행 작업 선택...">
                            {newPredId ? (() => { const t = tasks.find(t => t.id === newPredId); return t ? `[${t.wbs_code}] ${t.task_name}` : '선택...' })() : undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availableForPred.map((t) => (
                            <SelectItem key={t.id} value={t.id}>[{t.wbs_code}] {t.task_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={String(newPredType)} onValueChange={(v) => v && setNewPredType(Number(v) as DependencyType)}>
                        <SelectTrigger className="w-16 h-7 text-xs"><SelectValue>{DEP_TYPE_LABELS[newPredType]}</SelectValue></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">FS</SelectItem>
                          <SelectItem value="2">SS</SelectItem>
                          <SelectItem value="3">FF</SelectItem>
                          <SelectItem value="4">SF</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleAddPred} disabled={!newPredId}><Plus className="h-3 w-3" /></Button>
                    </div>
                  </div>

                  {/* 후행 */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <ArrowRight className="h-3 w-3 text-emerald-500" />
                      <span className="text-[11px] font-semibold text-muted-foreground">후행 작업</span>
                    </div>
                    <div className="space-y-1">
                      {successors.map((s) => (
                        <div key={s.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50/40 border border-emerald-100/60 group/dep">
                          <code className="text-[10px] text-emerald-600/70 font-mono">{s.task?.wbs_code}</code>
                          <span className="flex-1 truncate text-xs">{s.task?.task_name || '?'}</span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1 border-emerald-200 text-emerald-600">{DEP_TYPE_LABELS[s.dep_type]}</Badge>
                          <Button variant="ghost" size="icon" className="h-4 w-4 opacity-0 group-hover/dep:opacity-60" onClick={() => removeDependency(s.id)}>
                            <X className="h-2.5 w-2.5 text-red-500" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1.5 mt-1.5">
                      <Select value={newSuccId} onValueChange={(v) => v && setNewSuccId(v)}>
                        <SelectTrigger className="flex-1 h-7 text-xs">
                          <SelectValue placeholder="후행 작업 선택...">
                            {newSuccId ? (() => { const t = tasks.find(t => t.id === newSuccId); return t ? `[${t.wbs_code}] ${t.task_name}` : '선택...' })() : undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availableForSucc.map((t) => (
                            <SelectItem key={t.id} value={t.id}>[{t.wbs_code}] {t.task_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={String(newSuccType)} onValueChange={(v) => v && setNewSuccType(Number(v) as DependencyType)}>
                        <SelectTrigger className="w-16 h-7 text-xs"><SelectValue>{DEP_TYPE_LABELS[newSuccType]}</SelectValue></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">FS</SelectItem>
                          <SelectItem value="2">SS</SelectItem>
                          <SelectItem value="3">FF</SelectItem>
                          <SelectItem value="4">SF</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleAddSucc} disabled={!newSuccId}><Plus className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </div>
              </Section>

              <Section icon={Paperclip} title="첨부파일">
                <div className="border border-dashed border-border/50 rounded-md p-4 text-center hover:border-primary/40 transition-colors cursor-pointer group/upload">
                  <Paperclip className="h-4 w-4 mx-auto mb-1 text-muted-foreground/40 group-hover/upload:text-primary/50 transition-colors" />
                  <p className="text-xs text-muted-foreground/60">파일을 드래그하거나 클릭</p>
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">DB 연결 후 활성화</p>
                </div>
              </Section>
            </div>
          </div>

          {/* ─── 세부항목 (전체 너비) ─── */}
          <Section icon={StickyNote} title="세부항목" count={currentDetails.length} className="relative">
            {/* 입력 + 프로그레스 */}
            <div className="flex items-center gap-3 mb-3">
              {detailProgress !== null && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${detailProgress}%` }} />
                  </div>
                  <span className="text-[11px] font-medium text-primary tabular-nums">{detailProgress}%</span>
                </div>
              )}
              <div className="flex-1" />
              <Input
                placeholder="새 세부항목 제목..."
                value={newDetailTitle}
                onChange={(e) => setNewDetailTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddDetail()}
                className="w-56 h-7 text-xs"
              />
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAddDetail} disabled={!newDetailTitle.trim()}>
                <Plus className="h-3 w-3 mr-1" />추가
              </Button>
            </div>

            {/* 카드 목록 */}
            <div className="space-y-2">
              {currentDetails.map((detail) => {
                const assignee = detail.assignee_id ? members.find(m => m.id === detail.assignee_id) : null
                const isExpanded = expandedDetails.has(detail.id)
                const accent = {
                  todo: { card: 'border-l-amber-400 bg-amber-50/30', header: 'text-amber-600', check: 'text-amber-400' },
                  in_progress: { card: 'border-l-blue-400 bg-blue-50/30', header: 'text-blue-600', check: 'text-blue-500' },
                  done: { card: 'border-l-emerald-400 bg-emerald-50/30', header: 'text-emerald-600', check: 'text-emerald-500' },
                }[detail.status]

                return (
                  <div key={detail.id} className={cn(
                    "rounded-md border border-border/40 border-l-[3px] shadow-sm transition-all hover:shadow group/note",
                    accent.card
                  )}>
                    {/* 카드 헤더 */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5">
                      <button className="flex-shrink-0" onClick={() => handleDetailStatusChange(detail.id, detail.status)}>
                        {detail.status === 'done'
                          ? <CheckSquare className={cn("h-4 w-4", accent.check)} />
                          : <Square className={cn("h-4 w-4", accent.check)} />
                        }
                      </button>
                      <Input
                        value={detail.title}
                        onChange={(e) => updateTaskDetail(detail.id, { title: e.target.value })}
                        className={cn(
                          "h-5 text-xs font-medium border border-transparent bg-white/80 px-1 shadow-none focus-visible:ring-1 focus-visible:border-border rounded flex-1 min-w-0",
                          detail.status === 'done' && 'line-through text-muted-foreground'
                        )}
                      />
                      <Select value={detail.status} onValueChange={(v) => handleDetailStatusSet(detail.id, v as 'todo' | 'in_progress' | 'done')}>
                        <SelectTrigger className={cn("h-5 w-16 text-[10px] border-none bg-white/50 shadow-none px-1.5 flex-shrink-0", accent.header)}>
                          <SelectValue>
                            {detail.status === 'todo' ? '대기' : detail.status === 'in_progress' ? '진행중' : '완료'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">대기</SelectItem>
                          <SelectItem value="in_progress">진행중</SelectItem>
                          <SelectItem value="done">완료</SelectItem>
                        </SelectContent>
                      </Select>
                      <button
                        className="flex-shrink-0 p-0.5 rounded hover:bg-black/5"
                        onClick={() => setExpandedDetails(prev => {
                          const next = new Set(prev)
                          next.has(detail.id) ? next.delete(detail.id) : next.add(detail.id)
                          return next
                        })}
                      >
                        {isExpanded ? <Minimize2 className="h-3 w-3 text-muted-foreground/50" /> : <Maximize2 className="h-3 w-3 text-muted-foreground/50" />}
                      </button>
                      <Button variant="ghost" size="icon" className="h-4 w-4 flex-shrink-0 opacity-0 group-hover/note:opacity-50 hover:!opacity-100" onClick={() => deleteTaskDetail(detail.id)}>
                        <X className="h-2.5 w-2.5 text-red-500" />
                      </Button>
                    </div>

                    {/* 축소 시 메타 한줄 */}
                    {!isExpanded && (assignee || detail.due_date) && (
                      <div className="px-2.5 pb-1.5 flex gap-3 text-[10px] text-muted-foreground/50">
                        {assignee && <span>{assignee.name}</span>}
                        {detail.due_date && <span>{detail.due_date}</span>}
                      </div>
                    )}

                    {/* 확장 시 */}
                    {isExpanded && (
                      <div className="px-2.5 pb-2 pt-1 border-t border-border/20 space-y-1.5">
                        <textarea
                          placeholder="메모..."
                          value={detail.description || ''}
                          onChange={(e) => {
                            updateTaskDetail(detail.id, { description: e.target.value })
                            e.target.style.height = 'auto'
                            e.target.style.height = e.target.scrollHeight + 'px'
                          }}
                          onFocus={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
                          className="w-full text-[11px] text-foreground/70 bg-white border border-border/60 rounded px-1.5 py-1 resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/30 min-h-[32px] overflow-hidden"
                          rows={2}
                        />
                        <div className="flex items-center gap-3">
                          <MemberPicker
                            value={detail.assignee_ids || (detail.assignee_id ? [detail.assignee_id] : [])}
                            onChange={(ids) => updateTaskDetail(detail.id, { assignee_ids: ids, assignee_id: ids[0] || undefined })}
                            placeholder="담당자"
                            size="sm"
                          />
                          <DatePicker
                            value={detail.due_date || ''}
                            onChange={(d) => updateTaskDetail(detail.id, { due_date: d || undefined })}
                            placeholder="기한"
                            className="h-6 text-[11px] border-none bg-transparent shadow-none px-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {currentDetails.length === 0 && (
              <div className="text-center py-4 text-muted-foreground/40 text-xs">
                세부항목이 없습니다
              </div>
            )}
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
