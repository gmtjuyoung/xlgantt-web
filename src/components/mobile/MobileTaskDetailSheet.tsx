import { useMemo, useState, useRef } from 'react'
import { X, Calendar, Users, CheckCircle2, Circle, Loader2, FileText, Plus, Trash2, ChevronDown, ChevronRight, UserPlus } from 'lucide-react'
import { useTaskStore } from '@/stores/task-store'
import { useResourceStore } from '@/stores/resource-store'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'

export function MobileTaskDetailSheet() {
  const taskId = useUIStore((s) => s.mobileTaskId)
  const setMobileTaskId = useUIStore((s) => s.setMobileTaskId)
  const tasks = useTaskStore((s) => s.tasks)
  const updateTask = useTaskStore((s) => s.updateTask)
  const { assignments, members, companies, taskDetails, updateTaskDetail, addTaskDetail, deleteTaskDetail } = useResourceStore()

  const [newDetailTitle, setNewDetailTitle] = useState('')
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null)
  const [infoCollapsed, setInfoCollapsed] = useState(false)
  const [editingRemarks, setEditingRemarks] = useState(false)
  const [remarksValue, setRemarksValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const task = useMemo(() => taskId ? tasks.find((t) => t.id === taskId) : null, [taskId, tasks])

  const taskAssignees = useMemo(() => {
    if (!taskId) return []
    return assignments.filter((a) => a.task_id === taskId).map((a) => {
      const member = members.find((m) => m.id === a.member_id)
      const company = member ? companies.find((c) => c.id === member.company_id) : null
      return { member, company }
    }).filter((a) => a.member)
  }, [taskId, assignments, members, companies])

  const details = useMemo(() => {
    if (!taskId) return []
    return taskDetails.filter((d) => d.task_id === taskId).sort((a, b) => a.sort_order - b.sort_order)
  }, [taskId, taskDetails])

  if (!taskId || !task) return null

  const progressPct = Math.round((task.actual_progress || 0) * 100)

  const handleStatusToggle = (detailId: string, current: string) => {
    const next = current === 'todo' ? 'in_progress' : current === 'in_progress' ? 'done' : 'todo'
    updateTaskDetail(detailId, { status: next as 'todo' | 'in_progress' | 'done' })
  }

  const handleAddDetail = () => {
    if (!newDetailTitle.trim() || !taskId) return
    addTaskDetail({
      id: crypto.randomUUID(),
      task_id: taskId,
      sort_order: details.length * 1000 + 1000,
      title: newDetailTitle.trim(),
      status: 'todo',
      created_at: new Date().toISOString(),
    })
    setNewDetailTitle('')
    inputRef.current?.focus()
  }

  const handleDeleteDetail = (detailId: string) => {
    deleteTaskDetail(detailId)
    if (expandedDetail === detailId) setExpandedDetail(null)
  }

  const handleStartEditRemarks = () => {
    setRemarksValue(task.remarks || '')
    setEditingRemarks(true)
  }

  const handleSaveRemarks = () => {
    updateTask(taskId!, { remarks: remarksValue || undefined })
    setEditingRemarks(false)
  }

  const statusIcon = (status: string) => {
    if (status === 'done') return <CheckCircle2 className="h-5 w-5 text-green-500" />
    if (status === 'in_progress') return <Loader2 className="h-5 w-5 text-blue-500" />
    return <Circle className="h-5 w-5 text-amber-400" />
  }

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-in fade-in-0"
        onClick={() => setMobileTaskId(null)}
      />

      {/* 시트 */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-2xl shadow-2xl max-h-[85dvh] flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* 드래그 핸들 */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        {/* 헤더 */}
        <div className="flex items-start gap-3 px-5 pb-3 border-b border-border/30">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-mono text-muted-foreground">{task.wbs_code}</span>
            <h2 className="text-base font-bold leading-snug mt-0.5">{task.task_name}</h2>
            {task.deliverables && (
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {task.deliverables}
              </p>
            )}
          </div>
          <button
            onClick={() => setMobileTaskId(null)}
            className="p-1.5 rounded-lg hover:bg-accent active:bg-accent/80 flex-shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 본문 스크롤 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          {/* 기본정보 접기/펼치기 토글 */}
          <button
            onClick={() => setInfoCollapsed(!infoCollapsed)}
            className="flex items-center gap-2 w-full py-1 text-xs text-muted-foreground active:text-foreground"
          >
            {infoCollapsed ? <ChevronRight className="h-3.5 w-3.5 stroke-[2]" /> : <ChevronDown className="h-3.5 w-3.5 stroke-[2]" />}
            <span className="font-semibold">기본정보</span>
            {infoCollapsed && (
              <span className="text-[10px] ml-auto">
                {progressPct}% · {task.planned_start?.slice(5) || '-'} ~ {task.planned_end?.slice(5) || '-'}
              </span>
            )}
          </button>

          {!infoCollapsed && (
            <>
              {/* 진척률 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted-foreground">진척률</span>
                  <span className={cn('text-sm font-bold', progressPct >= 100 ? 'text-green-600' : 'text-primary')}>
                    {progressPct}%
                  </span>
                </div>
                <div className="h-2.5 bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', progressPct >= 100 ? 'bg-green-500' : 'bg-primary')}
                    style={{ width: `${Math.min(progressPct, 100)}%` }}
                  />
                </div>
              </div>

              {/* 일정 */}
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="text-sm">
                  <span className="font-mono">{task.planned_start || '-'}</span>
                  <span className="text-muted-foreground mx-1.5">~</span>
                  <span className="font-mono">{task.planned_end || '-'}</span>
                </div>
              </div>

              {/* 담당자 */}
              {taskAssignees.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground">담당자</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {taskAssignees.map(({ member, company }) => (
                      <div key={member!.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                          style={{ backgroundColor: company?.color || '#888' }}
                        >
                          {member!.name.charAt(0)}
                        </div>
                        <span className="text-xs font-medium">{member!.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 비고 (수정 가능) */}
              <div className="rounded-lg bg-muted/20 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-muted-foreground">비고</span>
                  {!editingRemarks && (
                    <button onClick={handleStartEditRemarks} className="text-[10px] text-primary active:text-primary/70">수정</button>
                  )}
                </div>
                {editingRemarks ? (
                  <div className="space-y-2">
                    <textarea
                      value={remarksValue}
                      onChange={(e) => setRemarksValue(e.target.value)}
                      className="w-full text-sm border border-border rounded-lg p-2 min-h-[60px] outline-none focus:ring-2 focus:ring-primary/30 bg-background resize-none"
                      placeholder="비고 입력..."
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditingRemarks(false)} className="px-3 py-1.5 text-xs rounded-lg border border-border active:bg-accent">취소</button>
                      <button onClick={handleSaveRemarks} className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground active:bg-primary/80">저장</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground/80">{task.remarks || '—'}</p>
                )}
              </div>
            </>
          )}

          {/* 세부항목 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground">세부항목</span>
              <span className="text-[11px] text-muted-foreground">
                {details.filter((d) => d.status === 'done').length}/{details.length}
              </span>
            </div>

            {/* 세부항목 추가 입력 */}
            <div className="flex gap-2 mb-3">
              <input
                ref={inputRef}
                value={newDetailTitle}
                onChange={(e) => setNewDetailTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddDetail()}
                placeholder="새 세부항목 추가..."
                className="flex-1 h-10 px-3 rounded-lg border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={handleAddDetail}
                disabled={!newDetailTitle.trim()}
                className={cn(
                  'h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                  newDetailTitle.trim() ? 'bg-primary text-primary-foreground active:bg-primary/80' : 'bg-muted text-muted-foreground'
                )}
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            {/* 세부항목 리스트 */}
            <div className="space-y-1.5">
              {details.map((d) => {
                const isExpanded = expandedDetail === d.id
                return (
                  <div key={d.id} className="rounded-lg border border-border/30 overflow-hidden">
                    {/* 메인 행 */}
                    <div className="flex items-center gap-2 px-3 py-3 active:bg-accent/20">
                      <button onClick={() => handleStatusToggle(d.id, d.status)} className="flex-shrink-0">
                        {statusIcon(d.status)}
                      </button>
                      <span
                        className={cn('text-sm flex-1 min-w-0', d.status === 'done' && 'line-through text-muted-foreground')}
                        onClick={() => setExpandedDetail(isExpanded ? null : d.id)}
                      >
                        {d.title}
                      </span>
                      <button
                        onClick={() => {
                          const next = isExpanded ? null : d.id
                          setExpandedDetail(next)
                          if (next) setInfoCollapsed(true) // 펼치면 기본정보 자동 접기
                        }}
                        className={cn(
                          'flex-shrink-0 p-1.5 rounded-md transition-colors',
                          isExpanded ? 'bg-primary/10 text-primary' : 'bg-muted/60 text-foreground/60 active:bg-muted'
                        )}
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4 stroke-[2.5]" /> : <ChevronRight className="h-4 w-4 stroke-[2.5]" />}
                      </button>
                    </div>

                    {/* 확장 영역: 제목·담당자·기한·메모·삭제 */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-2 border-t border-border/20 space-y-3 bg-muted/10">
                        {/* 제목 수정 */}
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground block mb-1">제목</label>
                          <input
                            value={d.title}
                            onChange={(e) => updateTaskDetail(d.id, { title: e.target.value })}
                            className="w-full h-9 px-3 text-sm border border-border/50 rounded-lg outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                          />
                        </div>

                        {/* 담당자 선택 */}
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1 mb-1.5">
                            <UserPlus className="h-3 w-3" /> 담당자
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {members.map((m) => {
                              const company = companies.find((c) => c.id === m.company_id)
                              const isAssigned = d.assignee_ids?.includes(m.id) || d.assignee_id === m.id
                              return (
                                <button
                                  key={m.id}
                                  onClick={() => {
                                    const current = d.assignee_ids || (d.assignee_id ? [d.assignee_id] : [])
                                    const next = isAssigned
                                      ? current.filter((id) => id !== m.id)
                                      : [...current, m.id]
                                    updateTaskDetail(d.id, { assignee_ids: next, assignee_id: next[0] || undefined })
                                  }}
                                  className={cn(
                                    'flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-colors',
                                    isAssigned ? 'bg-primary/15 text-primary ring-1 ring-primary/30' : 'bg-muted/50 text-muted-foreground active:bg-muted'
                                  )}
                                >
                                  <div
                                    className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold"
                                    style={{ backgroundColor: company?.color || '#888' }}
                                  >
                                    {m.name.charAt(0)}
                                  </div>
                                  {m.name}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* 기한 입력 */}
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                            <Calendar className="h-3 w-3" /> 기한
                          </label>
                          <input
                            type="date"
                            value={d.due_date || ''}
                            onChange={(e) => updateTaskDetail(d.id, { due_date: e.target.value || undefined })}
                            className="w-full h-9 px-3 text-sm border border-border/50 rounded-lg outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                          />
                        </div>

                        {/* 메모 */}
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground block mb-1">메모</label>
                          <textarea
                            value={d.description || ''}
                            onChange={(e) => updateTaskDetail(d.id, { description: e.target.value })}
                            placeholder="메모 입력..."
                            className="w-full text-sm border border-border/50 rounded-lg p-2.5 min-h-[60px] outline-none focus:ring-2 focus:ring-primary/30 bg-background resize-none"
                          />
                        </div>

                        {/* 삭제 */}
                        <button
                          onClick={() => handleDeleteDetail(d.id)}
                          className="flex items-center gap-1.5 text-xs text-red-500 active:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> 삭제
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
