import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'

function getPasswordStrength(pw: string): { label: string; color: string; width: string } {
  if (pw.length === 0) return { label: '', color: '', width: '0%' }
  if (pw.length < 6) return { label: '너무 짧음', color: 'bg-red-500', width: '25%' }
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { label: '약함', color: 'bg-orange-500', width: '50%' }
  if (score <= 2) return { label: '보통', color: 'bg-yellow-500', width: '75%' }
  return { label: '강함', color: 'bg-green-500', width: '100%' }
}

export function SignupPage() {
  const navigate = useNavigate()
  const signup = useAuthStore((s) => s.signup)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const strength = getPasswordStrength(password)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다')
      return
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다')
      return
    }
    setLoading(true)
    try {
      const result = await signup(email, name, password)
      if (result.success) {
        alert('회원가입이 완료되었습니다.\n관리자 승인 후 로그인할 수 있습니다.')
        navigate('/login')
      } else {
        setError(result.error || '회원가입에 실패했습니다')
      }
    } catch {
      setError('회원가입 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-container">
        <div className="auth-brand">
          <img src="/logo.png" alt="GMT 로고" className="w-14 h-14 rounded-2xl bg-white border border-slate-200 p-2 mx-auto mb-4 shadow-sm" />
          <h1 className="text-2xl font-bold">GMTgantts</h1>
          <p className="text-sm text-muted-foreground mt-1">새 계정 만들기</p>
        </div>

        <div className="auth-panel">
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="std-form-label">이름</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" className="h-10" autoFocus disabled={loading} />
            </div>
            <div>
              <label className="std-form-label">이메일</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="h-10" disabled={loading} />
            </div>
            <div>
              <label className="std-form-label">비밀번호</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6자 이상"
                  className="h-10 pr-10"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password && (
                <div className="mt-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${strength.color} rounded-full transition-all`} style={{ width: strength.width }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground">{strength.label}</span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="std-form-label">비밀번호 확인</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="비밀번호 재입력"
                className="h-10"
                disabled={loading}
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1">비밀번호가 일치하지 않습니다</p>
              )}
            </div>

            {error && (
              <p className="std-feedback-error">{error}</p>
            )}

            <Button type="submit" className="w-full h-10" disabled={!name || !email || !password || password !== confirmPassword || loading}>
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />가입 중...</>
              ) : (
                '회원가입'
              )}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            이미 계정이 있으신가요?{' '}
            <Link to="/login" className="text-primary font-medium hover:underline">
              로그인
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
