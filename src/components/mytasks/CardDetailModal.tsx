import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Paperclip,
  MessageSquare,
  Send,
  Trash2,
  FileText,
  Upload,
  Clock,
  CalendarPlus,
  CalendarCheck2,
  BarChart3,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { MemberPicker } from '@/components/common/MemberPicker'
import { useAuthStore } from '@/stores/auth-store'
import { useResourceStore } from '@/stores/resource-store'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { cn } from '@/lib/utils'
import type { TaskDetail } from '@/lib/resource-types'
import type { Task } from '@/lib/types'

interface CardDetailModalProps {
  detailId: string | null
  open: boolean
  onClose: () => void
}

const STATUS_LABELS: Record<string, string> = {
  todo: '대기',
  in_progress: '진행중',
  done: '완료',
}

const STATUS_DOT_COLORS: Record<string, string> = {
  todo: 'bg-amber-400',
  in_progress: 'bg-blue-400',
  done: 'bg-emerald-400',
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function isImageType(type: string): boolean {
  return type.startsWith('image/')
}

export function CardDetailModal({ detailId, open, onClose }: CardDetailModalProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const {
    taskDetails,
    members,
    assignments,
    updateTaskDetail,
    addAttachment,
    removeAttachment,
    addComment,
    deleteComment,
  } = useResourceStore()
  const tasks = useTaskStore((s) => s.tasks)
  const currentProject = useProjectStore((s) => s.currentProject)
  const customStatuses = useProjectStore((s) => s.customStatuses)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [commentText, setCommentText] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const detail: TaskDetail | undefined = useMemo(() => {
    if (!detailId) return undefined
    return taskDetails.find((d) => d.id === detailId)
  }, [detailId, taskDetails])

  const task: Task | undefined = useMemo(() => {
    if (!detail) return undefined
    return tasks.find((t) => t.id === detail.task_id)
  }, [detail, tasks])

  // 프로젝트 커스텀 상태
  const projectCustomStatuses = useMemo(() => {
    if (!currentProject) return []
    return customStatuses.filter((cs) => cs.projectId === currentProject.id)
  }, [customStatuses, currentProject])

  // 전체 상태 목록
  const allStatuses = useMemo(() => {
    const base: { key: string; label: string }[] = [
      { key: 'todo', label: '대기' },
      { key: 'in_progress', label: '진행중' },
    ]
    for (const cs of projectCustomStatuses) {
      base.push({ key: cs.id, label: cs.label })
    }
    base.push({ key: 'done', label: '완료' })
    return base
  }, [projectCustomStatuses])

  // 전체 상태 라벨
  const allStatusLabels = useMemo(() => {
    const labels: Record<string, string> = { ...STATUS_LABELS }
    for (const cs of projectCustomStatuses) {
      labels[cs.id] = cs.label
    }
    return labels
  }, [projectCustomStatuses])

  // 담당자: 세부항목 자체 → 없으면 부모 작업 배정 담당자
  const effectiveAssigneeIds = useMemo(() => {
    if (!detail) return []
    const ids = detail.assignee_ids || (detail.assignee_id ? [detail.assignee_id] : [])
    if (ids.length > 0) return ids
    // 폴백: 부모 작업의 배정 담당자
    if (detail.task_id) {
      return assignments.filter((a) => a.task_id === detail.task_id).map((a) => a.member_id)
    }
    return []
  }, [detail, assignments])

  const assigneeNames = useMemo(() => {
    return effectiveAssigneeIds.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean) as string[]
  }, [effectiveAssigneeIds, members])

  // ESC key to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Reset fullscreen on close
  useEffect(() => {
    if (!open) {
      setIsFullscreen(false)
      setEditingTitle(false)
    }
  }, [open])

  // Start editing title
  const startEditTitle = useCallback(() => {
    if (detail) {
      setTitleValue(detail.title)
      setEditingTitle(true)
      setTimeout(() => titleInputRef.current?.focus(), 0)
    }
  }, [detail])

  const saveTitle = useCallback(() => {
    if (detail && titleValue.trim()) {
      updateTaskDetail(detail.id, { title: titleValue.trim() })
    }
    setEditingTitle(false)
  }, [detail, titleValue, updateTaskDetail])

  // Auto-resize textarea
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.max(150, el.scrollHeight) + 'px'
    }
  }, [])

  useEffect(() => {
    if (open) {
      // 약간의 지연으로 레이아웃 변경 후 높이 재계산
      requestAnimationFrame(autoResizeTextarea)
    }
  }, [open, detail?.description, isFullscreen, autoResizeTextarea])

  // File handling
  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      if (!detail || !currentUser) return
      const fileArr = Array.from(files)
      for (const file of fileArr) {
        if (file.size > MAX_FILE_SIZE) {
          alert(`파일 "${file.name}"이(가) 5MB를 초과합니다.`)
          continue
        }
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = reader.result as string
          addAttachment(detail.id, {
            id: crypto.randomUUID(),
            filename: file.name,
            size: file.size,
            type: file.type,
            data: base64,
            uploaded_by: currentUser.name,
            uploaded_at: new Date().toISOString(),
          })
        }
        reader.readAsDataURL(file)
      }
    },
    [detail, currentUser, addAttachment]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  // Comment submission
  const submitComment = useCallback(() => {
    if (!detail || !currentUser || !commentText.trim()) return
    addComment(detail.id, {
      id: crypto.randomUUID(),
      user_id: currentUser.id,
      user_name: currentUser.name,
      content: commentText.trim(),
      created_at: new Date().toISOString(),
    })
    setCommentText('')
  }, [detail, currentUser, commentText, addComment])

  const handleCommentKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submitComment()
      }
    },
    [submitComment]
  )

  if (!detail || !task) return null
  if (!open) return null

  const attachments = detail.attachments || []
  const comments = detail.comments || []

  // ─── Sidebar content (properties) ───
  const renderProperties = () => (
    <div className="space-y-4">
      {/* Status */}
      <div>
        <label className="text-[11px] font-medium text-muted-foreground/70 mb-1 block">상태</label>
        <Select
          value={detail.status}
          onValueChange={(v) =>
            updateTaskDetail(detail.id, { status: v as 'todo' | 'in_progress' | 'done' })
          }
        >
          <SelectTrigger className="h-8 text-sm">
            <div className="flex items-center gap-2">
              <div className={cn('w-2 h-2 rounded-full', STATUS_DOT_COLORS[detail.status] || 'bg-gray-400')} />
              <SelectValue>{allStatusLabels[detail.status] || detail.status}</SelectValue>
            </div>
          </SelectTrigger>
          <SelectContent>
            {allStatuses.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                <div className="flex items-center gap-2">
                  <div className={cn('w-2 h-2 rounded-full', STATUS_DOT_COLORS[s.key] || 'bg-gray-400')} />
                  {s.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Assignee */}
      <div>
        <label className="text-[11px] font-medium text-muted-foreground/70 mb-1 block">담당자</label>
        {assigneeNames.length > 0 && (
          <div className="text-sm text-foreground mb-1 px-1">
            {assigneeNames.join(', ')}
          </div>
        )}
        <MemberPicker
          value={effectiveAssigneeIds}
          onChange={(ids) =>
            updateTaskDetail(detail.id, { assignee_ids: ids, assignee_id: ids[0] || undefined })
          }
          placeholder={assigneeNames.length > 0 ? '담당자 변경...' : '담당자 선택...'}
          size="sm"
        />
      </div>

      {/* Due date */}
      <div>
        <label className="text-[11px] font-medium text-muted-foreground/70 mb-1 block">기한</label>
        <DatePicker
          value={detail.due_date || ''}
          onChange={(d) => updateTaskDetail(detail.id, { due_date: d || undefined })}
          placeholder="기한 선택"
          className="h-8 text-sm w-full"
        />
      </div>

      {/* Date info */}
      <div className="space-y-2 pt-2 border-t border-border/30">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <CalendarPlus className="h-3 w-3" />
          <span>등록</span>
          <span className="ml-auto font-medium">
            {format(new Date(detail.created_at), 'yyyy-MM-dd')}
          </span>
        </div>
        {detail.started_at && (
          <div className="flex items-center gap-2 text-[11px] text-blue-600">
            <Clock className="h-3 w-3" />
            <span>시작</span>
            <span className="ml-auto font-medium">
              {format(new Date(detail.started_at), 'yyyy-MM-dd')}
            </span>
          </div>
        )}
        {detail.completed_at && (
          <div className="flex items-center gap-2 text-[11px] text-emerald-600">
            <CalendarCheck2 className="h-3 w-3" />
            <span>완료</span>
            <span className="ml-auto font-medium">
              {format(new Date(detail.completed_at), 'MM/dd HH:mm')}
            </span>
          </div>
        )}
      </div>

      {/* Parent task info */}
      <div className="pt-2 border-t border-border/30">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">소속 작업</span>
        </div>
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-start gap-1">
            <span className="text-muted-foreground flex-shrink-0 w-10">작업명</span>
            <span className="font-medium text-foreground/80">{task.task_name}</span>
          </div>
          {(task.planned_start || task.planned_end) && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground flex-shrink-0 w-10">기간</span>
              <span className="font-medium text-foreground/80">
                {task.planned_start || '-'} ~ {task.planned_end || '-'}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground flex-shrink-0 w-10">진척률</span>
            <div className="flex items-center gap-2 flex-1">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.round(task.actual_progress * 100)}%` }}
                />
              </div>
              <span className="font-medium text-foreground/80 tabular-nums">
                {Math.round(task.actual_progress * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ─── Attachments section ───
  const renderAttachments = () => (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">첨부파일</span>
        {attachments.length > 0 && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{attachments.length}</Badge>
        )}
      </div>

      {/* File list */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="group flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors max-w-[220px] cursor-pointer"
              onClick={() => {
                // 클릭 시 다운로드 또는 새 탭에서 열기
                if (att.data) {
                  if (isImageType(att.type)) {
                    window.open(att.data, '_blank')
                  } else {
                    const link = document.createElement('a')
                    link.href = att.data
                    link.download = att.filename
                    link.click()
                  }
                }
              }}
              title={`${att.filename} - 클릭하여 ${isImageType(att.type) ? '미리보기' : '다운로드'}`}
            >
              {isImageType(att.type) ? (
                <img
                  src={att.data}
                  alt={att.filename}
                  className="w-8 h-8 rounded object-cover flex-shrink-0"
                />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{att.filename}</p>
                <p className="text-[10px] text-muted-foreground">{formatFileSize(att.size)}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeAttachment(detail.id, att.id) }}
                className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 transition-all"
              >
                <X className="h-3 w-3 text-red-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone / Add button */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-border/40 hover:border-primary/40'
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-4 w-4 mx-auto mb-1 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground/60">
          파일을 드래그하거나 클릭하여 추가 (최대 5MB)
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )

  // ─── Memo section ───
  const renderMemo = () => (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">메모</span>
      </div>
      <textarea
        ref={(el) => {
          (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
          if (el) { el.style.height = 'auto'; el.style.height = Math.max(150, el.scrollHeight) + 'px' }
        }}
        placeholder="메모를 입력하세요..."
        value={detail.description || ''}
        onChange={(e) => {
          updateTaskDetail(detail.id, { description: e.target.value })
          const el = e.target
          el.style.height = 'auto'
          el.style.height = Math.max(150, el.scrollHeight) + 'px'
        }}
        className="w-full text-sm text-foreground bg-white border border-border rounded-lg px-4 py-3 resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/40 transition-colors"
        style={{ minHeight: 150 }}
      />
    </div>
  )

  // ─── Comments section ───
  const renderComments = () => (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">코멘트</span>
        {comments.length > 0 && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{comments.length}</Badge>
        )}
      </div>

      {/* Comment list */}
      {comments.length > 0 && (
        <div className="space-y-1 mb-3">
          {comments.map((comment) => (
            <div key={comment.id} className="group flex gap-2.5 px-3 py-2 rounded-md hover:bg-muted/30 transition-colors">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                {comment.user_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{comment.user_name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(comment.created_at), 'MM/dd HH:mm')}
                  </span>
                  {currentUser?.id === comment.user_id && (
                    <button
                      onClick={() => deleteComment(detail.id, comment.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 transition-all ml-auto"
                    >
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-foreground/80 mt-0.5 whitespace-pre-wrap break-words">
                  {comment.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {comments.length === 0 && (
        <div className="text-center py-4 text-[11px] text-muted-foreground/40 mb-2">
          아직 코멘트가 없습니다
        </div>
      )}

      {/* Comment input */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="코멘트 입력..."
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={handleCommentKeyDown}
          className="flex-1 h-8 text-sm border border-border/50 rounded-md px-3 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 bg-background placeholder:text-muted-foreground/40"
        />
        <Button
          size="sm"
          className="h-8 px-3"
          disabled={!commentText.trim()}
          onClick={submitComment}
        >
          <Send className="h-3 w-3 mr-1" />
          등록
        </Button>
      </div>
    </div>
  )

  // ─── Panel content ───
  const panelContent = (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-50 transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0 }}
        onClick={onClose}
      />

      {/* Sliding Panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed top-0 right-0 h-full z-50 bg-background border-l border-border/40 shadow-2xl flex flex-col',
          'transition-all duration-300 ease-out',
          isFullscreen ? 'w-full' : 'w-[480px] max-w-[95vw]'
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40 bg-background flex-shrink-0">
          <Badge variant="outline" className="text-xs font-mono px-2 py-0.5 bg-primary/5 border-primary/20 flex-shrink-0">
            {task.wbs_code}
          </Badge>
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle()
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
                className="w-full text-lg font-semibold bg-transparent border-b-2 border-primary outline-none px-0.5"
              />
            ) : (
              <h2
                className="text-lg font-semibold truncate cursor-pointer hover:text-primary/80 transition-colors"
                onClick={startEditTitle}
                title="클릭하여 편집"
              >
                {detail.title}
              </h2>
            )}
          </div>
          <button
            onClick={() => setIsFullscreen((v) => !v)}
            className="flex-shrink-0 p-1.5 rounded-md hover:bg-accent transition-colors"
            title={isFullscreen ? '패널 모드' : '전체화면'}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Maximize2 className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-md hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        {isFullscreen ? (
          /* ─── Fullscreen: 2-column layout ─── */
          <div className="flex flex-1 overflow-hidden">
            {/* Left column: 65% - memo + comments */}
            <div className="flex-[65] min-w-0 overflow-y-auto p-5 space-y-5 border-r border-border/40">
              {renderMemo()}
              {renderComments()}
            </div>

            {/* Right column: 35% - properties + attachments */}
            <div className="flex-[35] min-w-0 overflow-y-auto p-4 bg-muted/10 space-y-4">
              {renderProperties()}
              <div className="pt-2 border-t border-border/30">
                {renderAttachments()}
              </div>
            </div>
          </div>
        ) : (
          /* ─── Default panel: single column scroll ─── */
          <div className="flex-1 overflow-y-auto">
            {/* Properties bar */}
            <div className="px-5 py-3 border-b border-border/40 space-y-2.5 bg-muted/5">
              {/* Status row */}
              <div className="flex items-center gap-3">
                <label className="text-[11px] font-medium text-muted-foreground/70 w-12 flex-shrink-0">상태</label>
                <Select
                  value={detail.status}
                  onValueChange={(v) =>
                    updateTaskDetail(detail.id, { status: v as 'todo' | 'in_progress' | 'done' })
                  }
                >
                  <SelectTrigger className="h-7 text-sm w-[120px]">
                    <div className="flex items-center gap-2">
                      <div className={cn('w-2 h-2 rounded-full', STATUS_DOT_COLORS[detail.status] || 'bg-gray-400')} />
                      <SelectValue>{allStatusLabels[detail.status] || detail.status}</SelectValue>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {allStatuses.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        <div className="flex items-center gap-2">
                          <div className={cn('w-2 h-2 rounded-full', STATUS_DOT_COLORS[s.key] || 'bg-gray-400')} />
                          {s.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Assignee row */}
              <div className="flex items-center gap-3">
                <label className="text-[11px] font-medium text-muted-foreground/70 w-12 flex-shrink-0">담당자</label>
                <div className="flex-1">
                  {assigneeNames.length > 0 && (
                    <div className="text-sm text-foreground mb-1">
                      {assigneeNames.join(', ')}
                    </div>
                  )}
                  <MemberPicker
                    value={effectiveAssigneeIds}
                    onChange={(ids) =>
                      updateTaskDetail(detail.id, { assignee_ids: ids, assignee_id: ids[0] || undefined })
                    }
                    placeholder={assigneeNames.length > 0 ? '담당자 변경...' : '담당자 선택...'}
                    size="sm"
                  />
                </div>
              </div>

              {/* Due date row */}
              <div className="flex items-center gap-3">
                <label className="text-[11px] font-medium text-muted-foreground/70 w-12 flex-shrink-0">기한</label>
                <DatePicker
                  value={detail.due_date || ''}
                  onChange={(d) => updateTaskDetail(detail.id, { due_date: d || undefined })}
                  placeholder="기한 선택"
                  className="h-7 text-sm w-[160px]"
                />
              </div>

              {/* Date info inline */}
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1 border-t border-border/20">
                <span className="flex items-center gap-1">
                  <CalendarPlus className="h-3 w-3" />
                  등록 {format(new Date(detail.created_at), 'MM/dd')}
                </span>
                {detail.started_at && (
                  <span className="flex items-center gap-1 text-blue-600">
                    <Clock className="h-3 w-3" />
                    시작 {format(new Date(detail.started_at), 'MM/dd')}
                  </span>
                )}
                {detail.completed_at && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CalendarCheck2 className="h-3 w-3" />
                    완료 {format(new Date(detail.completed_at), 'MM/dd HH:mm')}
                  </span>
                )}
              </div>
            </div>

            {/* Content sections */}
            <div className="p-5 space-y-5">
              {renderMemo()}
              {renderAttachments()}
              {renderComments()}
            </div>
          </div>
        )}
      </div>
    </>
  )

  return createPortal(panelContent, document.body)
}
