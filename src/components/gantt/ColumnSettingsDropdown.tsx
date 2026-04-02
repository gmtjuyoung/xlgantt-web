import { useState, useRef, useEffect, useCallback } from 'react'
import { Columns3, RotateCcw, Check, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/stores/ui-store'
import { ALL_COLUMNS, REQUIRED_COLUMNS } from '@/lib/column-defs'
import { cn } from '@/lib/utils'

export function ColumnSettingsDropdown() {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { visibleColumns, toggleColumn, moveColumn, resetColumns } = useUIStore()

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setOpen(false)
    }
  }, [])

  useEffect(() => {
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, handleClickOutside])

  // 표시 중인 컬럼을 순서대로, 숨긴 컬럼은 뒤에
  const sortedColumns = [...ALL_COLUMNS].sort((a, b) => {
    const ai = visibleColumns.indexOf(a.id)
    const bi = visibleColumns.indexOf(b.id)
    if (ai >= 0 && bi >= 0) return ai - bi
    if (ai >= 0) return -1
    if (bi >= 0) return 1
    return 0
  })

  return (
    <div ref={dropdownRef} className="relative">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(!open)} title="컬럼 표시/숨기기">
        <Columns3 className="h-4 w-4" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-md border border-border bg-popover shadow-lg py-1">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
            <span className="text-xs font-semibold text-muted-foreground">컬럼 설정</span>
            <button onClick={() => resetColumns()} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground" title="기본값 복원">
              <RotateCcw className="h-3 w-3" />초기화
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto py-1">
            {sortedColumns.map((col) => {
              const isVisible = visibleColumns.includes(col.id)
              const isRequired = REQUIRED_COLUMNS.includes(col.id)
              const idx = visibleColumns.indexOf(col.id)
              const isFirst = idx === 0
              const isLast = idx === visibleColumns.length - 1

              return (
                <div
                  key={col.id}
                  className={cn(
                    'flex items-center w-full px-2 py-1 text-xs hover:bg-accent/50 transition-colors group',
                    !isVisible && 'opacity-50'
                  )}
                >
                  {/* 체크박스 */}
                  <button
                    className={cn('w-4 h-4 rounded border flex items-center justify-center mr-2 flex-shrink-0 transition-colors',
                      isVisible ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40',
                      isRequired && 'cursor-not-allowed'
                    )}
                    onClick={() => { if (!isRequired) toggleColumn(col.id) }}
                  >
                    {isVisible && <Check className="h-3 w-3" />}
                  </button>

                  {/* 라벨 */}
                  <span className="truncate flex-1">{col.label}</span>

                  {/* 필수 표시 */}
                  {isRequired && <span className="text-[9px] text-muted-foreground/60 mr-1">필수</span>}

                  {/* 순서 변경 버튼 (보이는 컬럼만) */}
                  {isVisible && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        className={cn("p-0.5 rounded hover:bg-accent", isFirst && "invisible")}
                        onClick={(e) => { e.stopPropagation(); moveColumn(col.id, 'up') }}
                        title="위로"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        className={cn("p-0.5 rounded hover:bg-accent", isLast && "invisible")}
                        onClick={(e) => { e.stopPropagation(); moveColumn(col.id, 'down') }}
                        title="아래로"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="border-t border-border/50 px-3 py-1.5">
            <span className="text-[10px] text-muted-foreground">
              {visibleColumns.length}/{ALL_COLUMNS.length}개 표시
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
