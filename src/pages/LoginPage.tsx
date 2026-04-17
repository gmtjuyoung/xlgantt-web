import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력하세요')
      return
    }
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.success) {
        navigate(result.redirectTo || '/projects')
      } else {
        setError(result.error || '로그인에 실패했습니다')
      }
    } catch {
      setError('로그인 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-container">
        <section className="auth-form-wrap">
          <div className="auth-brand">
            <img src="/logo.png" alt="GMT 로고" className="w-14 h-14 rounded-2xl bg-white border border-slate-200 p-2 mx-auto mb-4 shadow-sm" />
            <h1 className="text-2xl font-bold">GMTgantts</h1>
            <p className="text-sm text-muted-foreground mt-1">프로젝트 관리를 더 스마트하게</p>
          </div>

          <div className="auth-panel">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="std-form-label">이메일</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="h-10"
                  autoFocus
                  disabled={loading}
                />
              </div>
              <div>
                <label className="std-form-label">비밀번호</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호 입력"
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
              </div>

              {error && (
                <p className="std-feedback-error">{error}</p>
              )}

              <Button type="submit" className="w-full h-10" disabled={loading}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />로그인 중...</>
                ) : (
                  '로그인'
                )}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              계정이 없으신가요?{' '}
              <Link to="/signup" className="text-primary font-medium hover:underline">
                회원가입
              </Link>
            </div>
          </div>

        </section>
      </div>
    </div>
  )
}
