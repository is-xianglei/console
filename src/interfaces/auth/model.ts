/** 登录或注册响应中的用户摘要。 */
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

/** 当前工作区信息。 */
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

/** 当前用户完整信息。 */
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
