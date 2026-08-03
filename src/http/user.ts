import type {
  GetUserListParams,
  UserChangePasswordRequest,
  UserCreateRequest,
  UserDeleteResult,
  UserUpdateRequest,
} from '@/interfaces/user/api'
import type { UserResponse } from '@/interfaces/user/model'
import type { WorkspaceResponse } from '@/interfaces/workspace/model'
import { request } from './index'

function createListQuery(params?: GetUserListParams): string {
  const query = new URLSearchParams()
  if (params?.limit != null) query.set('limit', String(params.limit))
  if (params?.offset != null) query.set('offset', String(params.offset))
  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

/** 获取当前用户信息。 */
export function getCurrentUser(): Promise<UserResponse> {
  return request<UserResponse>('/users/me')
}

/** 删除当前用户。 */
export function deleteCurrentUser(): Promise<UserDeleteResult> {
  return request<UserDeleteResult>('/users/me', { method: 'DELETE' })
}

/** 更新当前用户信息。 */
export function updateCurrentUser(payload: UserUpdateRequest): Promise<UserResponse> {
  return request<UserResponse>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** 获取当前用户的工作区列表。 */
export function getCurrentUserWorkspaceList(): Promise<WorkspaceResponse[]> {
  return request<WorkspaceResponse[]>('/users/me/workspaces')
}

/** 修改当前用户密码。 */
export function changeCurrentUserPassword(
  payload: UserChangePasswordRequest,
): Promise<UserResponse> {
  return request<UserResponse>('/users/me/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 创建用户。 */
export function createUser(payload: UserCreateRequest): Promise<UserResponse> {
  return request<UserResponse>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 查询用户列表。 */
export function getUserList(params?: GetUserListParams): Promise<UserResponse[]> {
  return request<UserResponse[]>(`/users${createListQuery(params)}`)
}

/** 查询用户详情。 */
export function getUserDetail(userId: number): Promise<UserResponse> {
  return request<UserResponse>(`/users/${userId}`)
}

/** 更新用户信息。 */
export function updateUser(userId: number, payload: UserUpdateRequest): Promise<UserResponse> {
  return request<UserResponse>(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** 删除用户。 */
export function deleteUser(userId: number): Promise<UserDeleteResult> {
  return request<UserDeleteResult>(`/users/${userId}`, { method: 'DELETE' })
}

/** 修改指定用户密码。 */
export function changeUserPassword(
  userId: number,
  payload: UserChangePasswordRequest,
): Promise<UserResponse> {
  return request<UserResponse>(`/users/${userId}/change-password`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
