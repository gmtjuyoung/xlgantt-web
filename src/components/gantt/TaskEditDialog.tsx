import { useState, useEffect, useMemo } from 'react'
import { Plus, X, CheckSquare, Square, Paperclip, StickyNote, Link2, Users, FileText, ArrowRight, ArrowLeft, Upload, Trash2, Image, File as FileIcon, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
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
import type { Task, DependencyType } from '@/lib/types'
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
    <div className={cn("rounded-lg border border-border/60 bg-card overflow-hidden", className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b-2 border-primary/30 bg-slate-200/70 dark:bg-slate-700/50">
        <div className="w-1 h-4 bg-primary rounded-full flex-shrink-0" />
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        <span className="text-xs font-bold tracking-wide text-foreground uppercase">{title}</span>
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
  const { companies, members, assignments, addAssignment, updateAssignment, removeAssignment, taskDetails, addTaskDetail, updateTaskDetail, deleteTaskDetail, uploadAttachment, removeAttachment } = useResourceStore()
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
  const [hideCompletedDetails, setHideCompletedDetails] = useState(false)
  const [newAssignPercent, setNewAssignPercent] = useState('100')
  const [newDetailTitle, setNewDetailTitle] = useState('')
  const [uploading, setUploading] = useState(false)

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

  const hasDetails = currentDetails.length > 0

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
    // 진척률은 resource-store의 syncTaskProgress가 자동 계산하므로 수동 설정 불필요
  }

  const handleSave = () => {
    if (!taskId) return
    const changes: Partial<Task> = {
      task_name: taskName,
      planned_start: plannedStart || undefined,
      planned_end: isMilestone && plannedStart ? plannedStart : (plannedEnd || undefined),
      actual_start: actualStart || undefined,
      actual_end: actualEnd || undefined,
      remarks: remarks || undefined,
      calendar_type: calendarType as 'STD' | 'UD1' | 'UD2',
      is_milestone: isMilestone,
    }
    // 세부항목이 있으면 진척률/작업량은 자동 계산이므로 저장에서 제외
    if (!hasDetails) {
      changes.total_workload = totalWorkload ? parseFloat(totalWorkload) : undefined
      changes.actual_progress = actualProgress ? parseFloat(actualProgress) / 100 : 0
    }
    updateTask(taskId, changes)
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
                    <Field label={hasDetails ? '작업량 (자동)' : '작업량 (M/D)'}>
                      <Input type="number" step="0.1" value={hasDetails ? currentDetails.length : totalWorkload} onChange={(e) => setTotalWorkload(e.target.value)} className={cn(fieldCls, hasDetails && "bg-muted/60 text-muted-foreground")} disabled={isGroup || hasDetails} />
                      {hasDetails && <span className="text-[10px] text-muted-foreground/60 mt-0.5 block">세부항목 기준 자동 계산</span>}
                    </Field>
                    <Field label={hasDetails ? '진척률 (자동)' : '진척률 (%)'}>
                      <Input type="number" min="0" max="100" value={hasDetails ? (detailProgress ?? 0) : actualProgress} onChange={(e) => setActualProgress(e.target.value)} className={cn(fieldCls, hasDetails && "bg-muted/60 text-muted-foreground")} disabled={isGroup || hasDetails} />
                      {hasDetails && <span className="text-[10px] text-muted-foreground/60 mt-0.5 block">세부항목 기준 자동 계산</span>}
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
                        <SelectTrigger className="w-24 h-7 text-xs"><SelectValue>{DEP_TYPE_LABELS[newPredType]}</SelectValue></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">{DEP_TYPE_LABELS[1]}</SelectItem>
                          <SelectItem value="2">{DEP_TYPE_LABELS[2]}</SelectItem>
                          <SelectItem value="3">{DEP_TYPE_LABELS[3]}</SelectItem>
                          <SelectItem value="4">{DEP_TYPE_LABELS[4]}</SelectItem>
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
                        <SelectTrigger className="w-24 h-7 text-xs"><SelectValue>{DEP_TYPE_LABELS[newSuccType]}</SelectValue></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">{DEP_TYPE_LABELS[1]}</SelectItem>
                          <SelectItem value="2">{DEP_TYPE_LABELS[2]}</SelectItem>
                          <SelectItem value="3">{DEP_TYPE_LABELS[3]}</SelectItem>
                          <SelectItem value="4">{DEP_TYPE_LABELS[4]}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleAddSucc} disabled={!newSuccId}><Plus className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </div>
              </Section>

              <Section icon={Paperclip} title="첨부파일" count={currentDetails.reduce((sum, d) => sum + (d.attachments?.length || 0), 0)}>
                {/* 파일 업로드 영역 */}
                <div
                  className={cn(
                    "border border-dashed rounded-md p-3 text-center transition-colors cursor-pointer group/upload",
                    uploading ? "border-primary/40 bg-primary/5" : "border-border/50 hover:border-primary/40"
                  )}
                  onClick={() => {
                    if (uploading || currentDetails.length === 0) return
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.multiple = true
                    input.accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.7z'
                    input.onchange = async (e) => {
                      const files = (e.target as HTMLInputElement).files
                      if (!files || files.length === 0) return
                      setUploading(true)
                      // 첫 번째 세부항목에 첨부 (또는 선택된 세부항목)
                      const targetDetail = currentDetails[0]
                      for (const file of Array.from(files)) {
                        await uploadAttachment(targetDetail.id, file)
                      }
                      setUploading(false)
                    }
                    input.click()
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                  onDrop={async (e) => {
                    e.preventDefault(); e.stopPropagation()
                    if (uploading || currentDetails.length === 0) return
                    const files = e.dataTransfer.files
                    if (!files || files.length === 0) return
                    setUploading(true)
                    const targetDetail = currentDetails[0]
                    for (const file of Array.from(files)) {
                      await uploadAttachment(targetDetail.id, file)
                    }
                    setUploading(false)
                  }}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 mx-auto mb-1 text-primary animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mx-auto mb-1 text-muted-foreground/40 group-hover/upload:text-primary/50 transition-colors" />
                  )}
                  <p className="text-xs text-muted-foreground/60">
                    {currentDetails.length === 0 ? '세부항목을 먼저 추가하세요' : uploading ? '업로드 중...' : '파일을 드래그하거나 클릭'}
                  </p>
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">이미지, PDF, 문서, 엑셀 등 (50MB 이하)</p>
                </div>

                {/* 첨부파일 목록 */}
                {currentDetails.some((d) => (d.attachments?.length || 0) > 0) && (
                  <div className="mt-2 space-y-1">
                    {currentDetails.flatMap((d) =>
                      (d.attachments || []).map((att) => {
                        const isImage = att.type?.startsWith('image/')
                        const sizeStr = att.size < 1024 ? `${att.size}B`
                          : att.size < 1048576 ? `${(att.size / 1024).toFixed(1)}KB`
                          : `${(att.size / 1048576).toFixed(1)}MB`
                        return (
                          <div key={att.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors group/att">
                            {isImage ? (
                              <Image className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                            ) : (
                              <FileIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            )}
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-foreground/80 hover:text-primary truncate flex-1"
                              title={att.filename}
                            >
                              {att.filename}
                            </a>
                            <span className="text-[10px] text-muted-foreground/50 flex-shrink-0">{sizeStr}</span>
                            <span className="text-[10px] text-muted-foreground/40 flex-shrink-0">{att.uploaded_by}</span>
                            <Button
                              variant="ghost" size="icon"
                              className="h-4 w-4 flex-shrink-0 opacity-0 group-hover/att:opacity-60 hover:!opacity-100"
                              onClick={(e) => { e.stopPropagation(); removeAttachment(d.id, att.id) }}
                            >
                              <Trash2 className="h-2.5 w-2.5 text-red-500" />
                            </Button>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
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
              <label className="flex items-center gap-1.5 cursor-pointer select-none flex-shrink-0">
                <input type="checkbox" checked={hideCompletedDetails} onChange={(e) => setHideCompletedDetails(e.target.checked)} className="w-3 h-3 rounded accent-primary" />
                <span className="text-[11px] text-muted-foreground">완료 숨기기</span>
              </label>
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

            {/* 카드 목록 — 스크롤 영역 (더 큰 높이 확보) */}
            <div className="space-y-2 max-h-[420px] min-h-[180px] overflow-y-auto pr-1">
              {currentDetails.filter((d) => !hideCompletedDetails || d.status !== 'done').map((detail) => {
                const accent = {
                  todo: { card: 'border-l-amber-400 bg-amber-50/30', chip: 'bg-amber-100 text-amber-700 border-amber-200', check: 'text-amber-400', label: '대기' },
                  in_progress: { card: 'border-l-blue-400 bg-blue-50/30', chip: 'bg-blue-100 text-blue-700 border-blue-200', check: 'text-blue-500', label: '진행중' },
                  done: { card: 'border-l-emerald-400 bg-emerald-50/30', chip: 'bg-emerald-100 text-emerald-700 border-emerald-200', check: 'text-emerald-500', label: '완료' },
                }[detail.status]

                return (
                  <div key={detail.id} className={cn(
                    "rounded-md border border-border/40 border-l-[3px] shadow-sm transition-all hover:shadow group/note px-2.5 py-2 space-y-1.5",
                    accent.card
                  )}>
                    {/* Row 1: 체크 + 제목 + 삭제 */}
                    <div className="flex items-center gap-1.5">
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
                          "h-6 text-xs font-medium border border-transparent bg-white/80 px-1.5 shadow-none focus-visible:ring-1 focus-visible:border-border rounded flex-1 min-w-0",
                          detail.status === 'done' && 'line-through text-muted-foreground'
                        )}
                      />
                      <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0 opacity-0 group-hover/note:opacity-60 hover:!opacity-100" onClick={() => deleteTaskDetail(detail.id)}>
                        <X className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>

                    {/* Row 2: 상태칩 + 담당자 + 기한 (항상 표시) */}
                    <div className="flex items-center flex-wrap gap-2 pl-6">
                      {/* 상태 칩 (DropdownMenu 대신 Select 그대로 쓰되 외형을 칩으로) */}
                      <Select value={detail.status} onValueChange={(v) => handleDetailStatusSet(detail.id, v as 'todo' | 'in_progress' | 'done')}>
                        <SelectTrigger className={cn("h-6 w-auto min-w-[64px] text-[11px] font-semibold rounded-full px-2.5 border shadow-none gap-1 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-60", accent.chip)}>
                          <SelectValue>{accent.label}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">대기</SelectItem>
                          <SelectItem value="in_progress">진행중</SelectItem>
                          <SelectItem value="done">완료</SelectItem>
                        </SelectContent>
                      </Select>
                      <MemberPicker
                        value={detail.assignee_ids || (detail.assignee_id ? [detail.assignee_id] : [])}
                        onChange={(ids) => updateTaskDetail(detail.id, { assignee_ids: ids, assignee_id: ids[0] || undefined })}
                        placeholder="담당자"
                        size="sm"
                      />
                      <DatePicker
                        value={detail.due_date || ''}
                        onChange={(d) => updateTaskDetail(detail.id, { due_date: d || undefined })}
                        placeholder="기한 없음"
                        className="h-6 text-[11px] bg-white/60 border border-border/40 rounded-full px-2 hover:bg-white"
                      />
                    </div>

                    {/* Row 3: 메모 (항상 표시, 한 줄부터 시작, 포커스 시 확장) */}
                    <div className="pl-6">
                      <textarea
                        placeholder="메모..."
                        value={detail.description || ''}
                        onChange={(e) => updateTaskDetail(detail.id, { description: e.target.value })}
                        className="w-full text-[11px] text-foreground/70 bg-white/60 border border-border/40 rounded px-2 py-1 resize-y outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/30"
                        rows={1}
                      />
                    </div>
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
