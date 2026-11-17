import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProfile, updateProfile } from './profile'

function makeResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data, error: null, request_id: 'test-request' }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => 'test-token' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('个人信息接口', () => {
  it('从 /users/me 解包当前用户', async () => {
    const profile = { id: 1, username: 'zhangsan', email: 'zhangsan@example.com' }
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse(profile)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getProfile()).resolves.toEqual(profile)
    expect(fetchMock).toHaveBeenCalledWith('/api/users/me', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    }))
  })

  it('PATCH /users/me 发送编辑字段', async () => {
    const updated = { id: 1, username: 'zhangsan', full_name: '李四', phone: null }
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse(updated)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(updateProfile({ full_name: '李四', phone: null })).resolves.toEqual(updated)
    expect(fetchMock).toHaveBeenCalledWith('/api/users/me', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ full_name: '李四', phone: null }),
    }))
  })
})
