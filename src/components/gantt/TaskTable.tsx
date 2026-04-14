import { type RefObject, useState, useCallback, useMemo, useEffect, useRef } from 'react'
import type { Task } from '@/lib/types'
import { TaskRow } from './TaskRow'
import { GanttContextMenu, type ContextMenuState } from './GanttContextMenu'
import { useUIStore } from '@/stores/ui-store'
import { getVisibleColumnDefs, getTotalColumnWidth, ALL_COLUMNS } from '@/lib/column-defs'
import { useDragReorder } from '@/hooks/use-drag-reorder'

interface TaskTableProps {
  tasks: Task[]
  scrollRef: RefObject<HTMLDivElement | null>
  onScroll: () => void
  onDoubleClickTask?: (taskId: string) => void
}

export function TaskTable({ tasks, scrollRef, onScroll, onDoubleClickTask }: TaskTableProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const visibleColumns = useUIStore((s) => s.visibleColumns)
  const columnWidths = useUIStore((s) => s.columnWidths)
  const setColumnWidth = useUIStore((s) => s.setColumnWidth)

  // 컬럼 리사이즈 상태
  const resizeRef = useRef<{ colId: string; startX: number; startW: number } | null>(null)

  const {
    dragState,
    scrollContainerRef,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDrop,
  } = useDragReorder(tasks)

  // Sync scroll refs: the drag hook needs the scroll container ref
  useEffect(() => {
    scrollContainerRef.current = scrollRef.current
  })

  // 표시할 컬럼 정의 목록 (커스텀 너비 적용)
  const columns = useMemo(() => getVisibleColumnDefs(visibleColumns, columnWidths), [visibleColumns, columnWidths])
  const totalWidth = useMemo(() => getTotalColumnWidth(visibleColumns, columnWidths), [visibleColumns, columnWidths])

  // 컬럼 드래그 리사이즈 핸들러
  const handleResizeStart = useCallback((e: React.MouseEvent, colId: string, currentWidth: number) => {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = { colId, startX: e.clientX, startW: currentWidth }

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const delta = ev.clientX - resizeRef.current.startX
      const newWidth = Math.max(30, resizeRef.current.startW + delta)
      setColumnWidth(resizeRef.current.colId, newWidth)
    }
    const onMouseUp = () => {
      resizeRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [setColumnWidth])

  // 더블클릭 시 컬럼 자동 확장 (기본 너비의 2배 또는 원래 너비로 토글)
  const handleHeaderDoubleClick = useCallback((colId: string) => {
    const defaultCol = ALL_COLUMNS.find((c) => c.id === colId)
    if (!defaultCol) return
    const currentWidth = columnWidths[colId] || defaultCol.width
    const expandedWidth = defaultCol.width * 2.5
    // 이미 확장됐으면 원래 너비로, 아니면 확장
    if (currentWidth > defaultCol.width * 1.5) {
      setColumnWidth(colId, defaultCol.width)
    } else {
      setColumnWidth(colId, expandedWidth)
    }
  }, [columnWidths, setColumnWidth])

  const handleRowContextMenu = useCallback((taskId: string, x: number, y: number) => {
    setContextMenu({ taskId, x, y })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleOpenEdit = useCallback((taskId: string) => {
    onDoubleClickTask?.(taskId)
  }, [onDoubleClickTask])

  return (
    <div className="flex flex-col h-full">
      {/* Column Headers - fixed height 48px to match GanttTimescale (24+24) */}
      <div
        className="flex border-b border-border/50 bg-gradient-to-b from-muted/60 to-muted/90 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-shrink-0 sticky top-0 z-10"
        style={{ height: 48, minWidth: totalWidth + 20 }}
      >
        {/* 드래그 핸들 공간 맞춤 */}
        <div className="flex-shrink-0 w-5" />
        {columns.map((col) => (
          <div
            key={col.id}
            style={{ width: col.width, minWidth: 30 }}
            className="relative px-2 flex items-center justify-center border-r border-border/30 truncate select-none"
            onDoubleClick={() => handleHeaderDoubleClick(col.id)}
          >
            {col.label}
            {/* 리사이즈 핸들 (오른쪽 가장자리) */}
            <div
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 z-20"
              onMouseDown={(e) => handleResizeStart(e, col.id, col.width)}
              onDoubleClick={(e) => e.stopPropagation()}
            />
          </div>
        ))}
      </div>

      {/* Task Rows */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-auto"
        onScroll={onScroll}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            툴바의 + 버튼으로 작업을 추가하세요
          </div>
        ) : (
          <>
            {tasks.map((task, index) => {
              const isDragging = dragState.dragTaskId === task.id
              const dropIndex = dragState.dropIndex
              // Show indicator on the row at dropIndex (above) or the row before (below)
              const isDropAbove = dropIndex !== null && dropIndex === index && dragState.dragTaskId !== null
              const isDropBelow = dropIndex !== null && dropIndex === index + 1 && index === tasks.length - 1 && dragState.dragTaskId !== null

              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  rowIndex={index}
                  columns={columns}
                  onDoubleClick={onDoubleClickTask}
                  onContextMenu={handleRowContextMenu}
                  isDragging={isDragging}
                  isDropTarget={isDropAbove || isDropBelow}
                  dropPosition={isDropAbove ? 'above' : isDropBelow ? 'below' : null}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              )
            })}
            {/* Bottom drop indicator when dropping after last row */}
            {dragState.dropIndex !== null && dragState.dropIndex >= tasks.length && dragState.dragTaskId !== null && (
              <div className="relative" style={{ height: 2 }}>
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-20">
                  <div className="absolute -left-0.5 -top-1 w-2 h-2 rounded-full bg-blue-500" />
                </div>
              </div>
            )}
          </>
        )}
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

// 하위 호환: 기존에 COLUMNS를 import하는 곳이 있을 수 있음
export { ALL_COLUMNS as COLUMNS } from '@/lib/column-defs'
