import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './index'
import {
  createTeamDefinition,
  deleteTeamDefinition,
  getTeamDefinitionDetail,
  getTeamDefinitionList,
  updateTeamDefinition,
} from './team-definition'

function makeResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data, error: null, request_id: 'test-request' }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function fetchCall(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const call = fetchMock.mock.calls[index] as [string, RequestInit]
  return { url: call[0], init: call[1] }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => 'test-token' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Team 定义接口', () => {
  it('列表带筛选和分页参数，详情走 GET', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse({ items: [], total: 0, limit: 20, offset: 0 })))
    vi.stubGlobal('fetch', fetchMock)

    await getTeamDefinitionList()
    await getTeamDefinitionList({ keyword: '评审', is_enabled: false, limit: 100, offset: 100 })
    await getTeamDefinitionDetail(7)

    expect(fetchMock.mock.calls.map((call) => (call as unknown as [string])[0])).toEqual([
      '/api/team-definitions',
      '/api/team-definitions?keyword=%E8%AF%84%E5%AE%A1&is_enabled=false&limit=100&offset=100',
      '/api/team-definitions/7',
    ])
    expect(fetchCall(fetchMock).init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer test-token' }))
  })

  it('新建 POST、修改 PATCH、删除 DELETE', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse({})))
    vi.stubGlobal('fetch', fetchMock)

    const members = [{ agent_id: 3, name: 'writer-a', role: '撰写初稿', sort_order: 0 }]
    await createTeamDefinition({ name: '内容评审组', is_enabled: true, members })
    await updateTeamDefinition(7, { description: null })
    await deleteTeamDefinition(7)

    expect(fetchCall(fetchMock, 0)).toMatchObject({ url: '/api/team-definitions', init: { method: 'POST' } })
    expect(JSON.parse(String(fetchCall(fetchMock, 0).init.body))).toEqual({ name: '内容评审组', is_enabled: true, members })
    expect(fetchCall(fetchMock, 1)).toMatchObject({ url: '/api/team-definitions/7', init: { method: 'PATCH', body: '{"description":null}' } })
    expect(fetchCall(fetchMock, 2)).toMatchObject({ url: '/api/team-definitions/7', init: { method: 'DELETE' } })
  })

  it('后端错误转成 ApiError，保留 details', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ data: null, error: { message: '绑定的Agent不存在', details: { agent_ids: [9] } }, request_id: 'r' }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    ))))

    const error = await createTeamDefinition({ name: 'a', members: [{ agent_id: 9, name: 'a', role: 'a' }] }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ message: '绑定的Agent不存在', status: 404, details: { agent_ids: [9] } })
  })
})
