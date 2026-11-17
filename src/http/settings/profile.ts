import type { ProfileUpdateRequest } from '@/interfaces/settings/profile/api'
import type { ProfileResponse } from '@/interfaces/settings/profile/model'
import { request } from '../index'

/** 获取当前用户个人信息。 */
export async function getProfile(): Promise<ProfileResponse> {
  return request<ProfileResponse>('/users/me')
}

/** 更新当前用户个人信息（姓名、头像、手机号）。 */
export async function updateProfile(payload: ProfileUpdateRequest): Promise<ProfileResponse> {
  return request<ProfileResponse>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}
