import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BarChart3, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력하세요')
      return
    }
    const result = login(email, password)
    if (result.success) {
      navigate('/projects')
    } else {
      setError(result.error || '로그인에 실패했습니다')
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
          <p className="text-sm text-muted-foreground mt-1">프로젝트 관리를 더 스마트하게</p>
        </div>

        <div className="bg-card border rounded-xl shadow-sm p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">이메일</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="h-10"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">비밀번호</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호 입력"
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
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-md">{error}</p>
            )}

            <Button type="submit" className="w-full h-10">
              로그인
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            계정이 없으신가요?{' '}
            <Link to="/signup" className="text-primary font-medium hover:underline">
              회원가입
            </Link>
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground/40 text-center mt-4 space-y-0.5">
          <p>관리자: admin@gmt.com / admin123</p>
          <p>홍길동: hong@gmt.co.kr / 1234 · 김철수: kim@gmt.co.kr / 1234</p>
        </div>
      </div>
    </div>
  )
}
