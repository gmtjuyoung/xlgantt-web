import { useState, useCallback, useRef, useEffect } from 'react'
import type { Task } from '@/lib/types'
import { ROW_HEIGHT } from '@/lib/types'
import { useTaskStore } from '@/stores/task-store'

export interface DragState {
  /** ID of the task being dragged */
  dragTaskId: string | null
  /** Visual index where the drop indicator should appear */
  dropIndex: number | null
}

const SCROLL_ZONE = 60 // pixels from edge to trigger auto-scroll
const SCROLL_SPEED = 8

export function useDragReorder(visibleTasks: Task[]) {
  const [dragState, setDragState] = useState<DragState>({
    dragTaskId: null,
    dropIndex: null,
  })
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollAnimRef = useRef<number | null>(null)
  const reorderTask = useTaskStore((s) => s.reorderTask)
  const tasks = useTaskStore((s) => s.tasks)

  // Auto-scroll during drag
  const startAutoScroll = useCallback((clientY: number) => {
    const container = scrollContainerRef.current
    if (!container) return

    if (scrollAnimRef.current) {
      cancelAnimationFrame(scrollAnimRef.current)
      scrollAnimRef.current = null
    }

    const rect = container.getBoundingClientRect()
    const topZone = rect.top + SCROLL_ZONE
    const bottomZone = rect.bottom - SCROLL_ZONE

    let scrollDir = 0
    if (clientY < topZone) scrollDir = -1
    if (clientY > bottomZone) scrollDir = 1

    if (scrollDir !== 0) {
      const scroll = () => {
        container.scrollTop += scrollDir * SCROLL_SPEED
        scrollAnimRef.current = requestAnimationFrame(scroll)
      }
      scrollAnimRef.current = requestAnimationFrame(scroll)
    }
  }, [])

  const stopAutoScroll = useCallback(() => {
    if (scrollAnimRef.current) {
      cancelAnimationFrame(scrollAnimRef.current)
      scrollAnimRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAutoScroll()
  }, [stopAutoScroll])

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', taskId)

    // Set a semi-transparent drag image
    const target = e.currentTarget as HTMLElement
    const dragImage = target.cloneNode(true) as HTMLElement
    dragImage.style.opacity = '0.6'
    dragImage.style.position = 'absolute'
    dragImage.style.top = '-9999px'
    document.body.appendChild(dragImage)
    e.dataTransfer.setDragImage(dragImage, 0, 0)
    setTimeout(() => document.body.removeChild(dragImage), 0)

    setDragState({ dragTaskId: taskId, dropIndex: null })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    const container = scrollContainerRef.current
    if (!container) return

    startAutoScroll(e.clientY)

    // Calculate drop index based on mouse Y position
    const containerRect = container.getBoundingClientRect()
    const scrollTop = container.scrollTop
    const relativeY = e.clientY - containerRect.top + scrollTop
    let index = Math.round(relativeY / ROW_HEIGHT)
    index = Math.max(0, Math.min(index, visibleTasks.length))

    setDragState((prev) => ({
      ...prev,
      dropIndex: index,
    }))
  }, [visibleTasks.length, startAutoScroll])

  const handleDragEnd = useCallback(() => {
    stopAutoScroll()
    setDragState({ dragTaskId: null, dropIndex: null })
  }, [stopAutoScroll])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    stopAutoScroll()

    const taskId = e.dataTransfer.getData('text/plain')
    if (!taskId || dragState.dropIndex === null) {
      setDragState({ dragTaskId: null, dropIndex: null })
      return
    }

    const draggedTask = visibleTasks.find((t) => t.id === taskId)
    if (!draggedTask) {
      setDragState({ dragTaskId: null, dropIndex: null })
      return
    }

    // Find the dragged task's current index in visibleTasks
    const currentVisibleIndex = visibleTasks.findIndex((t) => t.id === taskId)

    // Count how many visible slots the dragged group occupies
    let dragGroupVisibleCount = 1
    if (draggedTask.is_group) {
      const allTasks = tasks
      for (let i = currentVisibleIndex + 1; i < visibleTasks.length; i++) {
        const t = visibleTasks[i]
        if (t.wbs_code.startsWith(draggedTask.wbs_code + '.')) {
          dragGroupVisibleCount++
        } else {
          break
        }
      }
    }

    // Skip if dropping in the same position
    if (dragState.dropIndex >= currentVisibleIndex && dragState.dropIndex <= currentVisibleIndex + dragGroupVisibleCount) {
      setDragState({ dragTaskId: null, dropIndex: null })
      return
    }

    // Convert visible dropIndex to sorted-tasks index
    // The dropIndex is where, in the visible list, we want to insert
    let dropIdx = dragState.dropIndex

    // Adjust for the fact that removing the dragged items shifts indices
    if (dropIdx > currentVisibleIndex) {
      dropIdx -= dragGroupVisibleCount
    }

    // Map the visible-tasks dropIdx to the full sorted-tasks index
    const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)

    // The dragged task and its descendants
    const movingIds = new Set<string>([taskId])
    if (draggedTask.is_group) {
      for (const t of sorted) {
        if (t.id !== taskId && t.wbs_code.startsWith(draggedTask.wbs_code + '.')) {
          movingIds.add(t.id)
        }
      }
    }

    const remaining = sorted.filter((t) => !movingIds.has(t.id))

    // Find the full-list target index
    let targetIdx: number
    if (dropIdx <= 0) {
      targetIdx = 0
    } else if (dropIdx >= visibleTasks.length - dragGroupVisibleCount) {
      targetIdx = remaining.length
    } else {
      // The visible task at dropIdx (after removing dragged items) tells us where to insert
      const visibleWithoutDragged = visibleTasks.filter((t) => !movingIds.has(t.id))
      const targetTask = visibleWithoutDragged[dropIdx]
      if (targetTask) {
        targetIdx = remaining.findIndex((t) => t.id === targetTask.id)
        if (targetIdx === -1) targetIdx = remaining.length
      } else {
        targetIdx = remaining.length
      }
    }

    reorderTask(taskId, targetIdx)
    setDragState({ dragTaskId: null, dropIndex: null })
  }, [dragState.dropIndex, visibleTasks, tasks, reorderTask, stopAutoScroll])

  return {
    dragState,
    scrollContainerRef,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDrop,
  }
}
