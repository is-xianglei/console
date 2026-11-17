/** 当前用户的个人信息，对应 GET /api/users/me 的响应。 */
export interface ProfileResponse {
  id: number
  username: string
  email: string
  full_name?: string | null
  avatar_url?: string | null
  phone?: string | null
  email_verified?: boolean
  auth_provider?: string
  last_login_at?: string | null
  created_at: string
  updated_at: string
}

/** 个人信息里可原位编辑的文本字段。 */
export type ProfileEditableField = 'full_name' | 'phone'

/** 选择头像弹窗里的默认头像。 */
export interface DefaultAvatar {
  id: string
  url: string
}
