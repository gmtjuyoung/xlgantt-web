import { useEffect, useCallback } from 'react'
import { useTaskStore } from '@/stores/task-store'
import { useUndoStore } from '@/stores/undo-store'

/**
 * Undo/Redo 기능을 수행하는 액션 훅.
 * 글로벌 Ctrl+Z / Ctrl+Y 키보드 단축키도 등록한다.
 */
export function useUndoRedo() {
  const canUndo = useUndoStore((s) => s.canUndo)
  const canRedo = useUndoStore((s) => s.canRedo)

  const performUndo = useCallback(() => {
    const { tasks, dependencies } = useTaskStore.getState()
    const snapshot = useUndoStore.getState().undo({ tasks, dependencies })
    if (snapshot) {
      // _skipSnapshot 플래그로 undo/redo 복원 시 스냅샷 중복 저장 방지
      useTaskStore.getState()._restoreFromSnapshot(snapshot.tasks, snapshot.dependencies)
    }
  }, [])

  const performRedo = useCallback(() => {
    const { tasks, dependencies } = useTaskStore.getState()
    const snapshot = useUndoStore.getState().redo({ tasks, dependencies })
    if (snapshot) {
      useTaskStore.getState()._restoreFromSnapshot(snapshot.tasks, snapshot.dependencies)
    }
  }, [])

  // 글로벌 키보드 단축키 등록
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // input, textarea, contentEditable 포커스 시 무시
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      const isCtrl = e.ctrlKey || e.metaKey

      // Ctrl+Z → Undo
      if (isCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        performUndo()
        return
      }

      // Ctrl+Y 또는 Ctrl+Shift+Z → Redo
      if (isCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z' && e.shiftKey))) {
        e.preventDefault()
        performRedo()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [performUndo, performRedo])

  return { canUndo, canRedo, undo: performUndo, redo: performRedo }
}
