import { type RefObject, useState, useCallback, useMemo, useEffect } from 'react'
import type { Task } from '@/lib/types'
import { TaskRow } from './TaskRow'
import { GanttContextMenu, type ContextMenuState } from './GanttContextMenu'
import { useUIStore } from '@/stores/ui-store'
import { getVisibleColumnDefs, getTotalColumnWidth } from '@/lib/column-defs'
import { useDragReorder } from '@/hooks/use-drag-reorder'
import { cn } from '@/lib/utils'

interface TaskTableProps {
  tasks: Task[]
  scrollRef: RefObject<HTMLDivElement | null>
  onScroll: () => void
  onDoubleClickTask?: (taskId: string) => void
}

export function TaskTable({ tasks, scrollRef, onScroll, onDoubleClickTask }: TaskTableProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const visibleColumns = useUIStore((s) => s.visibleColumns)

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

  // 표시할 컬럼 정의 목록
  const columns = useMemo(() => getVisibleColumnDefs(visibleColumns), [visibleColumns])
  const totalWidth = useMemo(() => getTotalColumnWidth(visibleColumns), [visibleColumns])

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
            style={{ width: col.width, minWidth: col.width }}
            className="px-2 flex items-center justify-center border-r border-border/30 truncate"
          >
            {col.label}
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
