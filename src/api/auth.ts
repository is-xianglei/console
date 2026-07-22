import { request, authRequest } from './client'

// ===== 类型定义 =====

export interface UserInfo {
  id: number
  username: string
  email: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  status: string
  created_at: string
}

export interface AuthResponse {
  user: UserInfo
  access_token: string
  refresh_token: string
  token_type: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface WorkspaceResponse {
  id: number
  name: string
  slug: string
  display_name: string
  logo_url: string | null
  workspace_type: string
  suspended: boolean
  industry: string | null
  company_size: string | null
  billing_email: string | null
  plan: string
  quotas: Record<string, unknown>
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface UserResponse {
  id: number
  username: string
  email: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  email_verified: boolean
  suspended: boolean
  auth_provider: string
  preferences: Record<string, unknown>
  last_login_at: string | null
  created_at: string
  updated_at: string
}

// ===== 认证相关 API =====

/** 用户注册 */
export async function register(payload: {
  email: string
  username: string
  password: string
  full_name?: string
}): Promise<AuthResponse> {
  return authRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 用户登录 */
export async function login(payload: { email: string; password: string }): Promise<AuthResponse> {
  return authRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 刷新 Token */
export async function refreshToken(refreshToken: string): Promise<TokenResponse> {
  return authRequest<TokenResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
}

/** 切换工作区 */
export async function switchWorkspace(workspaceId: number): Promise<TokenResponse> {
  return authRequest<TokenResponse>('/auth/switch-workspace', {
    method: 'POST',
    body: JSON.stringify({ workspace_id: workspaceId }),
  })
}

// ===== 用户相关 API =====

/** 获取当前用户信息 */
export async function getCurrentUser(): Promise<UserResponse> {
  return request<UserResponse>('/users/me')
}

/** 更新当前用户信息 */
export async function updateUser(payload: {
  full_name?: string
  avatar_url?: string
  phone?: string
  preferences?: Record<string, unknown>
}): Promise<UserResponse> {
  return request<UserResponse>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** 修改当前用户密码 */
export async function changePassword(payload: {
  old_password: string
  new_password: string
}): Promise<UserResponse> {
  return request<UserResponse>('/users/me/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 获取当前用户的工作区列表 */
export async function getUserWorkspaces(): Promise<WorkspaceResponse[]> {
  return request<WorkspaceResponse[]>('/users/me/workspaces')
}
