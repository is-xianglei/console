/** 用户列表查询参数。 */
export interface GetUserListParams {
  limit?: number
  offset?: number
}

/** 创建用户请求。 */
export interface UserCreateRequest {
  username: string
  email: string
  password: string
  full_name?: string | null
}

/** 更新用户请求。 */
export interface UserUpdateRequest {
  full_name?: string | null
  avatar_url?: string | null
  phone?: string | null
  preferences?: Record<string, unknown> | null
}

/** 修改用户密码请求。 */
export interface UserChangePasswordRequest {
  old_password: string
  new_password: string
}

/** OpenAPI 将删除响应声明为通用字典。 */
export type UserDeleteResult = Record<string, unknown>
