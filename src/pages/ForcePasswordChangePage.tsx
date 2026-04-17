import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'

export function ForcePasswordChangePage() {
  const navigate = useNavigate()
  const { currentUser, completeForcedPasswordChange, logout } = useAuthStore()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!currentUser) return <Navigate to="/login" replace />
  if (!currentUser.force_password_change) return <Navigate to="/projects" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다')
      return
    }

    setSaving(true)
    try {
      const result = await completeForcedPasswordChange(newPassword)
      if (!result.success) {
        setError(result.error || '비밀번호 변경에 실패했습니다')
        return
      }
      navigate('/projects', { replace: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-container">
        <section className="auth-form-wrap">
          <div className="auth-brand">
            <img src="/logo.png" alt="GMT 로고" className="w-14 h-14 rounded-2xl bg-white border border-slate-200 p-2 mx-auto mb-4 shadow-sm" />
            <h1 className="text-2xl font-bold">비밀번호 변경 필요</h1>
            <p className="text-sm text-muted-foreground mt-1">{currentUser.email}</p>
          </div>

          <div className="auth-panel">
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  관리자에 의해 임시 비밀번호가 설정되었습니다.
                  계속 사용하려면 새 비밀번호를 먼저 설정해 주세요.
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="std-form-label">새 비밀번호</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="6자 이상"
                  className="h-10"
                  autoFocus
                  disabled={saving}
                />
              </div>
              <div>
                <label className="std-form-label">새 비밀번호 확인</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="새 비밀번호 재입력"
                  className="h-10"
                  disabled={saving}
                />
              </div>

              {error && <p className="std-feedback-error">{error}</p>}

              <Button type="submit" className="w-full h-10" disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />변경 중...</> : '새 비밀번호 저장'}
              </Button>

              <Button type="button" variant="outline" className="w-full h-10" disabled={saving} onClick={() => logout().then(() => navigate('/login', { replace: true }))}>
                나중에 하지 않고 로그아웃
              </Button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
