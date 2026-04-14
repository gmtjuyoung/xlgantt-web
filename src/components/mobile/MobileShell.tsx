import { MobileHeader } from './MobileHeader'
import { MobileBottomNav } from './MobileBottomNav'

interface MobileShellProps {
  children: React.ReactNode
}

export function MobileShell({ children }: MobileShellProps) {
  return (
    <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
      <MobileHeader />
      <main className="flex-1 overflow-y-auto overscroll-contain">
        {children}
      </main>
      <MobileBottomNav />
    </div>
  )
}
