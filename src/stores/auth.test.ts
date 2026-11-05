import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { login, register } from '../http/auth'
import { getCurrentUser, getCurrentUserWorkspaceList } from '../http/user'
import type { AuthResponse } from '../interfaces/auth/api'
import type { UserInfo, UserResponse } from '../interfaces/user/model'
import { useAuthStore } from './auth'

vi.mock('../http/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  refreshToken: vi.fn(),
  switchWorkspace: vi.fn(),
}))

vi.mock('../http/user', () => ({
  getCurrentUser: vi.fn(),
  getCurrentUserWorkspaceList: vi.fn(),
}))

/** 登录、注册响应里的用户信息。 */
function loginUser(isPlatformAdmin: boolean): UserInfo {
  return {
    id: 1,
    username: 'admin',
    email: 'admin@example.com',
    is_platform_admin: isPlatformAdmin,
    created_at: '2026-11-01T00:00:00Z',
  }
}

function authResponse(user: UserInfo): AuthResponse {
  return { user, access_token: 'access', refresh_token: 'refresh', token_type: 'bearer' }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  vi.mocked(getCurrentUserWorkspaceList).mockResolvedValue([])
})

describe('auth store 平台管理员标记', () => {
  it('登录后直接读响应里的标记，不再额外请求 /users/me', async () => {
    vi.mocked(login).mockResolvedValueOnce(authResponse(loginUser(true)))
    const store = useAuthStore()

    await store.login('admin@example.com', 'password')

    expect(store.isPlatformAdmin).toBe(true)
    expect(getCurrentUser).not.toHaveBeenCalled()
  })

  it('注册后直接读响应里的标记', async () => {
    vi.mocked(register).mockResolvedValueOnce(authResponse(loginUser(false)))
    const store = useAuthStore()

    await store.register({ email: 'admin@example.com', username: 'admin', password: 'password' })

    expect(store.isPlatformAdmin).toBe(false)
    expect(getCurrentUser).not.toHaveBeenCalled()
  })

  it('刷新页面恢复登录态时，用 /users/me 返回的标记', async () => {
    const user: UserResponse = { ...loginUser(true), updated_at: '2026-11-01T00:00:00Z' }
    vi.mocked(getCurrentUser).mockResolvedValueOnce(user)
    const store = useAuthStore()
    store.state.accessToken = 'token'

    await expect(store.initialize()).resolves.toBe(true)

    expect(getCurrentUser).toHaveBeenCalledTimes(1)
    expect(store.isPlatformAdmin).toBe(true)
  })

  it('没有用户或字段缺失时按非管理员处理', () => {
    const store = useAuthStore()
    expect(store.isPlatformAdmin).toBe(false)

    store.state.user = { id: 1, username: 'admin', email: 'admin@example.com', created_at: '2026-11-01T00:00:00Z' }
    expect(store.isPlatformAdmin).toBe(false)
  })
})
