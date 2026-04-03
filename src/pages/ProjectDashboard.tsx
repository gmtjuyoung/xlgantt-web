import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, BarChart3, Calendar, Trash2, FolderOpen, User, Shield, LogOut, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useProjectStore } from '@/stores/project-store'
import { useAuthStore } from '@/stores/auth-store'
import { DatePicker } from '@/components/ui/date-picker'

export function ProjectDashboard() {
  const navigate = useNavigate()
  const { projects, addProject, deleteProject, loadProjects } = useProjectStore()

  useEffect(() => {
    loadProjects()
  }, [])
  const { currentUser, logout } = useAuthStore()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')

  const handleCreate = () => {
    if (!newName.trim()) return
    const id = crypto.randomUUID()
    addProject({
      id,
      name: newName,
      description: '',
      start_date: newStart || new Date().toISOString().split('T')[0],
      end_date: newEnd || new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
      owner_id: currentUser?.id || 'local',
      theme_id: 0,
      language: 'ko',
      zoom_level: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    setNewName('')
    setNewStart('')
    setNewEnd('')
    setShowCreate(false)
    navigate(`/projects/${id}`)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
              <BarChart3 className="h-3.5 w-3.5" />
            </div>
            <span className="text-base font-bold tracking-tight">GMTgantts</span>
          </div>

          {/* 사용자 드롭다운 */}
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold">
                  {currentUser?.name?.[0] || 'U'}
                </div>
                <span className="max-w-[100px] truncate">{currentUser?.name || '사용자'}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{currentUser?.name}</p>
                <p className="text-xs text-muted-foreground">{currentUser?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')} className="text-xs cursor-pointer">
                <User className="h-3.5 w-3.5 mr-2" />내 프로필
              </DropdownMenuItem>
              {currentUser?.role === 'admin' && (
                <DropdownMenuItem onClick={() => navigate('/admin')} className="text-xs cursor-pointer">
                  <Shield className="h-3.5 w-3.5 mr-2" />사용자 관리
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-xs cursor-pointer text-red-500 focus:text-red-500">
                <LogOut className="h-3.5 w-3.5 mr-2" />로그아웃
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* 본문 */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">프로젝트</h1>
            <p className="text-xs text-muted-foreground/60 mt-0.5">{projects.length}개</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="h-8 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />새 프로젝트
          </Button>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-20 border border-dashed rounded-xl">
            <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-sm font-medium text-muted-foreground/50">프로젝트가 없습니다</p>
            <Button size="sm" className="mt-4 h-8 text-xs" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />프로젝트 만들기
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((p) => (
              <div
                key={p.id}
                className="bg-card border rounded-lg p-4 hover:shadow-md hover:border-primary/20 transition-all cursor-pointer group"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold truncate flex-1">{p.name}</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 -mr-1 opacity-0 group-hover:opacity-50 hover:!opacity-100 flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      const input = prompt(`프로젝트를 삭제하려면 프로젝트 이름을 입력하세요:\n\n"${p.name}"`)
                      if (input === p.name) deleteProject(p.id)
                      else if (input !== null) alert('프로젝트 이름이 일치하지 않습니다.')
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60 mb-3">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {p.start_date} ~ {p.end_date}
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-muted-foreground/50">진행률</span>
                    <span className="font-medium tabular-nums">0%</span>
                  </div>
                  <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: '0%' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 프로젝트 생성 다이얼로그 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">새 프로젝트</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div>
              <label className="block text-xs font-medium mb-1">프로젝트 이름</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="프로젝트 이름" className="h-8 text-sm" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">시작일</label>
                <DatePicker value={newStart} onChange={setNewStart} placeholder="시작일 선택" className="h-8 text-xs" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">종료일</label>
                <DatePicker value={newEnd} onChange={setNewEnd} placeholder="종료일 선택" className="h-8 text-xs" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>취소</Button>
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>생성</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
