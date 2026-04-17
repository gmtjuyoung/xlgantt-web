import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ProjectWorkspace } from '@/components/layout/ProjectWorkspace'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { ProjectDashboard } from '@/pages/ProjectDashboard'
import { AdminPage } from '@/pages/AdminPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { ForcePasswordChangePage } from '@/pages/ForcePasswordChangePage'
import { useAuthStore } from '@/stores/auth-store'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PasswordFreshGuard({ children }: { children: React.ReactNode }) {
  const currentUser = useAuthStore((s) => s.currentUser)
  if (currentUser?.force_password_change) {
    return <Navigate to="/force-password-change" replace />
  }
  return <>{children}</>
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const currentUser = useAuthStore((s) => s.currentUser)
  if (!currentUser || currentUser.role !== 'admin') return <Navigate to="/projects" replace />
  return <>{children}</>
}

function App() {
  const initSession = useAuthStore((s) => s.initSession)

  useEffect(() => {
    initSession()
  }, [initSession])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/force-password-change" element={<AuthGuard><ForcePasswordChangePage /></AuthGuard>} />
      <Route path="/projects" element={<AuthGuard><PasswordFreshGuard><ProjectDashboard /></PasswordFreshGuard></AuthGuard>} />
      <Route path="/projects/:projectId" element={<AuthGuard><PasswordFreshGuard><ProjectWorkspace /></PasswordFreshGuard></AuthGuard>} />
      <Route path="/admin" element={<AuthGuard><PasswordFreshGuard><AdminGuard><AdminPage /></AdminGuard></PasswordFreshGuard></AuthGuard>} />
      <Route path="/profile" element={<AuthGuard><PasswordFreshGuard><ProfilePage /></PasswordFreshGuard></AuthGuard>} />
      <Route path="/" element={<Navigate to="/projects" replace />} />
    </Routes>
  )
}

export default App
