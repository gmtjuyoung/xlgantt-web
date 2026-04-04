import { useCallback, useState, useRef } from 'react'
import type { Task, GanttScale, ColorTheme, Dependency } from '@/lib/types'
import { taskToBarRect, dateToX } from '@/lib/gantt-math'
import { useTaskStore } from '@/stores/task-store'
import { useUIStore } from '@/stores/ui-store'
import { useProjectStore } from '@/stores/project-store'
import { useCalendarStore } from '@/stores/calendar-store'
import { useResourceStore } from '@/stores/resource-store'
import { snapToWorkingDay } from '@/lib/calendar-calc'
import { format, addDays } from 'date-fns'

interface GanttBarProps {
  task: Task
  rowIndex: number
  scale: GanttScale
  theme: ColorTheme
  onDoubleClick?: (taskId: string) => void
  onContextMenu?: (taskId: string, x: number, y: number) => void
}

/** Local drag preview state to avoid store updates on every pointermove */
interface DragPreview {
  startDate: Date
  endDate: Date
  x: number
  width: number
}

export function GanttBar({ task, rowIndex, scale, theme, onDoubleClick, onContextMenu }: GanttBarProps) {
  const { selectTask, selectedTaskIds, updateTask, addDependency, dependencies } = useTaskStore()
  const { linkMode, linkSourceTaskId, setLinkSource, ganttOptions } = useUIStore()
  const taskDetails = useResourceStore((s) => s.taskDetails)
  const myDetails = taskDetails.filter((d) => d.task_id === task.id)
  const detailDone = myDetails.filter((d) => d.status === 'done').length
  const detailTotal = myDetails.length
  const detailLabel = detailTotal > 0 ? ` (${detailDone}/${detailTotal})` : ''
  const project = useProjectStore((s) => s.currentProject)
  const [hovering, setHovering] = useState(false)
  const [dragging, setDragging] = useState<'left' | 'right' | 'move' | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const dragStartRef = useRef<{
    x: number
    origStart: Date
    origEnd: Date
    origBarX: number
    origBarWidth: number
    lastDeltaDays: number
  } | null>(null)
  const rafRef = useRef<number | null>(null)

  const rect = taskToBarRect(task, scale, rowIndex)

  const isSelected = selectedTaskIds.has(task.id)
  const isLinkSource = linkMode && linkSourceTaskId === task.id

  // Determine bar color based on task type and theme
  const getBarColor = () => {
    if (task.is_milestone) {
      return theme.colors[6] // milestone planned
    }
    if (task.is_group) {
      return theme.colors[0] // group planned
    }
    // Check if complete
    if (task.actual_progress >= 1) {
      return theme.colors[8] // complete
    }
    // colorByProgress: 기준일 기준으로 지연 판정
    if (ganttOptions.colorByProgress) {
      const statusDate = useProjectStore.getState().currentProject?.status_date
      const ref = statusDate ? new Date(statusDate) : new Date()
      if (task.planned_end && new Date(task.planned_end) < ref && task.actual_progress < 1) {
        return '#ef4444' // red for delayed tasks
      }
      // 기준일 기준 계획 진척률 계산
      if (task.planned_start && task.planned_end) {
        const start = new Date(task.planned_start)
        const end = new Date(task.planned_end)
        const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000)
        const elapsed = Math.max(0, (ref.getTime() - start.getTime()) / 86400000)
        const expectedProgress = Math.min(1, elapsed / totalDays)
        if (expectedProgress > task.actual_progress + 0.05) {
          return '#f59e0b' // amber for behind schedule
        }
      }
    }
    return theme.colors[4] // leaf planned
  }

  const getActualColor = () => {
    if (task.is_group) return theme.colors[1]
    return theme.colors[5] // leaf actual
  }

  const barColor = getBarColor()

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragging) return
      e.stopPropagation()

      if (linkMode) {
        if (!linkSourceTaskId) {
          // First click: set this task as the source (predecessor)
          setLinkSource(task.id)
        } else {
          // Second click: create dependency from source to this task
          if (linkSourceTaskId === task.id) {
            // Same task clicked twice - ignore
            return
          }
          // Check for duplicate dependency
          const alreadyExists = dependencies.some(
            (d) =>
              d.predecessor_id === linkSourceTaskId &&
              d.successor_id === task.id
          )
          if (!alreadyExists) {
            const newDep: Dependency = {
              id: crypto.randomUUID(),
              project_id: project?.id || '',
              predecessor_id: linkSourceTaskId,
              successor_id: task.id,
              dep_type: 1, // FS (Finish-to-Start)
              lag_days: 0,
              created_at: new Date().toISOString(),
            }
            addDependency(newDep)
          }
          // Reset source for next link
          setLinkSource(null)
        }
        return
      }

      selectTask(task.id, e.ctrlKey || e.metaKey)
    },
    [task.id, selectTask, dragging, linkMode, linkSourceTaskId, setLinkSource, addDependency, dependencies, project?.id]
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDoubleClick?.(task.id)
    },
    [task.id, onDoubleClick]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      selectTask(task.id, false)
      onContextMenu?.(task.id, e.clientX, e.clientY)
    },
    [task.id, selectTask, onContextMenu]
  )

  // Drag to resize/move - uses local preview during drag, commits to store on pointerup
  const handleDragStart = useCallback(
    (mode: 'left' | 'right' | 'move', e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (!task.planned_start || !task.planned_end) return
      // Group tasks cannot be dragged (dates auto-calculated from children)
      if (task.is_group) return
      // Milestones: only move allowed (no left/right resize)
      if (task.is_milestone && mode !== 'move') return

      const target = e.currentTarget as Element
      target.setPointerCapture(e.pointerId)

      const origStart = new Date(task.planned_start)
      const origEnd = new Date(task.planned_end)
      const origBarX = rect ? rect.x : dateToX(origStart, scale)
      const origBarWidth = rect ? rect.width : (dateToX(addDays(origEnd, 1), scale) - origBarX)

      setDragging(mode)
      dragStartRef.current = {
        x: e.clientX,
        origStart,
        origEnd,
        origBarX,
        origBarWidth,
        lastDeltaDays: 0,
      }
    },
    [task.id, task.planned_start, task.planned_end, task.is_group, task.is_milestone, scale, rect]
  )

  const handleDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current || !dragging) return

      // Cancel any pending rAF to avoid stacking
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }

      const clientX = e.clientX

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const ref = dragStartRef.current
        if (!ref) return

        const deltaX = clientX - ref.x
        const deltaDays = Math.round(deltaX / scale.pixelsPerDay)

        // Skip update if days didn't change
        if (deltaDays === ref.lastDeltaDays) return
        ref.lastDeltaDays = deltaDays

        let newStart = ref.origStart
        let newEnd = ref.origEnd

        if (dragging === 'move') {
          newStart = addDays(ref.origStart, deltaDays)
          newEnd = addDays(ref.origEnd, deltaDays)
        } else if (dragging === 'left') {
          newStart = addDays(ref.origStart, deltaDays)
          // Ensure minimum 1 day
          if (newStart >= ref.origEnd) newStart = addDays(ref.origEnd, -1)
        } else if (dragging === 'right') {
          newEnd = addDays(ref.origEnd, deltaDays)
          // Ensure minimum 1 day
          if (newEnd <= ref.origStart) newEnd = addDays(ref.origStart, 1)
        }

        // Compute preview bar rect
        const previewX = dateToX(newStart, scale)
        const previewEndX = dateToX(addDays(newEnd, 1), scale)
        const previewWidth = Math.max(previewEndX - previewX, 4)

        setDragPreview({
          startDate: newStart,
          endDate: newEnd,
          x: previewX,
          width: previewWidth,
        })
      })
    },
    [dragging, scale]
  )

  const handleDragEnd = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current || !dragging) return

      const target = e.currentTarget as Element
      target.releasePointerCapture(e.pointerId)

      // Cancel pending rAF
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      const ref = dragStartRef.current
      const deltaX = e.clientX - ref.x
      const deltaDays = Math.round(deltaX / scale.pixelsPerDay)

      // Only commit if actually moved
      if (deltaDays !== 0) {
        let newStart = ref.origStart
        let newEnd = ref.origEnd

        if (dragging === 'move') {
          newStart = addDays(ref.origStart, deltaDays)
          newEnd = addDays(ref.origEnd, deltaDays)
        } else if (dragging === 'left') {
          newStart = addDays(ref.origStart, deltaDays)
          if (newStart >= ref.origEnd) newStart = addDays(ref.origEnd, -1)
        } else if (dragging === 'right') {
          newEnd = addDays(ref.origEnd, deltaDays)
          if (newEnd <= ref.origStart) newEnd = addDays(ref.origStart, 1)
        }

        // Snap to working days
        const calStore = useCalendarStore.getState()
        const holidays = calStore.getHolidaySet(task.calendar_type)
        const workDays = calStore.getWorkingDaysFor(task.calendar_type)

        newStart = snapToWorkingDay(newStart, workDays, holidays)
        newEnd = snapToWorkingDay(newEnd, workDays, holidays)

        // Final min 1 day guard after snapping
        if (newEnd <= newStart) {
          newEnd = addDays(newStart, 1)
          newEnd = snapToWorkingDay(newEnd, workDays, holidays)
        }

        updateTask(task.id, {
          planned_start: format(newStart, 'yyyy-MM-dd'),
          planned_end: format(newEnd, 'yyyy-MM-dd'),
        })
      }

      setDragging(null)
      setDragPreview(null)
      dragStartRef.current = null
    },
    [dragging, scale, task.id, task.calendar_type, updateTask]
  )

  if (!rect) return null

  const progressWidth = rect.width * task.actual_progress

  // Milestone diamond
  if (task.is_milestone) {
    // Use drag preview position if dragging, otherwise use original rect
    const milestoneX = dragPreview ? dragPreview.x : rect.x
    const cx = milestoneX
    const cy = rect.y + rect.height / 2
    const s = 12
    const isComplete = task.actual_progress >= 1
    const milestoneColor = isComplete ? theme.colors[7] : theme.colors[6]
    const pts = `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`
    const isDragging = dragging !== null

    return (
      <g
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        className={linkMode ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}
        opacity={isDragging ? 0.7 : 1}
      >
        {/* Shadow */}
        <polygon
          points={pts}
          fill="rgba(0,0,0,0.15)"
          transform={`translate(1,2)`}
        />
        {/* Main diamond */}
        <polygon
          points={pts}
          fill={milestoneColor}
          stroke={isLinkSource ? '#f97316' : isSelected ? 'oklch(0.50 0.17 255)' : hovering ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.15)'}
          strokeWidth={isLinkSource ? 3 : isSelected ? 2.5 : 1.5}
          strokeLinejoin="round"
          shapeRendering="geometricPrecision"
        />
        {/* Checkmark if complete */}
        {isComplete && (
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize={14} fill="#fff" fontWeight="bold">
            ✓
          </text>
        )}
        {/* Label */}
        {ganttOptions.showTaskName !== 'none' && (
          <text
            x={cx + s + 6}
            y={cy + 4}
            fontSize={13}
            fill="oklch(0.35 0.02 250)"
            fontWeight="500"
          >
            {task.task_name}
          </text>
        )}
        {/* Drag tooltip showing date */}
        {isDragging && dragPreview && (
          <text
            x={cx}
            y={cy - s - 6}
            textAnchor="middle"
            fontSize={11}
            fontWeight="600"
            fill="#1e40af"
          >
            {format(dragPreview.startDate, 'MM/dd')}
          </text>
        )}
        {/* Invisible move area for milestone drag */}
        <rect
          x={cx - s - 4}
          y={cy - s - 4}
          width={(s + 4) * 2}
          height={(s + 4) * 2}
          fill="transparent"
          onPointerDown={(e) => handleDragStart('move', e)}
        />
      </g>
    )
  }

  // Group task: bracket bar
  if (task.is_group) {
    const y = rect.y + rect.height - 6
    const h = 6
    const tickSize = 4

    return (
      <g
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={linkMode ? 'cursor-crosshair' : 'cursor-pointer'}
      >
        {/* Main bar */}
        <rect
          x={rect.x}
          y={y}
          width={rect.width}
          height={h}
          fill={barColor}
          rx={1}
          opacity={hovering ? 0.9 : 0.7}
        />
        {/* Left tick */}
        <rect x={rect.x} y={y} width={3} height={h + tickSize} fill={barColor} />
        {/* Right tick */}
        <rect
          x={rect.x + rect.width - 3}
          y={y}
          width={3}
          height={h + tickSize}
          fill={barColor}
        />
        {/* Progress overlay */}
        {task.actual_progress > 0 && (
          <rect
            x={rect.x}
            y={y}
            width={progressWidth}
            height={h}
            fill={getActualColor()}
            rx={1}
          />
        )}
        {/* Progress label */}
        {ganttOptions.showTaskName !== 'none' && (
          <text
            x={rect.x + rect.width + 4}
            y={y + h - 1}
            fontSize={13}
            fontWeight="600"
            fill="#374151"
          >
            {task.task_name}{ganttOptions.showProgress ? ` (${Math.round(task.actual_progress * 100)}%)` : ''}
          </text>
        )}
        {/* Link source highlight */}
        {isLinkSource && (
          <rect
            x={rect.x - 2}
            y={y - 2}
            width={rect.width + 4}
            height={h + tickSize + 4}
            fill="none"
            stroke="#f97316"
            strokeWidth={2.5}
            strokeDasharray="6 3"
          />
        )}
        {/* Selection border */}
        {isSelected && !isLinkSource && (
          <rect
            x={rect.x - 1}
            y={y - 1}
            width={rect.width + 2}
            height={h + tickSize + 2}
            fill="none"
            stroke="#000"
            strokeWidth={2}
          />
        )}
      </g>
    )
  }

  // Regular (leaf) task bar - barHeight option controls visual bar height within row
  const barH = ganttOptions.barHeight
  const barY = rect.y + (rect.height - barH) / 2

  // Use drag preview position/width during drag, otherwise use original rect
  const isDragging = dragging !== null
  const barX = dragPreview ? dragPreview.x : rect.x
  const barW = dragPreview ? dragPreview.width : rect.width
  const currentProgressWidth = barW * task.actual_progress

  return (
    <g
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
      className={linkMode ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-pointer'}
    >
      <defs>
        <linearGradient id={`grad-${task.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={barColor} stopOpacity={0.95} />
          <stop offset="100%" stopColor={barColor} stopOpacity={0.7} />
        </linearGradient>
      </defs>

      {/* Planned bar with gradient + shadow */}
      <rect
        x={barX}
        y={barY}
        width={barW}
        height={barH}
        fill={`url(#grad-${task.id})`}
        filter="url(#bar-shadow)"
        rx={5}
        opacity={isDragging ? 0.7 : hovering ? 1 : 0.9}
      />
      {/* Actual progress overlay */}
      {task.actual_progress > 0 && (
        <rect
          x={barX}
          y={barY}
          width={currentProgressWidth}
          height={barH}
          fill={getActualColor()}
          rx={5}
          opacity={0.85}
        />
      )}
      {/* Progress text (inside bar) */}
      {ganttOptions.showProgress && (
        <text
          x={barX + 6}
          y={barY + barH / 2 + 3.5}
          fontSize={13}
          fill="white"
          fontWeight="600"
          opacity={0.95}
        >
          {barW > 50 ? `${Math.round(task.actual_progress * 100)}%` : ''}
        </text>
      )}
      {/* Task name label - right */}
      {ganttOptions.showTaskName === 'right' && (
        <text
          x={barX + barW + 6}
          y={barY + barH / 2 + 3.5}
          fontSize={13}
          fill="oklch(0.35 0.02 250)"
          fontWeight="500"
        >
          {task.task_name}
          {detailLabel && <tspan fill="oklch(0.55 0.02 250)" fontSize={11}>{detailLabel}</tspan>}
        </text>
      )}
      {/* Task name label - inside */}
      {ganttOptions.showTaskName === 'inside' && (
        <text
          x={barX + (ganttOptions.showProgress && barW > 50 ? Math.min(barW * task.actual_progress, barW - 10) + 4 : 6)}
          y={barY + barH / 2 + 3.5}
          fontSize={11}
          fill="white"
          fontWeight="500"
          opacity={0.95}
          clipPath={`inset(0 0 0 0)`}
        >
          {barW > 40 ? `${task.task_name}${detailLabel}` : ''}
        </text>
      )}
      {/* Link source highlight ring */}
      {isLinkSource && (
        <rect
          x={barX - 3} y={barY - 3}
          width={barW + 6} height={barH + 6}
          fill="none" stroke="#f97316" strokeWidth={2.5} rx={8}
          strokeDasharray="6 3"
          opacity={0.9}
        />
      )}
      {/* Selection ring */}
      {isSelected && !isLinkSource && (
        <rect
          x={barX - 2} y={barY - 2}
          width={barW + 4} height={barH + 4}
          fill="none" stroke="oklch(0.50 0.17 255)" strokeWidth={2} rx={7}
          opacity={0.8}
        />
      )}

      {/* Date tooltip during drag */}
      {isDragging && dragPreview && (
        <text
          x={barX + barW / 2}
          y={barY - 6}
          textAnchor="middle"
          fontSize={11}
          fontWeight="600"
          fill="#1e40af"
        >
          {format(dragPreview.startDate, 'MM/dd')} ~ {format(dragPreview.endDate, 'MM/dd')}
        </text>
      )}

      {/* Resize handles - always rendered, visible on hover */}
      {!task.is_milestone && (
        <>
          {/* Left resize handle */}
          <rect x={barX - 2} y={barY - 2} width={10} height={barH + 4}
            fill={hovering || isDragging ? 'white' : 'transparent'} opacity={hovering || isDragging ? 0.7 : 0} rx={2}
            className="cursor-ew-resize"
            style={{ pointerEvents: 'all' }}
            onPointerDown={(e) => handleDragStart('left', e)} />
          {/* Right resize handle */}
          <rect x={barX + barW - 8} y={barY - 2} width={10} height={barH + 4}
            fill={hovering || isDragging ? 'white' : 'transparent'} opacity={hovering || isDragging ? 0.7 : 0} rx={2}
            className="cursor-ew-resize"
            style={{ pointerEvents: 'all' }}
            onPointerDown={(e) => handleDragStart('right', e)} />
        </>
      )}
      {/* Move area (between handles) */}
      <rect
        x={barX + 8} y={barY} width={Math.max(0, barW - 16)} height={barH}
        fill="transparent"
        className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
        onPointerDown={(e) => handleDragStart('move', e)}
      />
    </g>
  )
}
