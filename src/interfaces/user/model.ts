/** 登录或注册响应中的用户摘要。 */
export interface UserInfo {
  id: number
  username: string
  email: string
  full_name?: string | null
  avatar_url?: string | null
  phone?: string | null
  email_verified?: boolean
  suspended?: boolean
  auth_provider?: string
  last_login_at?: string | null
  created_at: string
}

/** 用户完整信息。 */
export interface UserResponse extends UserInfo {
  preferences?: Record<string, unknown>
  updated_at: string
}
