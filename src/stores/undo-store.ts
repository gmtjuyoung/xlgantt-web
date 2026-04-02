import { create } from 'zustand'
import type { Task, Dependency } from '@/lib/types'

const MAX_UNDO_STEPS = 50

interface Snapshot {
  tasks: Task[]
  dependencies: Dependency[]
}

interface UndoState {
  undoStack: Snapshot[]
  redoStack: Snapshot[]
  canUndo: boolean
  canRedo: boolean

  /** 현재 상태를 undo 스택에 저장 (변경 작업 전에 호출) */
  pushSnapshot: (snapshot: Snapshot) => void

  /** 이전 상태로 복원. 현재 상태를 반환하여 store에 적용할 수 있도록 함 */
  undo: (currentSnapshot: Snapshot) => Snapshot | null

  /** 다음 상태로 복원 (redo). 현재 상태를 반환 */
  redo: (currentSnapshot: Snapshot) => Snapshot | null

  /** 스택 초기화 (프로젝트 전환 시) */
  clear: () => void
}

export const useUndoStore = create<UndoState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,

  pushSnapshot: (snapshot) => {
    set((state) => {
      const newStack = [...state.undoStack, snapshot]
      // 최대 50단계 유지
      if (newStack.length > MAX_UNDO_STEPS) {
        newStack.shift()
      }
      return {
        undoStack: newStack,
        redoStack: [], // 새 변경 시 redo 스택 초기화
        canUndo: true,
        canRedo: false,
      }
    })
  },

  undo: (currentSnapshot) => {
    const { undoStack } = get()
    if (undoStack.length === 0) return null

    const previousSnapshot = undoStack[undoStack.length - 1]
    set((state) => {
      const newUndoStack = state.undoStack.slice(0, -1)
      return {
        undoStack: newUndoStack,
        redoStack: [...state.redoStack, currentSnapshot],
        canUndo: newUndoStack.length > 0,
        canRedo: true,
      }
    })
    return previousSnapshot
  },

  redo: (currentSnapshot) => {
    const { redoStack } = get()
    if (redoStack.length === 0) return null

    const nextSnapshot = redoStack[redoStack.length - 1]
    set((state) => {
      const newRedoStack = state.redoStack.slice(0, -1)
      return {
        undoStack: [...state.undoStack, currentSnapshot],
        redoStack: newRedoStack,
        canUndo: true,
        canRedo: newRedoStack.length > 0,
      }
    })
    return nextSnapshot
  },

  clear: () =>
    set({
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
    }),
}))
