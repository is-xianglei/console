import type { UserInfo } from '../user/model'

/** 用户注册请求。 */
export interface RegisterRequest {
  email: string
  username: string
  password: string
  full_name?: string
}

/** 用户登录请求。 */
export interface LoginRequest {
  email: string
  password: string
}

/** 登录与注册响应。 */
export interface AuthResponse {
  user: UserInfo
  access_token: string
  refresh_token: string
  token_type: string
}

/** Token 刷新或工作区切换响应。 */
export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}
