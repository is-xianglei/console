import type { DefaultAvatar, ProfileResponse } from '@/interfaces/settings/profile/model'

/** 姓名最大长度，与后端 full_name 字段一致。 */
export const PROFILE_FULL_NAME_MAX = 128
/** 手机号最大长度，与后端 phone 字段一致。 */
export const PROFILE_PHONE_MAX = 32
/** mock 接口的模拟延迟（毫秒）。 */
export const PROFILE_MOCK_DELAY = 300

/** 8 张默认头像，文件在 public/avatars/。 */
export const DEFAULT_AVATARS: DefaultAvatar[] = Array.from({ length: 8 }, (_, index) => ({
  id: `avatar-${index + 1}`,
  url: `${import.meta.env.BASE_URL}avatars/avatar-${index + 1}.png`,
}))

// mock 数据，待 /api/users/me 对接后由 http 层替换为真实请求，页面无需改动。
const PROFILE_SEED: ProfileResponse = {
  id: 1,
  username: 'zhangsan',
  email: 'zhangsan@example.com',
  full_name: '张三',
  avatar_url: null,
  phone: '13800000000',
  email_verified: true,
  auth_provider: 'local',
  last_login_at: '2026-10-30T09:12:00Z',
  created_at: '2026-01-05T08:00:00Z',
  updated_at: '2026-10-30T09:12:00Z',
}

let mockProfile: ProfileResponse = { ...PROFILE_SEED }

/** 统一取数入口：返回内存中的模拟个人信息副本。 */
export function getMockProfile(): ProfileResponse {
  return { ...mockProfile }
}

/** 写入内存中的模拟个人信息，返回更新后的副本。 */
export function setMockProfile(patch: Partial<ProfileResponse>): ProfileResponse {
  mockProfile = { ...mockProfile, ...patch, updated_at: new Date().toISOString() }
  return { ...mockProfile }
}

/** 恢复初始模拟数据，供测试使用。 */
export function resetMockProfile(): void {
  mockProfile = { ...PROFILE_SEED }
}
