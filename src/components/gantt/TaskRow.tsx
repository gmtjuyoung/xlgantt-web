import { useCallback, useMemo } from 'react'
import { ChevronRight, GripVertical } from 'lucide-react'
import type { Task } from '@/lib/types'
import { ROW_HEIGHT } from '@/lib/types'
import { useTaskStore } from '@/stores/task-store'
import { useResourceStore } from '@/stores/resource-store'
import { useProjectStore } from '@/stores/project-store'
import { TaskCell } from './TaskCell'
import { cn } from '@/lib/utils'
import type { ColumnDef } from '@/lib/column-defs'

interface TaskRowProps {
  task: Task
  rowIndex: number
  columns: ColumnDef[]
  onDoubleClick?: (taskId: string) => void
  onContextMenu?: (taskId: string, x: number, y: number) => void
  /** Drag-and-drop */
  isDragging?: boolean
  isDropTarget?: boolean
  dropPosition?: 'above' | 'below' | null
  onDragStart?: (e: React.DragEvent, taskId: string) => void
  onDragEnd?: (e: React.DragEvent) => void
}

export function TaskRow({ task, rowIndex, columns, onDoubleClick, onContextMenu, isDragging, isDropTarget, dropPosition, onDragStart, onDragEnd }: TaskRowProps) {
  const { selectedTaskIds, selectTask, toggleCollapse, updateTask } =
    useTaskStore()
  const { assignments, members, companies, taskDetails } = useResourceStore()
  const theme = useProjectStore((s) => s.theme)

  // 레벨1 그룹 작업의 테마 색상 (colors[0] = 그룹 계획 색상)
  const level1GroupColor = task.is_group && task.wbs_level === 1 ? theme.colors[0] : undefined

  const isSelected = selectedTaskIds.has(task.id)

  // 담당자 표시 문자열 생성
  const assigneeDisplay = useMemo(() => {
    const taskAssigns = assignments.filter((a) => a.task_id === task.id)
    if (taskAssigns.length === 0) return ''

    return taskAssigns.map((a) => {
      const member = members.find((m) => m.id === a.member_id)
      if (!member) return ''
      const company = companies.find((c) => c.id === member.company_id)
      const compPrefix = company ? `${company.shortName}/` : ''
      return `${compPrefix}${member.name}`
    }).filter(Boolean).join(', ')
  }, [task.id, assignments, members, companies])

  // 세부항목 카운트
  const detailCount = useMemo(() => {
    const details = taskDetails.filter((d) => d.task_id === task.id)
    if (details.length === 0) return null
    const done = details.filter((d) => d.status === 'done').length
    return { done, total: details.length }
  }, [task.id, taskDetails])

  // 총 컬럼 너비 계산
  const totalWidth = useMemo(() => columns.reduce((sum, col) => sum + col.width, 0), [columns])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const mode = e.shiftKey ? 'range' : (e.ctrlKey || e.metaKey) ? 'toggle' : 'single'
      selectTask(task.id, mode)
    },
    [task.id, selectTask]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      selectTask(task.id, 'single')
      onContextMenu?.(task.id, e.clientX, e.clientY)
    },
    [task.id, selectTask, onContextMenu]
  )

  const handleToggleCollapse = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      toggleCollapse(task.id)
    },
    [task.id, toggleCollapse]
  )

  const handleCellChange = useCallback(
    (field: string, value: unknown) => {
      updateTask(task.id, { [field]: value })
    },
    [task.id, updateTask]
  )

  const renderCell = (col: ColumnDef) => {
    // 작업명 컬럼 - 들여쓰기/접기/펼치기 지원
    if (col.id === 'task_name') {
      return (
        <div
          key={col.id}
          style={{ width: col.width, minWidth: col.width }}
          className="flex items-center border-r overflow-hidden"
        >
          {/* Indent spacer */}
          <div style={{ width: (task.wbs_level - 1) * 16 }} className="flex-shrink-0" />

          {/* Expand/collapse toggle for group tasks */}
          {task.is_group ? (
            <button
              className="flex-shrink-0 p-0.5 hover:bg-accent rounded"
              onClick={handleToggleCollapse}
            >
              {task.is_collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <div className="h-4 w-4 flex items-center justify-center">
                  <div className="w-[2px] h-3 bg-current rounded-full" />
                </div>
              )}
            </button>
          ) : (
            <div className="w-4 flex-shrink-0" />
          )}

          <TaskCell
            taskId={task.id}
            field="task_name"
            value={task.task_name}
            onChange={(v) => handleCellChange('task_name', v)}
            type="text"
          />
          {detailCount && (
            <span className={cn(
              "flex-shrink-0 text-[10px] font-medium px-1 py-0 rounded mr-1",
              detailCount.done === detailCount.total
                ? "bg-green-100 text-green-700"
                : "bg-blue-100 text-blue-700"
            )}>
              {detailCount.done}/{detailCount.total}
            </span>
          )}
        </div>
      )
    }

    // 담당자 컬럼 - resource-store에서 읽기
    if (col.id === 'assignees') {
      return (
        <div
          key={col.id}
          style={{ width: col.width, minWidth: col.width }}
          className="flex items-center justify-center px-1.5 border-r overflow-hidden"
        >
          {assigneeDisplay ? (
            <div className="flex items-center gap-0.5 overflow-hidden">
              {assignments.filter((a) => a.task_id === task.id).slice(0, 3).map((a) => {
                const member = members.find((m) => m.id === a.member_id)
                const company = member ? companies.find((c) => c.id === member.company_id) : null
                if (!member) return null
                return (
                  <div
                    key={a.id}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0"
                    style={{ backgroundColor: company?.color || '#888' }}
                    title={`${company?.shortName || ''} ${member.name} (${a.allocation_percent}%)`}
                  >
                    {member.name.charAt(0)}
                  </div>
                )
              })}
              {assignments.filter((a) => a.task_id === task.id).length > 3 && (
                <span className="text-[9px] text-muted-foreground ml-0.5">
                  +{assignments.filter((a) => a.task_id === task.id).length - 3}
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground/50 text-[10px]">—</span>
          )}
        </div>
      )
    }

    // 진척률 (actual_progress) - 모던 바 표시
    if (col.id === 'actual_progress') {
      const pct = Math.round(task.actual_progress * 100)
      return (
        <div
          key={col.id}
          style={{ width: col.width, minWidth: col.width }}
          className="flex items-center justify-center px-2 border-r gap-1.5"
        >
          {task.actual_progress_override != null && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="수동 진척률" />
          )}
          <div className="flex items-center gap-1.5 w-full">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  backgroundColor: pct >= 75 ? '#2563eb' : pct >= 50 ? '#3b82f6' : pct >= 25 ? '#f59e0b' : '#f97316',
                }}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums text-foreground/70 w-8 text-right">
              {pct}%
            </span>
          </div>
        </div>
      )
    }

    // 계획진척률 (planned_progress) - 모던 바 표시
    if (col.id === 'planned_progress') {
      const pct = Math.round(task.planned_progress * 100)
      return (
        <div
          key={col.id}
          style={{ width: col.width, minWidth: col.width }}
          className="flex items-center justify-center px-2 border-r gap-1.5"
        >
          {task.planned_progress_override != null && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="수동 계획진척률" />
          )}
          <div className="flex items-center gap-1.5 w-full">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  backgroundColor: '#8b5cf6',
                }}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums text-foreground/70 w-8 text-right">
              {pct}%
            </span>
          </div>
        </div>
      )
    }

    // 불리언 컬럼 (마일스톤, 그룹여부)
    if (col.type === 'boolean') {
      const boolValue = (task as unknown as Record<string, unknown>)[col.id]
      return (
        <div
          key={col.id}
          style={{ width: col.width, minWidth: col.width }}
          className="flex items-center justify-center border-r"
        >
          <span className={cn(
            "text-[11px] font-medium px-1.5 py-0.5 rounded",
            boolValue ? "bg-primary/10 text-primary" : "text-muted-foreground/40"
          )}>
            {boolValue ? 'Y' : 'N'}
          </span>
        </div>
      )
    }

    // WBS 코드 - 좌측 세로 컬러 바 (레벨별 테마 색 + 계단식 뎁스 표시)
    if (col.id === 'wbs_code') {
      // 테마 팔레트의 서로 다른 hue를 레벨 1~6에 매핑
      const levelColorIdx = [0, 2, 7, 4, 10, 13]
      const idx = levelColorIdx[Math.min(task.wbs_level - 1, 5)] ?? 0
      const barColor = theme.colors[idx] || '#888888'
      // 레벨에 따라 바 두께 살짝 감소 (L1 가장 굵음)
      const barWidth = Math.max(5 - (task.wbs_level - 1), 2)
      // 레벨에 따라 바 좌측 오프셋 증가 (계단식 뎁스)
      const barOffset = (task.wbs_level - 1) * 4
      // 텍스트도 살짝 따라 들여쓰기
      const textPadding = 8 + barOffset
      return (
        <div
          key={col.id}
          style={{ width: col.width, minWidth: col.width }}
          className="flex items-center justify-start border-r relative"
        >
          <div
            className="absolute top-0.5 bottom-0.5 rounded-sm"
            style={{
              backgroundColor: barColor,
              width: `${barWidth}px`,
              left: `${barOffset}px`,
              boxShadow: '1px 0 2px rgba(0,0,0,0.15), -1px 0 0 rgba(255,255,255,0.3)',
            }}
          />
          <span
            className="font-semibold text-foreground"
            style={{ paddingLeft: `${textPadding}px` }}
          >
            {task.wbs_code}
          </span>
        </div>
      )
    }

    // 달력유형 (select)
    if (col.id === 'calendar_type') {
      return (
        <div
          key={col.id}
          style={{ width: col.width, minWidth: col.width }}
          className="flex items-center justify-center border-r"
        >
          <span className="text-xs text-muted-foreground">
            {task.calendar_type || 'STD'}
          </span>
        </div>
      )
    }

    // 일반 셀
    const value = (task as unknown as Record<string, unknown>)[col.id]
    // 그룹 작업: 읽기전용 필드
    const groupReadOnlyFields = ['planned_start', 'planned_end', 'total_duration', 'total_workload']
    // 세부항목 있는 작업: 진척률/작업량 자동 계산이므로 읽기전용
    const hasTaskDetails = detailCount !== null
    const autoCalcReadOnlyFields = hasTaskDetails ? ['total_workload', 'actual_progress'] : []
    const isReadOnly = col.id === 'total_duration' || col.id === 'wbs_code' || col.id === 'wbs_level'
      || (task.is_group && groupReadOnlyFields.includes(col.id))
      || (col.readOnlyForGroup && task.is_group)
      || autoCalcReadOnlyFields.includes(col.id)

    // 셀 타입 결정
    const cellType: 'text' | 'date' | 'number' = (() => {
      if (col.type === 'date') return 'date'
      if (col.type === 'number') return 'number'
      if (col.id.includes('date') || col.id.includes('start') || col.id.includes('end')) return 'date'
      if (col.id.includes('workload') || col.id.includes('duration') || col.id.includes('count') || col.id.includes('level')) return 'number'
      return 'text'
    })()

    return (
      <div
        key={col.id}
        style={{ width: col.width, minWidth: col.width }}
        className="flex items-center justify-center border-r"
      >
        {isReadOnly ? (
          <div className={cn("w-full px-2 truncate select-none text-center", task.is_group && task.wbs_level !== 1 && "bg-muted/60 text-muted-foreground", task.is_group && task.wbs_level === 1 && "bg-muted/40")}>
            {value != null ? String(value) : ''}
          </div>
        ) : (
          <TaskCell
            taskId={task.id}
            field={col.id}
            value={value}
            onChange={(v) => handleCellChange(col.id, v)}
            type={cellType}
          />
        )}
      </div>
    )
  }

  // 레벨별 폰트 크기: 레벨1이 가장 크고 내려갈수록 작아짐 (식별성 강화)
  const levelFontSize = (() => {
    switch (task.wbs_level) {
      case 1: return 'text-[15px]'
      case 2: return 'text-[14px]'
      case 3: return 'text-[13px]'
      case 4: return 'text-[12px]'
      case 5: return 'text-[11px]'
      default: return 'text-[10px]'
    }
  })()

  return (
    <div
      className={cn(
        'group/row flex border-b border-slate-300 dark:border-slate-700 cursor-pointer transition-all duration-100 relative',
        levelFontSize,
        isSelected && 'bg-primary/8 border-l-2 border-l-primary',
        !isSelected && task.is_group && task.wbs_level === 1 && 'bg-slate-100 dark:bg-slate-800/60 font-bold border-b-border/50',
        !isSelected && task.is_group && task.wbs_level === 2 && 'bg-blue-50/60 dark:bg-blue-900/20 font-semibold',
        task.archived_at && 'opacity-50 bg-stripes',
        !isSelected && !task.is_group && 'hover:bg-accent/40',
        !isSelected && !task.is_group && rowIndex % 2 === 1 && 'bg-muted/20',
        isDragging && 'opacity-40',
      )}
      style={{ height: ROW_HEIGHT, minWidth: totalWidth, ...(level1GroupColor ? { color: level1GroupColor } : {}) }}
      onClick={handleClick}
      onDoubleClick={() => onDoubleClick?.(task.id)}
      onContextMenu={handleContextMenu}
    >
      {/* Drop indicator line */}
      {isDropTarget && dropPosition === 'above' && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-20 pointer-events-none" style={{ transform: 'translateY(-1px)' }}>
          <div className="absolute -left-0.5 -top-1 w-2 h-2 rounded-full bg-blue-500" />
        </div>
      )}
      {isDropTarget && dropPosition === 'below' && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-20 pointer-events-none" style={{ transform: 'translateY(1px)' }}>
          <div className="absolute -left-0.5 -top-1 w-2 h-2 rounded-full bg-blue-500" />
        </div>
      )}

      {/* Drag handle */}
      <div
        className="flex-shrink-0 w-5 flex items-center justify-center opacity-0 group-hover/row:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing"
        draggable
        onDragStart={(e) => {
          e.stopPropagation()
          onDragStart?.(e, task.id)
        }}
        onDragEnd={(e) => {
          e.stopPropagation()
          onDragEnd?.(e)
        }}
        title="드래그하여 이동"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      {columns.map((col) => renderCell(col))}
    </div>
  )
}
