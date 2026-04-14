import { ClipboardList, BarChart3, Bell } from 'lucide-react'
import { useUIStore, type MobileTab } from '@/stores/ui-store'
import { cn } from '@/lib/utils'

const TABS: { key: MobileTab; label: string; icon: React.ElementType }[] = [
  { key: 'mytasks', label: '내 업무', icon: ClipboardList },
  { key: 'progress', label: '진척률', icon: BarChart3 },
  { key: 'activity', label: '알림', icon: Bell },
]

export function MobileBottomNav() {
  const activeTab = useUIStore((s) => s.mobileActiveTab)
  const setTab = useUIStore((s) => s.setMobileActiveTab)

  return (
    <nav className="flex items-end border-t border-border/40 bg-background flex-shrink-0 pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = activeTab === key
        return (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors active:bg-accent/30',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.5]')} />
            <span className="text-[10px] font-medium leading-none">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
