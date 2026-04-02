import { useRef, useCallback, useMemo, useEffect, useState } from 'react'
import { TaskTable } from './TaskTable'
import { GanttChart } from './GanttChart'
import { GanttToolbar } from './GanttToolbar'
import { TaskEditDialog } from './TaskEditDialog'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { useUIStore } from '@/stores/ui-store'
import { getVisibleTasks } from '@/lib/wbs'
import { createGanttScale, dateToX } from '@/lib/gantt-math'
import { useKeyboard } from '@/hooks/use-keyboard'

export function GanttView() {
  // 글로벌 키보드 단축키 등록
  useKeyboard()
  const tasks = useTaskStore((s) => s.tasks)
  const dependencies = useTaskStore((s) => s.dependencies)
  const project = useProjectStore((s) => s.currentProject)
  const theme = useProjectStore((s) => s.theme)
  const { zoomLevel, tableWidth, setTableWidth, tableCollapsed, setTableCollapsed, searchQuery, filterStatus } = useUIStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const chartScrollRef = useRef<HTMLDivElement>(null)
  const isResizing = useRef(false)
  const savedTableWidth = useRef(tableWidth)

  // Task edit dialog state
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const visibleTasks = useMemo(() => {
    const collapsed = getVisibleTasks(tasks)

    // No filter active — return as-is
    if (!searchQuery && filterStatus === 'all') return collapsed

    const query = searchQuery.toLowerCase()
    const today = project?.status_date ? new Date(project.status_date) : new Date()
    today.setHours(0, 0, 0, 0)

    // Determine which tasks match the filter criteria
    const matchingIds = new Set<string>()

    for (const task of collapsed) {
      let matchesSearch = true
      let matchesFilter = true

      // Search filter: case-insensitive task_name match
      if (searchQuery) {
        matchesSearch = task.task_name.toLowerCase().includes(query)
      }

      // Status filter
      if (filterStatus !== 'all') {
        switch (filterStatus) {
          case 'delayed': {
            const plannedEnd = task.planned_end ? new Date(task.planned_end) : null
            matchesFilter = !!plannedEnd && plannedEnd < today && task.actual_progress < 1
            break
          }
          case 'completed':
            matchesFilter = task.actual_progress >= 1
            break
          case 'in_progress':
            matchesFilter = task.actual_progress > 0 && task.actual_progress < 1
            break
        }
      }

      if (matchesSearch && matchesFilter) {
        matchingIds.add(task.id)
      }
    }

    // Collect ancestor IDs so parent groups remain visible
    const visibleIds = new Set<string>(matchingIds)
    for (const id of matchingIds) {
      let current = collapsed.find((t) => t.id === id)
      while (current?.parent_id) {
        visibleIds.add(current.parent_id)
        current = collapsed.find((t) => t.id === current!.parent_id)
      }
    }

    return collapsed.filter((t) => visibleIds.has(t.id))
  }, [tasks, searchQuery, filterStatus])

  const scale = useMemo(() => {
    if (!project) return null
    return createGanttScale(
      new Date(project.start_date),
      new Date(project.end_date),
      zoomLevel
    )
  }, [project, zoomLevel])

  // Auto-scroll to project start date on mount
  useEffect(() => {
    if (scale && chartScrollRef.current && project) {
      const startX = dateToX(new Date(project.start_date), scale)
      chartScrollRef.current.scrollLeft = Math.max(0, startX - 50)
    }
  }, [scale, project])

  // Sync vertical scroll between table and chart
  const handleTableScroll = useCallback(() => {
    if (tableScrollRef.current && chartScrollRef.current) {
      chartScrollRef.current.scrollTop = tableScrollRef.current.scrollTop
    }
  }, [])

  const handleChartScroll = useCallback(() => {
    if (chartScrollRef.current && tableScrollRef.current) {
      tableScrollRef.current.scrollTop = chartScrollRef.current.scrollTop
    }
  }, [])

  // Open task edit dialog
  const handleOpenTaskDialog = useCallback((taskId: string) => {
    setEditTaskId(taskId)
    setDialogOpen(true)
  }, [])

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setEditTaskId(null)
  }, [])

  // Toggle table collapse/expand
  const handleToggleTable = useCallback(() => {
    if (tableCollapsed) {
      // Expand: restore saved width
      setTableWidth(savedTableWidth.current)
      setTableCollapsed(false)
    } else {
      // Collapse: save current width and set to 0
      savedTableWidth.current = tableWidth
      setTableWidth(0)
      setTableCollapsed(true)
    }
  }, [tableCollapsed, tableWidth, setTableWidth, setTableCollapsed])

  // Resize handle for split pane
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      isResizing.current = true

      const startX = e.clientX
      const startWidth = tableWidth

      const handleMove = (moveEvent: PointerEvent) => {
        if (!isResizing.current) return
        const delta = moveEvent.clientX - startX
        const newWidth = Math.max(400, Math.min(1200, startWidth + delta))
        setTableWidth(newWidth)
      }

      const handleUp = () => {
        isResizing.current = false
        document.removeEventListener('pointermove', handleMove)
        document.removeEventListener('pointerup', handleUp)
      }

      document.addEventListener('pointermove', handleMove)
      document.addEventListener('pointerup', handleUp)
    },
    [tableWidth, setTableWidth]
  )

  if (!project || !scale) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        프로젝트를 선택하거나 생성해주세요.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <GanttToolbar onOpenTaskDialog={handleOpenTaskDialog} onScrollToToday={() => {
        if (scale && chartScrollRef.current) {
          const todayX = dateToX(new Date(), scale)
          chartScrollRef.current.scrollLeft = Math.max(0, todayX - chartScrollRef.current.clientWidth / 2)
        }
      }} />

      {/* Main split pane */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Task Table (Left Pane) */}
        {!tableCollapsed && (
          <div
            style={{ width: tableWidth, minWidth: 300 }}
            className="flex-shrink-0 shadow-[1px_0_4px_rgba(0,0,0,0.06)]"
          >
            <TaskTable
              tasks={visibleTasks}
              scrollRef={tableScrollRef}
              onScroll={handleTableScroll}
              onDoubleClickTask={handleOpenTaskDialog}
            />
          </div>
        )}

        {/* Resize Handle with Toggle Button */}
        <div
          className="relative w-[6px] bg-transparent hover:bg-primary/20 cursor-col-resize flex-shrink-0 transition-all duration-150 group"
          onPointerDown={!tableCollapsed ? handleResizeStart : undefined}
          style={{ cursor: tableCollapsed ? 'default' : 'col-resize' }}
        >
          {/* Toggle Button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleToggleTable()
            }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 z-50
              w-5 h-10 flex items-center justify-center
              bg-background border border-border rounded-sm shadow-md
              hover:bg-accent hover:border-primary/50 hover:shadow-lg
              opacity-60 group-hover:opacity-100 hover:!opacity-100
              transition-all duration-200 cursor-pointer"
            title={tableCollapsed ? '테이블 펼치기' : '테이블 접기'}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <svg
              width="10"
              height="14"
              viewBox="0 0 10 14"
              fill="none"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {tableCollapsed ? (
                <path d="M2 1L8 7L2 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M8 1L2 7L8 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        </div>

        {/* Gantt Chart (Right Pane) */}
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          <GanttChart
            tasks={visibleTasks}
            dependencies={dependencies}
            scale={scale}
            theme={theme}
            scrollRef={chartScrollRef}
            onScroll={handleChartScroll}
            onDoubleClickTask={handleOpenTaskDialog}
            onOpenTaskDialog={handleOpenTaskDialog}
          />
        </div>
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
