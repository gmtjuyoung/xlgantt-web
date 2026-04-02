import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BarChart3, Plus, Shield, Trash2, KeyRound, ArrowLeft } from 'lucide-react'
import { useAuthStore, type User } from '@/stores/auth-store'

export function AdminPage() {
  const navigate = useNavigate()
  const { currentUser, users, updateUser, deleteUser, updatePassword, addUserManual } = useAuthStore()

  const [showAddUser, setShowAddUser] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'member'>('member')
  const [addError, setAddError] = useState('')

  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [resetPassword, setResetPassword] = useState('123456')

  // Admin guard
  if (!currentUser || currentUser.role !== 'admin') {
    navigate('/projects')
    return null
  }

  const handleAddUser = () => {
    setAddError('')
    if (!newName || !newEmail || !newPassword) {
      setAddError('모든 필드를 입력하세요')
      return
    }
    if (newPassword.length < 6) {
      setAddError('비밀번호는 최소 6자 이상이어야 합니다')
      return
    }
    const result = addUserManual(newEmail, newName, newPassword, newRole)
    if (result.success) {
      setShowAddUser(false)
      setNewName('')
      setNewEmail('')
      setNewPassword('')
      setNewRole('member')
    } else {
      setAddError(result.error || '사용자 추가에 실패했습니다')
    }
  }

  const handleResetPassword = () => {
    if (resetTarget && resetPassword.length >= 6) {
      updatePassword(resetTarget.id, resetPassword)
      setResetTarget(null)
      setResetPassword('123456')
    }
  }

  const handleRoleChange = (userId: string, role: 'admin' | 'member') => {
    updateUser(userId, { role })
  }

  const handleDelete = (userId: string) => {
    if (userId === currentUser.id) return
    deleteUser(userId)
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
            <span className="text-sm font-medium text-muted-foreground">사용자 관리</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} className="text-xs h-7">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />프로젝트로
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Shield className="h-5 w-5" />사용자 관리
            </h1>
            <p className="text-xs text-muted-foreground/60 mt-0.5">{users.length}명의 사용자</p>
          </div>
          <Button size="sm" onClick={() => setShowAddUser(true)} className="h-8 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />사용자 추가
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden">
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
                      onValueChange={(v) => handleRoleChange(user.id, v as 'admin' | 'member')}
                      disabled={user.id === currentUser.id}
                    >
                      <SelectTrigger className="h-7 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin" className="text-xs">관리자</SelectItem>
                        <SelectItem value="member" className="text-xs">멤버</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {user.role === 'admin' ? (
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">승인</Badge>
                    ) : (
                      <button
                        onClick={() => updateUser(user.id, { approved: !user.approved })}
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
                        title="비밀번호 초기화"
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
              <label className="block text-xs font-medium mb-1">이름</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="이름" className="h-8 text-sm" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">이메일</label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com" className="h-8 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">초기 비밀번호</label>
              <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="6자 이상" className="h-8 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">역할</label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as 'admin' | 'member')}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">멤버</SelectItem>
                  <SelectItem value="admin">관리자</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {addError && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-md">{addError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAddUser(false)}>취소</Button>
              <Button size="sm" onClick={handleAddUser}>등록</Button>
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
            <div>
              <label className="block text-xs font-medium mb-1">새 비밀번호</label>
              <Input value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setResetTarget(null)}>취소</Button>
              <Button size="sm" onClick={handleResetPassword} disabled={resetPassword.length < 6}>초기화</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
