import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BarChart3, ArrowLeft, Check } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'

export function ProfilePage() {
  const navigate = useNavigate()
  const { currentUser, updateUser, changePassword } = useAuthStore()

  const [name, setName] = useState(currentUser?.name || '')
  const [nameSaved, setNameSaved] = useState(false)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  if (!currentUser) {
    navigate('/login')
    return null
  }

  const handleNameSave = () => {
    if (name.trim()) {
      updateUser(currentUser.id, { name: name.trim() })
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    }
  }

  const handlePasswordChange = () => {
    setPwError('')
    setPwSuccess(false)
    if (newPw.length < 6) {
      setPwError('비밀번호는 최소 6자 이상이어야 합니다')
      return
    }
    if (newPw !== confirmPw) {
      setPwError('새 비밀번호가 일치하지 않습니다')
      return
    }
    const result = changePassword(currentUser.id, currentPw, newPw)
    if (result.success) {
      setPwSuccess(true)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      setTimeout(() => setPwSuccess(false), 2000)
    } else {
      setPwError(result.error || '비밀번호 변경에 실패했습니다')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
              <BarChart3 className="h-3.5 w-3.5" />
            </div>
            <span className="text-base font-bold tracking-tight">GMTgantts</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-sm font-medium text-muted-foreground">내 프로필</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} className="text-xs h-7">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />프로젝트로
          </Button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-8">
        {/* 프로필 정보 */}
        <div className="bg-card border rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-sm font-bold mb-4">프로필 정보</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">이메일</label>
              <Input value={currentUser.email} disabled className="h-8 text-sm bg-muted" />
              <p className="text-[11px] text-muted-foreground mt-1">이메일은 변경할 수 없습니다</p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">이름</label>
              <div className="flex gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm flex-1" />
                <Button size="sm" className="h-8 text-xs" onClick={handleNameSave} disabled={name === currentUser.name}>
                  {nameSaved ? <><Check className="h-3.5 w-3.5 mr-1" />저장됨</> : '저장'}
                </Button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">역할</label>
              <Input value={currentUser.role === 'admin' ? '관리자' : '멤버'} disabled className="h-8 text-sm bg-muted" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">가입일</label>
              <Input value={new Date(currentUser.created_at).toLocaleDateString('ko-KR')} disabled className="h-8 text-sm bg-muted" />
            </div>
          </div>
        </div>

        {/* 비밀번호 변경 */}
        <div className="bg-card border rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-bold mb-4">비밀번호 변경</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">현재 비밀번호</label>
              <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="h-8 text-sm" placeholder="현재 비밀번호" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">새 비밀번호</label>
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="h-8 text-sm" placeholder="6자 이상" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">새 비밀번호 확인</label>
              <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="h-8 text-sm" placeholder="새 비밀번호 재입력" />
            </div>
            {pwError && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-md">{pwError}</p>
            )}
            {pwSuccess && (
              <p className="text-xs text-green-600 bg-green-50 dark:bg-green-950/20 px-3 py-2 rounded-md">비밀번호가 변경되었습니다</p>
            )}
            <div className="flex justify-end pt-1">
              <Button size="sm" className="h-8 text-xs" onClick={handlePasswordChange} disabled={!currentPw || !newPw || !confirmPw}>
                비밀번호 변경
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
