import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BarChart3, Plus, Shield, Trash2, KeyRound, ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import { useAuthStore, type User, type UserRole } from '@/stores/auth-store'

export function AdminPage() {
  const navigate = useNavigate()
  const { currentUser, users, updateUser, deleteUser, updatePassword, addUserManual, fetchAllUsers, authMode } = useAuthStore()

  const [showAddUser, setShowAddUser] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('member')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [resetPassword, setResetPassword] = useState('123456')
  const [resetLoading, setResetLoading] = useState(false)

  const [refreshing, setRefreshing] = useState(false)

  // Admin guard
  if (!currentUser || currentUser.role !== 'admin') {
    navigate('/projects')
    return null
  }

  // Supabase 모드에서 사용자 목록 불러오기
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (authMode === 'supabase') {
      fetchAllUsers()
    }
  }, [authMode, fetchAllUsers])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchAllUsers()
    } finally {
      setRefreshing(false)
    }
  }

  const handleAddUser = async () => {
    setAddError('')
    if (!newName || !newEmail || !newPassword) {
      setAddError('모든 필드를 입력하세요')
      return
    }
    if (newPassword.length < 6) {
      setAddError('비밀번호는 최소 6자 이상이어야 합니다')
      return
    }
    setAddLoading(true)
    try {
      const result = await addUserManual(newEmail, newName, newPassword, newRole)
      if (result.success) {
        setShowAddUser(false)
        setNewName('')
        setNewEmail('')
        setNewPassword('')
        setNewRole('member')
        if (authMode === 'supabase') await fetchAllUsers()
      } else {
        setAddError(result.error || '사용자 추가에 실패했습니다')
      }
    } catch {
      setAddError('사용자 추가 중 오류가 발생했습니다')
    } finally {
      setAddLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (resetTarget && resetPassword.length >= 6) {
      setResetLoading(true)
      try {
        await updatePassword(resetTarget.id, resetPassword)
        setResetTarget(null)
        setResetPassword('123456')
      } catch {
        // 에러 무시
      } finally {
        setResetLoading(false)
      }
    }
  }

  const handleRoleChange = async (userId: string, role: UserRole) => {
    await updateUser(userId, { role })
  }

  const handleApprovalToggle = async (user: User) => {
    await updateUser(user.id, { approved: !user.approved })
  }

  const handleDelete = async (userId: string) => {
    if (userId === currentUser.id) return
    if (!confirm('이 사용자를 삭제하시겠습니까?')) return
    await deleteUser(userId)
  }

  return (
    <div className="std-page">
      <header className="std-page-header">
        <div className="std-page-header-inner">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
              <BarChart3 className="h-3.5 w-3.5" />
            </div>
            <span className="text-base font-bold tracking-tight">GMTgantts</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-sm font-medium text-muted-foreground">사용자 관리</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} className="text-xs h-7">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />프로젝트로
          </Button>
        </div>
      </header>

      <main className="std-page-main">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Shield className="h-5 w-5" />사용자 관리
            </h1>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {users.length}명의 사용자
              {authMode === 'supabase' && <span className="ml-2">(Supabase)</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {authMode === 'supabase' && (
              <Button variant="outline" size="sm" onClick={handleRefresh} className="h-8 text-xs" disabled={refreshing}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} />새로고침
              </Button>
            )}
            <Button size="sm" onClick={() => setShowAddUser(true)} className="h-8 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />사용자 추가
            </Button>
          </div>
        </div>

        <div className="std-surface overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">이름</TableHead>
                <TableHead className="text-xs">이메일</TableHead>
                <TableHead className="text-xs">역할</TableHead>
                <TableHead className="text-xs">승인</TableHead>
                <TableHead className="text-xs">가입일</TableHead>
                <TableHead className="text-xs w-[140px]">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="text-sm font-medium">
                    {user.name}
                    {user.id === currentUser.id && (
                      <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">나</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      onValueChange={(v) => handleRoleChange(user.id, v as UserRole)}
                      disabled={user.id === currentUser.id}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin" className="text-xs">관리자</SelectItem>
                        <SelectItem value="pm" className="text-xs">PM</SelectItem>
                        <SelectItem value="member" className="text-xs">멤버</SelectItem>
                        <SelectItem value="guest" className="text-xs">게스트</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {user.role === 'admin' ? (
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">승인</Badge>
                    ) : (
                      <button
                        onClick={() => handleApprovalToggle(user)}
                        className={`text-xs font-medium px-2 py-0.5 rounded-full border transition-colors ${
                          user.approved
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                            : 'bg-red-50 text-red-600 border-red-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                        }`}
                      >
                        {user.approved ? '승인' : '대기'}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString('ko-KR')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setResetTarget(user)}
                        title={authMode === 'supabase' ? '비밀번호 초기화 (본인만 가능)' : '비밀번호 초기화'}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-600"
                        onClick={() => handleDelete(user.id)}
                        disabled={user.id === currentUser.id}
                        title="사용자 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </main>

      {/* 사용자 추가 다이얼로그 */}
      <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">새 사용자 등록</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div>
              <label className="std-form-label">이름</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="이름" className="h-8 text-sm" autoFocus disabled={addLoading} />
            </div>
            <div>
              <label className="std-form-label">이메일</label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com" className="h-8 text-sm" disabled={addLoading} />
            </div>
            <div>
              <label className="std-form-label">초기 비밀번호</label>
              <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="6자 이상" className="h-8 text-sm" disabled={addLoading} />
            </div>
            <div>
              <label className="std-form-label">역할</label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)} disabled={addLoading}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">관리자</SelectItem>
                  <SelectItem value="pm">PM (프로젝트 관리자)</SelectItem>
                  <SelectItem value="member">멤버</SelectItem>
                  <SelectItem value="guest">게스트</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {addError && (
              <p className="std-feedback-error">{addError}</p>
            )}
            {authMode === 'supabase' && (
              <p className="std-feedback-info">Supabase Auth로 사용자가 생성되며, 즉시 승인됩니다.</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAddUser(false)} disabled={addLoading}>취소</Button>
              <Button size="sm" onClick={handleAddUser} disabled={addLoading}>
                {addLoading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />등록 중...</> : '등록'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 비밀번호 초기화 다이얼로그 */}
      <Dialog open={!!resetTarget} onOpenChange={() => setResetTarget(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base">비밀번호 초기화</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <p className="text-sm text-muted-foreground">
              <strong>{resetTarget?.name}</strong> ({resetTarget?.email})
            </p>
            {authMode === 'supabase' && resetTarget?.id !== currentUser.id && (
              <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-md border border-amber-200/80">
                Supabase 모드에서는 다른 사용자의 비밀번호를 직접 변경할 수 없습니다. Service Role 키가 필요합니다.
              </p>
            )}
            <div>
              <label className="std-form-label">새 비밀번호</label>
              <Input value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} className="h-8 text-sm" disabled={resetLoading} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setResetTarget(null)} disabled={resetLoading}>취소</Button>
              <Button
                size="sm"
                onClick={handleResetPassword}
                disabled={resetPassword.length < 6 || resetLoading || (authMode === 'supabase' && resetTarget?.id !== currentUser.id)}
              >
                {resetLoading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />변경 중...</> : '초기화'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
