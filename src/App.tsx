import { Routes, Route, Navigate } from 'react-router-dom'
import { ProjectWorkspace } from '@/components/layout/ProjectWorkspace'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { ProjectDashboard } from '@/pages/ProjectDashboard'
import { AdminPage } from '@/pages/AdminPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { useAuthStore } from '@/stores/auth-store'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const currentUser = useAuthStore((s) => s.currentUser)
  if (!currentUser || currentUser.role !== 'admin') return <Navigate to="/projects" replace />
  return <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/projects" element={<AuthGuard><ProjectDashboard /></AuthGuard>} />
      <Route path="/projects/:projectId" element={<AuthGuard><ProjectWorkspace /></AuthGuard>} />
      <Route path="/admin" element={<AuthGuard><AdminGuard><AdminPage /></AdminGuard></AuthGuard>} />
      <Route path="/profile" element={<AuthGuard><ProfilePage /></AuthGuard>} />
      <Route path="/" element={<Navigate to="/projects" replace />} />
    </Routes>
  )
}

export default App
