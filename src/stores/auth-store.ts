import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
  avatar_url?: string
  approved: boolean       // 관리자 승인 여부
  created_at: string
}

interface AuthState {
  currentUser: User | null
  users: User[]
  passwords: Record<string, string> // email -> password
  isAuthenticated: boolean

  login: (email: string, password: string) => { success: boolean; error?: string }
  signup: (email: string, name: string, password: string) => { success: boolean; error?: string }
  logout: () => void
  updatePassword: (userId: string, newPassword: string) => void
  updateUser: (userId: string, updates: Partial<User>) => void
  deleteUser: (userId: string) => void
  changePassword: (userId: string, currentPassword: string, newPassword: string) => { success: boolean; error?: string }
  addUserManual: (email: string, name: string, password: string, role: 'admin' | 'member') => { success: boolean; error?: string }
}

const ADMIN_USER: User = {
  id: 'user-admin',
  email: 'admin@gmtc.kr',
  name: '관리자',
  role: 'admin',
  approved: true,
  created_at: '2025-01-01T00:00:00Z',
}

const INITIAL_USERS: User[] = [
  ADMIN_USER,
  { id: 'user-hong', email: 'hong@gmt.co.kr', name: '홍길동', role: 'member', approved: true, created_at: '2025-01-15T00:00:00Z' },
  { id: 'user-kim', email: 'kim@gmt.co.kr', name: '김철수', role: 'member', approved: true, created_at: '2025-02-01T00:00:00Z' },
  { id: 'user-lee', email: 'lee@gmt.co.kr', name: '이영희', role: 'member', approved: true, created_at: '2025-02-15T00:00:00Z' },
]

const INITIAL_PASSWORDS: Record<string, string> = {
  'admin@gmtc.kr': 'gmtvision!',
  'hong@gmt.co.kr': '1234',
  'kim@gmt.co.kr': '1234',
  'lee@gmt.co.kr': '1234',
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      users: INITIAL_USERS,
      passwords: INITIAL_PASSWORDS,
      isAuthenticated: false,

      login: (email, password) => {
        const { users, passwords } = get()
        const user = users.find((u) => u.email === email)
        if (!user) return { success: false, error: '등록되지 않은 이메일입니다' }
        if (passwords[email] !== password) return { success: false, error: '비밀번호가 일치하지 않습니다' }
        if (!user.approved) return { success: false, error: '관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.' }
        set({ currentUser: user, isAuthenticated: true })
        return { success: true }
      },

      signup: (email, name, password) => {
        const { users, passwords } = get()
        if (users.some((u) => u.email === email)) {
          return { success: false, error: '이미 사용 중인 이메일입니다' }
        }
        const newUser: User = {
          id: `user-${Date.now()}`,
          email,
          name,
          role: 'member',
          approved: false,  // 관리자 승인 대기
          created_at: new Date().toISOString(),
        }
        set({
          users: [...users, newUser],
          passwords: { ...passwords, [email]: password },
        })
        return { success: true }
      },

      logout: () => {
        set({ currentUser: null, isAuthenticated: false })
      },

      updatePassword: (userId, newPassword) => {
        const { users, passwords } = get()
        const user = users.find((u) => u.id === userId)
        if (user) {
          set({ passwords: { ...passwords, [user.email]: newPassword } })
        }
      },

      updateUser: (userId, updates) => {
        const { users, currentUser } = get()
        const updated = users.map((u) => (u.id === userId ? { ...u, ...updates } : u))
        set({
          users: updated,
          currentUser: currentUser?.id === userId ? { ...currentUser, ...updates } : currentUser,
        })
      },

      deleteUser: (userId) => {
        const { users, passwords } = get()
        const user = users.find((u) => u.id === userId)
        if (!user) return
        const newPasswords = { ...passwords }
        delete newPasswords[user.email]
        set({
          users: users.filter((u) => u.id !== userId),
          passwords: newPasswords,
        })
      },

      changePassword: (userId, currentPassword, newPassword) => {
        const { users, passwords } = get()
        const user = users.find((u) => u.id === userId)
        if (!user) return { success: false, error: '사용자를 찾을 수 없습니다' }
        if (passwords[user.email] !== currentPassword) {
          return { success: false, error: '현재 비밀번호가 일치하지 않습니다' }
        }
        set({ passwords: { ...passwords, [user.email]: newPassword } })
        return { success: true }
      },

      addUserManual: (email, name, password, role) => {
        const { users, passwords } = get()
        if (users.some((u) => u.email === email)) {
          return { success: false, error: '이미 사용 중인 이메일입니다' }
        }
        const newUser: User = {
          id: `user-${Date.now()}`,
          email,
          name,
          role,
          approved: true,  // 관리자가 수동 등록하면 자동 승인
          created_at: new Date().toISOString(),
        }
        set({
          users: [...users, newUser],
          passwords: { ...passwords, [email]: password },
        })
        return { success: true }
      },
    }),
    {
      name: 'xlgantt-auth',
    }
  )
)
