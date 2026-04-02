import { useState, useRef, useCallback, useEffect } from 'react'
import { useTaskStore } from '@/stores/task-store'

interface TaskCellProps {
  taskId: string
  field: string
  value: unknown
  onChange: (value: unknown) => void
  type: 'text' | 'date' | 'number'
}

export function TaskCell({ taskId, field, value, onChange, type }: TaskCellProps) {
  const { editingCell, startEditing, stopEditing } = useTaskStore()
  const isEditing =
    editingCell?.taskId === taskId && editingCell?.field === field
  const inputRef = useRef<HTMLInputElement>(null)
  const [localValue, setLocalValue] = useState(String(value ?? ''))

  useEffect(() => {
    setLocalValue(String(value ?? ''))
  }, [value])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = useCallback(() => {
    startEditing(taskId, field)
  }, [taskId, field, startEditing])

  const handleBlur = useCallback(() => {
    if (type === 'number') {
      const num = parseFloat(localValue)
      onChange(isNaN(num) ? undefined : num)
    } else {
      onChange(localValue || undefined)
    }
    stopEditing()
  }, [localValue, type, onChange, stopEditing])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleBlur()
      } else if (e.key === 'Escape') {
        setLocalValue(String(value ?? ''))
        stopEditing()
      }
    },
    [handleBlur, value, stopEditing]
  )

  const displayValue = (() => {
    if (value === null || value === undefined || value === '') return ''
    if (type === 'number') {
      const num = Number(value)
      return isNaN(num) ? '' : num.toLocaleString()
    }
    return String(value)
  })()

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className={`w-full h-full px-2 text-xs bg-background border border-primary outline-none ${field === 'task_name' ? 'text-left' : 'text-center'}`}
        type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        step={type === 'number' ? '0.01' : undefined}
      />
    )
  }

  return (
    <div
      className={`w-full px-2 truncate select-none ${field === 'task_name' ? 'text-left' : 'text-center'}`}
      onDoubleClick={handleDoubleClick}
      title={displayValue}
    >
      {displayValue}
    </div>
  )
}
