import type {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  UpdateUserRequest,
} from '../interfaces/auth/api'
import type { UserResponse, WorkspaceResponse } from '../interfaces/auth/model'
import { authRequest, request } from './index'

// ===== 认证相关 API =====

/** 用户注册 */
export async function register(payload: RegisterRequest): Promise<AuthResponse> {
  return authRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 用户登录 */
export async function login(payload: LoginRequest): Promise<AuthResponse> {
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
export async function updateUser(payload: UpdateUserRequest): Promise<UserResponse> {
  return request<UserResponse>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** 修改当前用户密码 */
export async function changePassword(payload: ChangePasswordRequest): Promise<UserResponse> {
  return request<UserResponse>('/users/me/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 获取当前用户的工作区列表 */
export async function getUserWorkspaces(): Promise<WorkspaceResponse[]> {
  return request<WorkspaceResponse[]>('/users/me/workspaces')
}
