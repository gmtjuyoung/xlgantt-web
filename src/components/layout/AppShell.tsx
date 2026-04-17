import type { ReactNode } from 'react'
import { Header } from './Header'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell-root">
      <Header />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
