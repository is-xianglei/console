import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  TokenResponse,
} from '../interfaces/auth/api'
import { authRequest } from './index'

// ===== 认证相关 API =====

/** 用户注册 */
export async function register(payload: RegisterRequest): Promise<AuthResponse> {
  return authRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 用户登录(幂等,允许网络抖动重试一次) */
export async function login(payload: LoginRequest): Promise<AuthResponse> {
  return authRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    retry: true,
    body: JSON.stringify(payload),
  })
}

/** 刷新 Token(幂等,允许网络抖动重试一次) */
export async function refreshToken(refreshToken: string): Promise<TokenResponse> {
  return authRequest<TokenResponse>('/auth/refresh', {
    method: 'POST',
    retry: true,
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
