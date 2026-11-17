import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfileResponse } from '@/interfaces/settings/profile/model'
import { maskPhone, useSettingsProfile, validateAvatarUrl, validateProfileField } from './useSettingsProfile'

const toastAdd = vi.fn()
const getProfile = vi.fn()
const updateProfile = vi.fn()

vi.mock('@nuxt/ui/composables', () => ({
  useToast: () => ({ add: toastAdd }),
}))

vi.mock('@/http/settings/profile', () => ({
  getProfile: () => getProfile(),
  updateProfile: (payload: unknown) => updateProfile(payload),
}))

const baseProfile: ProfileResponse = {
  id: 1,
  username: 'zhangsan',
  email: 'zhangsan@example.com',
  full_name: '张三',
  avatar_url: null,
  phone: '13800000000',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

async function loaded() {
  const api = useSettingsProfile()
  await api.load()
  return api
}

beforeEach(() => {
  vi.clearAllMocks()
  getProfile.mockResolvedValue({ ...baseProfile })
  updateProfile.mockImplementation(async (payload: Partial<ProfileResponse>) => ({ ...baseProfile, ...payload }))
})

describe('maskPhone', () => {
  it('11 位手机号保留前 3 后 4', () => {
    expect(maskPhone('13800000000')).toBe('138****0000')
  })

  it('空值返回空串，短号码保留首尾', () => {
    expect(maskPhone(null)).toBe('')
    expect(maskPhone('  ')).toBe('')
    expect(maskPhone('12345')).toBe('1***5')
  })
})

describe('字段校验', () => {
  it('姓名必填且不超过 128 字符', () => {
    expect(validateProfileField('full_name', '  ')).toBe('请输入姓名')
    expect(validateProfileField('full_name', 'a'.repeat(129))).toContain('128')
    expect(validateProfileField('full_name', '李四')).toBe('')
  })

  it('手机号可空且不超过 32 字符', () => {
    expect(validateProfileField('phone', '')).toBe('')
    expect(validateProfileField('phone', '1'.repeat(33))).toContain('32')
  })

  it('头像 URL 只接受 http(s) 或站内绝对路径', () => {
    expect(validateAvatarUrl('https://example.com/a.png')).toBe('')
    expect(validateAvatarUrl('/avatars/avatar-1.png')).toBe('')
    expect(validateAvatarUrl('javascript:alert(1)')).not.toBe('')
    expect(validateAvatarUrl('//evil.com/a.png')).not.toBe('')
    expect(validateAvatarUrl('')).toBe('请输入头像 URL')
  })
})

describe('useSettingsProfile', () => {
  it('值没变时直接退出编辑，不调用接口', async () => {
    const api = await loaded()
    api.startEdit('full_name')
    expect(api.draft.value).toBe('张三')
    api.draft.value = ' 张三 '
    await api.commitEdit()
    expect(updateProfile).not.toHaveBeenCalled()
    expect(api.editingField.value).toBeNull()
  })

  it('校验失败时保留编辑状态并给出错误', async () => {
    const api = await loaded()
    api.startEdit('full_name')
    api.draft.value = ''
    await api.commitEdit()
    expect(api.fieldError.value).toBe('请输入姓名')
    expect(api.editingField.value).toBe('full_name')
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('保存成功后更新资料、退出编辑并提示', async () => {
    const api = await loaded()
    api.startEdit('phone')
    api.draft.value = ''
    await api.commitEdit()
    expect(updateProfile).toHaveBeenCalledWith({ phone: null })
    expect(api.profile.value?.phone).toBeNull()
    expect(api.editingField.value).toBeNull()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: '手机号已更新', color: 'success' }))
  })

  it('保存失败时保留编辑状态并提示错误', async () => {
    updateProfile.mockRejectedValueOnce(new Error('网络错误'))
    const api = await loaded()
    api.startEdit('full_name')
    api.draft.value = '李四'
    await api.commitEdit()
    expect(api.editingField.value).toBe('full_name')
    expect(api.savingField.value).toBe(false)
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error', description: '网络错误' }))
  })

  it('saveAvatar 与当前头像相同时不请求', async () => {
    const api = await loaded()
    expect(await api.saveAvatar('/avatars/avatar-1.png')).toBe(true)
    expect(updateProfile).toHaveBeenCalledWith({ avatar_url: '/avatars/avatar-1.png' })
    updateProfile.mockClear()
    expect(await api.saveAvatar('/avatars/avatar-1.png')).toBe(true)
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('姓名为空时显示用户名', async () => {
    getProfile.mockResolvedValueOnce({ ...baseProfile, full_name: null })
    const api = await loaded()
    expect(api.displayName.value).toBe('zhangsan')
  })
})
