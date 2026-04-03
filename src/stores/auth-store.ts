import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

export type UserRole = 'admin' | 'pm' | 'member' | 'guest'

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: '관리자',
  pm: '프로젝트 관리자',
  member: '멤버',
  guest: '게스트',
}

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  avatar_url?: string
  approved: boolean
  created_at: string
}

interface AuthState {
  currentUser: User | null
  users: User[]
  passwords: Record<string, string> // email -> password (로컬 폴백용)
  isAuthenticated: boolean
  isLoading: boolean
  authMode: 'supabase' | 'local'

  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signup: (email: string, name: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  updatePassword: (userId: string, newPassword: string) => Promise<void>
  updateUser: (userId: string, updates: Partial<User>) => Promise<void>
  deleteUser: (userId: string) => Promise<void>
  changePassword: (userId: string, currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>
  addUserManual: (email: string, name: string, password: string, role: UserRole) => Promise<{ success: boolean; error?: string }>
  initSession: () => Promise<void>
  fetchAllUsers: () => Promise<void>
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

// Supabase 사용 가능 여부 판단
function checkSupabaseAvailable(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL
  return !!url && url !== 'http://localhost:54321' && url !== 'your-supabase-url'
}

// Supabase Auth 에러 메시지 한글화
function translateAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 일치하지 않습니다'
  if (message.includes('Email not confirmed')) return '이메일 인증이 완료되지 않았습니다'
  if (message.includes('User already registered')) return '이미 사용 중인 이메일입니다'
  if (message.includes('Password should be at least')) return '비밀번호는 최소 6자 이상이어야 합니다'
  if (message.includes('Email rate limit exceeded')) return '요청이 너무 많습니다. 잠시 후 다시 시도하세요'
  if (message.includes('Signup is disabled')) return '회원가입이 비활성화되어 있습니다'
  if (message.includes('email') && message.includes('invalid')) return '올바른 이메일 형식이 아닙니다'
  return message
}

// profiles 테이블에서 사용자 정보 조회
async function fetchProfile(userId: string): Promise<{ role: UserRole; approved: boolean; name: string; avatar_url?: string } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, approved, name, avatar_url')
    .eq('id', userId)
    .single()
  if (error || !data) return null
  return {
    role: (data.role as UserRole) || 'member',
    approved: data.approved ?? false,
    name: data.name || '',
    avatar_url: data.avatar_url || undefined,
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      users: INITIAL_USERS,
      passwords: INITIAL_PASSWORDS,
      isAuthenticated: false,
      isLoading: false,
      authMode: checkSupabaseAvailable() ? 'supabase' : 'local',

      // 앱 시작 시 세션 복원 + onAuthStateChange 리스너
      initSession: async () => {
        const { authMode } = get()
        if (authMode !== 'supabase') return

        set({ isLoading: true })
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const profile = await fetchProfile(session.user.id)
            if (profile && profile.approved) {
              const user: User = {
                id: session.user.id,
                email: session.user.email || '',
                name: profile.name || session.user.user_metadata?.name || '',
                role: profile.role,
                avatar_url: profile.avatar_url,
                approved: profile.approved,
                created_at: session.user.created_at,
              }
              set({ currentUser: user, isAuthenticated: true })
            } else {
              // 미승인 사용자는 세션 제거
              await supabase.auth.signOut()
              set({ currentUser: null, isAuthenticated: false })
            }
          }

          // 인증 상태 변경 리스너
          supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
              const profile = await fetchProfile(session.user.id)
              if (profile && profile.approved) {
                const user: User = {
                  id: session.user.id,
                  email: session.user.email || '',
                  name: profile.name || session.user.user_metadata?.name || '',
                  role: profile.role,
                  avatar_url: profile.avatar_url,
                  approved: profile.approved,
                  created_at: session.user.created_at,
                }
                set({ currentUser: user, isAuthenticated: true })
              }
            } else if (event === 'SIGNED_OUT') {
              set({ currentUser: null, isAuthenticated: false })
            }
          })
        } catch {
          // Supabase 연결 실패 시 로컬 폴백
          console.warn('Supabase 연결 실패, 로컬 인증 모드로 전환합니다')
          set({ authMode: 'local' })
        } finally {
          set({ isLoading: false })
        }
      },

      // 관리자용: 모든 사용자 목록 조회
      fetchAllUsers: async () => {
        const { authMode } = get()
        if (authMode !== 'supabase') return

        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('id, email, name, role, approved, avatar_url, created_at')
            .order('created_at', { ascending: true })

          if (!error && data) {
            const users: User[] = data.map((p) => ({
              id: p.id,
              email: p.email || '',
              name: p.name || '',
              role: (p.role as UserRole) || 'member',
              approved: p.approved ?? false,
              avatar_url: p.avatar_url || undefined,
              created_at: p.created_at || new Date().toISOString(),
            }))
            set({ users })
          }
        } catch {
          console.warn('사용자 목록 조회 실패')
        }
      },

      login: async (rawEmail, password) => {
        const email = rawEmail.trim().toLowerCase()
        const { authMode } = get()

        // Supabase 인증
        if (authMode === 'supabase') {
          set({ isLoading: true })
          try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password })
            if (error) {
              set({ isLoading: false })
              return { success: false, error: translateAuthError(error.message) }
            }
            if (!data.user) {
              set({ isLoading: false })
              return { success: false, error: '로그인에 실패했습니다' }
            }

            // profiles에서 role, approved 조회
            const profile = await fetchProfile(data.user.id)
            if (!profile) {
              await supabase.auth.signOut()
              set({ isLoading: false })
              return { success: false, error: '프로필 정보를 찾을 수 없습니다. 관리자에게 문의하세요.' }
            }
            if (!profile.approved) {
              await supabase.auth.signOut()
              set({ isLoading: false })
              return { success: false, error: '관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.' }
            }

            const user: User = {
              id: data.user.id,
              email: data.user.email || '',
              name: profile.name || data.user.user_metadata?.name || '',
              role: profile.role,
              avatar_url: profile.avatar_url,
              approved: profile.approved,
              created_at: data.user.created_at,
            }
            set({ currentUser: user, isAuthenticated: true, isLoading: false })
            return { success: true }
          } catch {
            // Supabase 연결 실패 시 로컬 폴백
            console.warn('Supabase 로그인 실패, 로컬 인증 시도')
            set({ authMode: 'local', isLoading: false })
            // 로컬 폴백 실행
            return get().login(email, password)
          }
        }

        // 로컬 인증 (폴백)
        const { users, passwords } = get()
        const user = users.find((u) => u.email === email)
        if (!user) return { success: false, error: '등록되지 않은 이메일입니다' }
        if (passwords[email] !== password) return { success: false, error: '비밀번호가 일치하지 않습니다' }
        if (!user.approved) return { success: false, error: '관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.' }
        set({ currentUser: user, isAuthenticated: true })
        return { success: true }
      },

      signup: async (rawEmail, name, password) => {
        const email = rawEmail.trim().toLowerCase()
        const { authMode } = get()

        // Supabase 회원가입
        if (authMode === 'supabase') {
          set({ isLoading: true })
          try {
            const { data, error } = await supabase.auth.signUp({
              email,
              password,
              options: {
                data: { name },
                emailRedirectTo: undefined,
              },
            })
            if (error) {
              set({ isLoading: false })
              return { success: false, error: translateAuthError(error.message) }
            }
            if (!data.user) {
              set({ isLoading: false })
              return { success: false, error: '회원가입에 실패했습니다' }
            }

            // profiles에 role, approved 설정 (트리거가 없는 경우 수동 upsert)
            await supabase.from('profiles').upsert({
              id: data.user.id,
              email,
              name,
              role: 'member',
              approved: false,
            }, { onConflict: 'id' })

            // 즉시 로그아웃 (승인 전이므로)
            await supabase.auth.signOut()
            set({ isLoading: false })
            return { success: true }
          } catch {
            console.warn('Supabase 회원가입 실패, 로컬 폴백')
            set({ authMode: 'local', isLoading: false })
            return get().signup(email, name, password)
          }
        }

        // 로컬 회원가입 (폴백)
        const { users, passwords } = get()
        if (users.some((u) => u.email === email)) {
          return { success: false, error: '이미 사용 중인 이메일입니다' }
        }
        const newUser: User = {
          id: `user-${Date.now()}`,
          email,
          name,
          role: 'member',
          approved: false,
          created_at: new Date().toISOString(),
        }
        set({
          users: [...users, newUser],
          passwords: { ...passwords, [email]: password },
        })
        return { success: true }
      },

      logout: async () => {
        const { authMode } = get()
        if (authMode === 'supabase') {
          try {
            await supabase.auth.signOut()
          } catch {
            console.warn('Supabase 로그아웃 실패')
          }
        }
        set({ currentUser: null, isAuthenticated: false })
      },

      updatePassword: async (userId, newPassword) => {
        const { authMode, users, passwords } = get()

        if (authMode === 'supabase') {
          // Supabase에서 다른 사용자의 비밀번호 변경은 service_role 필요
          // 현재 사용자 본인의 경우만 가능
          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user?.id === userId) {
              await supabase.auth.updateUser({ password: newPassword })
            }
            // 다른 사용자의 비밀번호 초기화는 service_role 키 필요 - 로컬에서는 불가
          } catch {
            console.warn('비밀번호 변경 실패')
          }
          return
        }

        // 로컬 폴백
        const user = users.find((u) => u.id === userId)
        if (user) {
          set({ passwords: { ...passwords, [user.email]: newPassword } })
        }
      },

      updateUser: async (userId, updates) => {
        const { authMode, users, currentUser } = get()

        if (authMode === 'supabase') {
          try {
            // profiles 테이블 업데이트
            const profileUpdates: Record<string, unknown> = {}
            if (updates.role !== undefined) profileUpdates.role = updates.role
            if (updates.approved !== undefined) profileUpdates.approved = updates.approved
            if (updates.name !== undefined) profileUpdates.name = updates.name
            if (updates.avatar_url !== undefined) profileUpdates.avatar_url = updates.avatar_url

            if (Object.keys(profileUpdates).length > 0) {
              // 본인 수정은 직접 UPDATE, 다른 사용자는 RPC
              if (userId === currentUser?.id) {
                const { error } = await supabase.from('profiles').update(profileUpdates).eq('id', userId)
                if (error) { console.error('프로필 업데이트 실패:', error.message); return }
              } else {
                const { error } = await supabase.rpc('admin_update_profile', {
                  target_user_id: userId,
                  new_role: updates.role ?? null,
                  new_approved: updates.approved ?? null,
                  new_name: updates.name ?? null,
                })
                if (error) { console.error('관리자 업데이트 실패:', error.message); return }
              }
            }

            // 로컬 상태도 업데이트
            const updated = users.map((u) => (u.id === userId ? { ...u, ...updates } : u))
            set({
              users: updated,
              currentUser: currentUser?.id === userId ? { ...currentUser, ...updates } : currentUser,
            })
          } catch {
            console.warn('사용자 업데이트 실패')
          }
          return
        }

        // 로컬 폴백
        const updated = users.map((u) => (u.id === userId ? { ...u, ...updates } : u))
        set({
          users: updated,
          currentUser: currentUser?.id === userId ? { ...currentUser, ...updates } : currentUser,
        })
      },

      deleteUser: async (userId) => {
        const { authMode, users, passwords } = get()

        if (authMode === 'supabase') {
          try {
            // profiles에서만 삭제 (auth.users는 service_role 필요)
            const { error } = await supabase.from('profiles').delete().eq('id', userId)
            if (error) {
              console.error('사용자 삭제 실패:', error.message)
              return
            }
            // 로컬 상태에서도 제거
            set({ users: users.filter((u) => u.id !== userId) })
          } catch {
            console.warn('사용자 삭제 실패')
          }
          return
        }

        // 로컬 폴백
        const user = users.find((u) => u.id === userId)
        if (!user) return
        const newPasswords = { ...passwords }
        delete newPasswords[user.email]
        set({
          users: users.filter((u) => u.id !== userId),
          passwords: newPasswords,
        })
      },

      changePassword: async (userId, currentPassword, newPassword) => {
        const { authMode, users, passwords } = get()

        if (authMode === 'supabase') {
          try {
            // 현재 비밀번호 확인을 위해 재로그인
            const user = users.find((u) => u.id === userId)
            if (!user) return { success: false, error: '사용자를 찾을 수 없습니다' }

            const { error: signInError } = await supabase.auth.signInWithPassword({
              email: user.email,
              password: currentPassword,
            })
            if (signInError) {
              return { success: false, error: '현재 비밀번호가 일치하지 않습니다' }
            }

            const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
            if (updateError) {
              return { success: false, error: translateAuthError(updateError.message) }
            }
            return { success: true }
          } catch {
            return { success: false, error: '비밀번호 변경에 실패했습니다' }
          }
        }

        // 로컬 폴백
        const user = users.find((u) => u.id === userId)
        if (!user) return { success: false, error: '사용자를 찾을 수 없습니다' }
        if (passwords[user.email] !== currentPassword) {
          return { success: false, error: '현재 비밀번호가 일치하지 않습니다' }
        }
        set({ passwords: { ...passwords, [user.email]: newPassword } })
        return { success: true }
      },

      addUserManual: async (rawEmail, name, password, role) => {
        const email = rawEmail.trim().toLowerCase()
        const { authMode, users, passwords } = get()

        if (authMode === 'supabase') {
          set({ isLoading: true })
          try {
            // Supabase Auth로 사용자 생성 (signUp 사용)
            const { data, error } = await supabase.auth.signUp({
              email,
              password,
              options: {
                data: { name },
              },
            })
            if (error) {
              set({ isLoading: false })
              return { success: false, error: translateAuthError(error.message) }
            }
            if (!data.user) {
              set({ isLoading: false })
              return { success: false, error: '사용자 생성에 실패했습니다' }
            }

            // profiles에 role과 approved 설정 (관리자가 수동 등록이므로 approved=true)
            await supabase.from('profiles').upsert({
              id: data.user.id,
              email,
              name,
              role,
              approved: true,
            }, { onConflict: 'id' })

            // 새 사용자를 로컬 목록에도 추가
            const newUser: User = {
              id: data.user.id,
              email,
              name,
              role,
              approved: true,
              created_at: data.user.created_at,
            }
            set({ users: [...users, newUser], isLoading: false })
            return { success: true }
          } catch {
            console.warn('Supabase 사용자 추가 실패, 로컬 폴백')
            set({ authMode: 'local', isLoading: false })
            return get().addUserManual(email, name, password, role)
          }
        }

        // 로컬 폴백
        if (users.some((u) => u.email === email)) {
          return { success: false, error: '이미 사용 중인 이메일입니다' }
        }
        const newUser: User = {
          id: `user-${Date.now()}`,
          email,
          name,
          role,
          approved: true,
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
      version: 4, // Supabase Auth 하이브리드 모드 적용
      merge: (persisted: unknown, current: AuthState) => {
        const p = persisted as Partial<AuthState> | undefined
        if (!p) return current
        // Supabase 모드에서는 로컬 사용자 목록을 비우고 서버에서 가져옴
        const isSupabase = checkSupabaseAvailable()
        if (isSupabase) {
          return {
            ...current,
            ...p,
            authMode: 'supabase' as const,
            users: p.users || [],
            passwords: {},
          }
        }
        // 로컬 모드: 초기 사용자가 항상 포함되도록 병합
        const existingEmails = new Set((p.users || []).map((u: User) => u.email))
        const mergedUsers = [
          ...(p.users || []),
          ...INITIAL_USERS.filter((u) => !existingEmails.has(u.email)),
        ]
        const mergedPasswords = { ...INITIAL_PASSWORDS, ...(p.passwords || {}) }
        return {
          ...current,
          ...p,
          authMode: 'local' as const,
          users: mergedUsers,
          passwords: mergedPasswords,
        }
      },
    }
  )
)
