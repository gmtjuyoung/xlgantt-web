import { type RefObject, useMemo, useEffect, useState, useCallback } from 'react'
import type { Task, Dependency, GanttScale, ColorTheme } from '@/lib/types'
import { ROW_HEIGHT } from '@/lib/types'
import { generateTimescale, getTodayX, generateNonWorkingBands, taskToBarRect, calcProgressLinePoints, getStatusDateX } from '@/lib/gantt-math'
import { calculateDependencyPath, ARROW_MARKER_ID } from '@/lib/dependency-routing'
import { useUIStore } from '@/stores/ui-store'
import { useProjectStore } from '@/stores/project-store'
import { useCalendarStore } from '@/stores/calendar-store'
import { useTaskStore } from '@/stores/task-store'
import { GanttBar } from './GanttBar'
// GanttTimescale is now rendered inline inside the scroll container
import { GanttContextMenu, type ContextMenuState } from './GanttContextMenu'

interface GanttChartProps {
  tasks: Task[]
  dependencies: Dependency[]
  scale: GanttScale
  theme: ColorTheme
  scrollRef: RefObject<HTMLDivElement | null>
  onScroll: () => void
  onDoubleClickTask?: (taskId: string) => void
  onOpenTaskDialog?: (taskId: string) => void
}

export function GanttChart({
  tasks,
  dependencies,
  scale,
  theme,
  scrollRef,
  onScroll,
  onDoubleClickTask,
  onOpenTaskDialog,
}: GanttChartProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const zoomLevel = useUIStore((s) => s.zoomLevel)
  const linkMode = useUIStore((s) => s.linkMode)
  const cancelLinkMode = useUIStore((s) => s.cancelLinkMode)
  const showProgressLine = useUIStore((s) => s.showProgressLine)
  const ganttOptions = useUIStore((s) => s.ganttOptions)
  const project = useProjectStore((s) => s.currentProject)

  // ESC key to cancel link mode
  useEffect(() => {
    if (!linkMode) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelLinkMode()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [linkMode, cancelLinkMode])

  const handleBarContextMenu = useCallback((taskId: string, x: number, y: number) => {
    setContextMenu({ taskId, x, y })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleOpenEdit = useCallback((taskId: string) => {
    const handler = onOpenTaskDialog || onDoubleClickTask
    handler?.(taskId)
  }, [onOpenTaskDialog, onDoubleClickTask])

  const [topRow, bottomRow] = useMemo(
    () => generateTimescale(scale, zoomLevel),
    [scale, zoomLevel]
  )

  const todayX = useMemo(() => getTodayX(scale), [scale])

  const stdHolidays = useCalendarStore((s) => s.holidays.STD)
  const stdHolidaySet = useMemo(
    () => new Set(stdHolidays.map((h) => h.date)),
    [stdHolidays]
  )
  const nonWorkingBands = useMemo(
    () => generateNonWorkingBands(scale, stdHolidaySet),
    [scale, stdHolidaySet]
  )

  const totalHeight = tasks.length * ROW_HEIGHT
  const { totalWidth } = scale

  // Pre-compute bar rects for dependency arrow routing
  const barRects = useMemo(() => {
    const map = new Map<string, ReturnType<typeof taskToBarRect>>()
    tasks.forEach((task, index) => {
      const rect = taskToBarRect(task, scale, index, ROW_HEIGHT)
      if (rect) map.set(task.id, rect)
    })
    return map
  }, [tasks, scale])

  // Progress Line data
  const statusDateX = useMemo(
    () => getStatusDateX(project?.status_date, scale),
    [project?.status_date, scale]
  )

  const progressLinePoints = useMemo(() => {
    if (!showProgressLine) return []
    const statusDate = project?.status_date ? new Date(project.status_date) : new Date()
    return calcProgressLinePoints(tasks, scale, statusDate, ROW_HEIGHT)
  }, [showProgressLine, tasks, scale, project?.status_date])

  const progressLineColor = theme.colors[13] || '#ff6b35'

  const progressLinePathD = useMemo(() => {
    if (progressLinePoints.length === 0) return ''
    return progressLinePoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ')
  }, [progressLinePoints])

  return (
    <div className="flex flex-col h-full">
      {/* Chart Area with integrated header */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-x-scroll overflow-y-auto${linkMode ? ' cursor-crosshair' : ''}`}
        onScroll={onScroll}
      >
        {/* Timescale Header - sticky inside scroll container */}
        <div className="sticky top-0 z-10 bg-card border-b border-border/40" style={{ width: totalWidth }}>
          <svg width={totalWidth} height={48}>
            {/* Top row */}
            {/* Top row - month/year labels with subtle dividers */}
            <g>
              {topRow.items.map((item, i) => (
                <g key={`top-${i}`}>
                  <rect x={item.x} y={0} width={item.width} height={topRow.height} fill="none" />
                  {/* Subtle left border */}
                  <line x1={item.x} y1={2} x2={item.x} y2={topRow.height - 2} stroke="oklch(0.85 0.01 250)" strokeWidth={1} />
                  <text x={item.x + item.width / 2} y={topRow.height / 2 + 4} textAnchor="middle" fontSize={13} fontWeight="700" fill="oklch(0.35 0.02 250)" letterSpacing="0.5">{item.label}</text>
                </g>
              ))}
              {/* Bottom line separating top/bottom rows */}
              <line x1={0} y1={topRow.height} x2={totalWidth} y2={topRow.height} stroke="oklch(0.90 0.008 250)" strokeWidth={0.5} />
            </g>
            {/* Bottom row - week/day cells with uniform grid */}
            <g transform={`translate(0, ${topRow.height})`}>
              {bottomRow.items.map((item, i) => (
                <g key={`bot-${i}`}>
                  <rect x={item.x} y={0} width={item.width} height={bottomRow.height} fill={item.isWeekend ? 'oklch(0.97 0.008 250)' : 'none'} stroke="oklch(0.93 0.005 250)" strokeWidth={0.3} />
                  <text x={item.x + item.width / 2} y={bottomRow.height / 2 + 3} textAnchor="middle" fontSize={11} fontWeight="500" fill={item.isWeekend ? 'oklch(0.7 0.02 250)' : 'oklch(0.5 0.015 250)'}>{item.label}</text>
                </g>
              ))}
            </g>
          </svg>
        </div>
        <svg
          width={totalWidth}
          height={totalHeight}
          className="select-none"
          onContextMenu={(e) => {
            // Prevent default browser context menu on the chart area
            // Individual bars will handle their own context menu events
            e.preventDefault()
          }}
        >
          <defs>
            <marker
              id={ARROW_MARKER_ID}
              viewBox="0 0 10 7"
              refX="10"
              refY="3.5"
              markerWidth="8"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <polygon
                points="0 0, 10 3.5, 0 7"
                fill={theme.colors[11]}
              />
            </marker>
          </defs>

          {/* Shared filters */}
          <filter id="bar-shadow">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.12" />
          </filter>

          {/* Non-working day bands */}
          {ganttOptions.showNonWorkingDays && nonWorkingBands.map((band, i) => (
            <rect
              key={`nw-${i}`}
              x={band.x}
              y={0}
              width={band.width}
              height={totalHeight}
              fill="oklch(0.965 0.006 250)"
              opacity={0.7}
            />
          ))}

          {/* Row grid lines */}
          {tasks.map((_, index) => (
            <line
              key={`grid-${index}`}
              x1={0}
              y1={index * ROW_HEIGHT}
              x2={totalWidth}
              y2={index * ROW_HEIGHT}
              stroke="oklch(0.93 0.005 250)"
              strokeWidth={0.3}
            />
          ))}

          {/* Today line */}
          {ganttOptions.showTodayLine && (
            <>
              {/* Today line glow */}
              <line
                x1={todayX} y1={0} x2={todayX} y2={totalHeight}
                stroke="#ef4444" strokeWidth={4} opacity={0.08}
              />
              {/* Today line */}
              <line
                x1={todayX} y1={0} x2={todayX} y2={totalHeight}
                stroke="#ef4444" strokeWidth={1.5}
              />
              {/* Today badge */}
              <rect x={todayX - 1} y={2} width={42} height={20} rx={4} fill="#ef4444" />
              <text x={todayX + 20} y={16} textAnchor="middle" fontSize={12} fill="white" fontWeight="600">
                Today
              </text>
            </>
          )}

          {/* Dependency arrows */}
          {ganttOptions.showDependencies && dependencies.map((dep) => {
            const predRect = barRects.get(dep.predecessor_id)
            const succRect = barRects.get(dep.successor_id)
            if (!predRect || !succRect) return null

            const path = calculateDependencyPath(predRect, succRect, dep.dep_type)
            // 화살표 중간점 계산 (삭제 버튼 위치)
            const midX = (predRect.x + predRect.width + succRect.x) / 2
            const midY = (predRect.y + predRect.height / 2 + succRect.y + succRect.height / 2) / 2
            return (
              <g key={dep.id}>
                <path
                  d={path}
                  fill="none"
                  stroke={linkMode ? '#f97316' : theme.colors[11]}
                  strokeWidth={linkMode ? 2 : 1.5}
                  markerEnd={`url(#${ARROW_MARKER_ID})`}
                  opacity={linkMode ? 1 : 0.8}
                  className={linkMode ? 'cursor-pointer' : ''}
                />
                {/* 연결 모드: 투명한 넓은 히트 영역 + 삭제 버튼 */}
                {linkMode && (
                  <>
                    <path
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={12}
                      className="cursor-pointer"
                      onClick={() => useTaskStore.getState().removeDependency(dep.id)}
                    />
                    <g
                      className="cursor-pointer"
                      onClick={() => useTaskStore.getState().removeDependency(dep.id)}
                    >
                      <circle cx={midX} cy={midY} r={8} fill="white" stroke="#ef4444" strokeWidth={1.5} opacity={0.9} />
                      <line x1={midX - 3} y1={midY - 3} x2={midX + 3} y2={midY + 3} stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
                      <line x1={midX + 3} y1={midY - 3} x2={midX - 3} y2={midY + 3} stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
                    </g>
                  </>
                )}
              </g>
            )
          })}

          {/* Task bars */}
          {tasks.map((task, index) => (
            <GanttBar
              key={task.id}
              task={task}
              rowIndex={index}
              scale={scale}
              theme={theme}
              onDoubleClick={onDoubleClickTask}
              onContextMenu={handleBarContextMenu}
            />
          ))}

          {/* Progress Line (S-curve) */}
          {showProgressLine && (
            <g className="progress-line">
              {/* Status Date vertical reference line (dashed) */}
              <line
                x1={statusDateX} y1={0}
                x2={statusDateX} y2={totalHeight}
                stroke={progressLineColor}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                opacity={0.6}
              />
              {/* Status Date badge */}
              <rect
                x={statusDateX - 1} y={2}
                width={56} height={20} rx={4}
                fill={progressLineColor}
                opacity={0.85}
              />
              <text
                x={statusDateX + 27} y={16}
                textAnchor="middle"
                fontSize={10}
                fill="white"
                fontWeight="600"
              >
                Status
              </text>

              {/* Progress polyline */}
              {progressLinePathD && (
                <path
                  d={progressLinePathD}
                  fill="none"
                  stroke={progressLineColor}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={0.8}
                />
              )}

              {/* Dots at each inflection point */}
              {progressLinePoints.map((p, i) => (
                <circle
                  key={`pl-dot-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={3}
                  fill={progressLineColor}
                  stroke="white"
                  strokeWidth={1}
                  opacity={0.9}
                />
              ))}
            </g>
          )}
        </svg>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <GanttContextMenu
          menu={contextMenu}
          onClose={handleCloseContextMenu}
          onOpenEdit={handleOpenEdit}
        />
      )}
    </div>
  )
}
