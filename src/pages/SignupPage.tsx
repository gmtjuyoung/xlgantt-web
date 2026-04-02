import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BarChart3, Eye, EyeOff } from 'lucide-react'
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

  const strength = getPasswordStrength(password)

  const handleSignup = (e: React.FormEvent) => {
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
    const result = signup(email, name, password)
    if (result.success) {
      navigate('/projects')
    } else {
      setError(result.error || '회원가입에 실패했습니다')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground mb-4">
            <BarChart3 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">GMTgantts</h1>
          <p className="text-sm text-muted-foreground mt-1">새 계정 만들기</p>
        </div>

        <div className="bg-card border rounded-xl shadow-sm p-6">
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">이름</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" className="h-10" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">이메일</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="h-10" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">비밀번호</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6자 이상"
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
              <label className="block text-sm font-medium mb-1.5">비밀번호 확인</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="비밀번호 재입력"
                className="h-10"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1">비밀번호가 일치하지 않습니다</p>
              )}
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-md">{error}</p>
            )}

            <Button type="submit" className="w-full h-10" disabled={!name || !email || !password || password !== confirmPassword}>
              회원가입
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
