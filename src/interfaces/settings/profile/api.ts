/** 更新个人信息请求，对应 PATCH /api/users/me；只传需要修改的字段。 */
export interface ProfileUpdateRequest {
  full_name?: string | null
  avatar_url?: string | null
  phone?: string | null
}
