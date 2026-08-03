import { defineStore } from 'pinia'
import { reactive, computed } from 'vue'
import type { UserInfo, UserResponse } from '../interfaces/user/model'
import type { WorkspaceResponse } from '../interfaces/workspace/model'
import {
  login as apiLogin,
  register as apiRegister,
  refreshToken as apiRefresh,
  switchWorkspace as apiSwitch,
} from '../http/auth'
import { getCurrentUser, getCurrentUserWorkspaceList } from '../http/user'

const TOKEN_KEY = 'auth_token'
const REFRESH_KEY = 'auth_refresh_token'
const REFRESH_THRESHOLD = 5 * 60 * 1000 // Token 过期前 5 分钟刷新

interface AuthState {
  user: UserInfo | UserResponse | null
  accessToken: string | null
  refreshToken: string | null
  workspaces: WorkspaceResponse[]
  workspaceSwitching: boolean
  loading: boolean
  initialized: boolean
}

export const useAuthStore = defineStore('auth', () => {
  const state = reactive<AuthState>({
    user: null,
    accessToken: localStorage.getItem(TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_KEY),
    workspaces: [],
    workspaceSwitching: false,
    loading: false,
    initialized: false,
  })

  let initializePromise: Promise<boolean> | null = null
  let autoRefreshTimer: ReturnType<typeof setInterval> | null = null
  let authInvalidatedHandler: (() => void) | null = null

  // ===== 计算属性 =====
  const isAuthenticated = computed(() => !!state.accessToken && !!state.user)
  const currentWorkspaceId = computed<number | null>(() => {
    const token = state.accessToken
    if (!token) return null
    try {
      const payload = token.split('.')[1]
      if (!payload) return null
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
      const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
      const claims = JSON.parse(atob(normalized)) as Record<string, unknown>
      const id = Number(claims.workspace_id ?? claims.workspaceId)
      return Number.isInteger(id) && id > 0 ? id : null
    } catch {
      return null
    }
  })
  const currentWorkspace = computed(() => (
    state.workspaces.find((workspace) => workspace.id === currentWorkspaceId.value)
    ?? state.workspaces[0]
    ?? null
  ))

  // ===== Token 管理 =====
  function setTokens(access: string, refresh: string) {
    state.accessToken = access
    state.refreshToken = refresh
    localStorage.setItem(TOKEN_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  }

  function clearTokens() {
    state.accessToken = null
    state.refreshToken = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  }

  function invalidateAuth(notify = false) {
    state.user = null
    state.workspaces = []
    clearTokens()
    if (notify) authInvalidatedHandler?.()
  }

  function setAuthInvalidatedHandler(handler: (() => void) | null) {
    authInvalidatedHandler = handler
  }

  // ===== 认证操作 =====

  /** 用户登录 */
  async function login(email: string, password: string): Promise<void> {
    state.loading = true
    try {
      const res = await apiLogin({ email, password })
      state.user = res.user
      setTokens(res.access_token, res.refresh_token)
      state.initialized = true
      await loadWorkspaces()
    } finally {
      state.loading = false
    }
  }

  /** 用户注册 */
  async function register(payload: {
    email: string
    username: string
    password: string
    full_name?: string
  }): Promise<void> {
    state.loading = true
    try {
      const res = await apiRegister(payload)
      state.user = res.user
      setTokens(res.access_token, res.refresh_token)
      state.initialized = true
      await loadWorkspaces()
    } finally {
      state.loading = false
    }
  }

  /** 用户退出 */
  function logout() {
    invalidateAuth()
    state.initialized = true
  }

  /** 刷新 Token */
  async function refresh(): Promise<boolean> {
    if (!state.refreshToken || state.workspaceSwitching) return false
    try {
      const res = await apiRefresh(state.refreshToken)
      setTokens(res.access_token, res.refresh_token)
      return true
    } catch {
      invalidateAuth(true)
      return false
    }
  }

  /** 加载当前用户信息 */
  async function loadUser(): Promise<boolean> {
    if (!state.accessToken) return false
    try {
      state.user = await getCurrentUser()
      return true
    } catch {
      invalidateAuth()
      return false
    }
  }

  /** 加载用户工作区列表 */
  async function loadWorkspaces(): Promise<boolean> {
    try {
      state.workspaces = await getCurrentUserWorkspaceList()
      return true
    } catch {
      state.workspaces = []
      return false
    }
  }

  /** 切换工作区 */
  async function switchWorkspace(workspaceId: number): Promise<void> {
    if (state.workspaceSwitching) throw new Error('工作区正在切换，请稍后重试')
    state.workspaceSwitching = true
    try {
      const res = await apiSwitch(workspaceId)
      setTokens(res.access_token, res.refresh_token)
    } finally {
      state.workspaceSwitching = false
    }
  }

  /** 初始化：从 localStorage 恢复登录状态 */
  async function initialize(): Promise<boolean> {
    if (state.initialized) return isAuthenticated.value
    if (initializePromise) return initializePromise

    initializePromise = (async () => {
      try {
        if (!state.accessToken) return false
        const ok = await loadUser()
        if (ok) await loadWorkspaces()
        return ok
      } finally {
        state.initialized = true
      }
    })()

    try {
      return await initializePromise
    } finally {
      initializePromise = null
    }
  }

  /** 启动自动刷新 Token 的定时器 */
  function startAutoRefresh() {
    if (autoRefreshTimer) return
    autoRefreshTimer = setInterval(() => {
      if (state.accessToken) {
        refresh()
      }
    }, REFRESH_THRESHOLD)
  }

  return {
    state,
    isAuthenticated,
    currentWorkspaceId,
    currentWorkspace,
    login,
    register,
    logout,
    refresh,
    loadUser,
    loadWorkspaces,
    switchWorkspace,
    initialize,
    startAutoRefresh,
    setAuthInvalidatedHandler,
  }
})
