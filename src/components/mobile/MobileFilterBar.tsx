import { cn } from '@/lib/utils'

interface FilterOption {
  key: string
  label: string
}

interface MobileFilterBarProps {
  options: FilterOption[]
  activeKey: string
  onChange: (key: string) => void
}

export function MobileFilterBar({ options, activeKey, onChange }: MobileFilterBarProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto px-4 py-2 no-scrollbar">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0',
            activeKey === opt.key
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted/60 text-muted-foreground active:bg-muted'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
