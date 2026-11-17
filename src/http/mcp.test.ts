import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './index'
import {
  authorizeMcpServer,
  completeMcpOAuth,
  createMcpServer,
  deleteMcpServer,
  getMcpServerDetail,
  getMcpServerList,
  getMcpServerToolList,
  probeMcpServer,
  revokeMcpOAuth,
  updateMcpServer,
} from './mcp'

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

describe('MCP server 管理接口', () => {
  it('列表、详情、工具快照走 GET', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse([])))
    vi.stubGlobal('fetch', fetchMock)

    await getMcpServerList()
    await getMcpServerDetail(5)
    await getMcpServerToolList(5)
    expect(fetchMock.mock.calls.map((call) => (call as unknown as [string])[0])).toEqual([
      '/api/mcp/servers',
      '/api/mcp/servers/5',
      '/api/mcp/servers/5/tools',
    ])
    expect(fetchCall(fetchMock).init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer test-token' }))
  })

  it('新建、修改、删除、探测使用对应方法和请求体', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse({})))
    vi.stubGlobal('fetch', fetchMock)

    await createMcpServer({ visibility: 'workspace', server_key: 'deepwiki', name: 'DeepWiki', url: 'https://mcp.deepwiki.com/mcp' })
    await updateMcpServer(5, { is_enabled: false })
    await deleteMcpServer(5)
    await probeMcpServer(5)

    expect(fetchCall(fetchMock, 0)).toMatchObject({ url: '/api/mcp/servers', init: { method: 'POST' } })
    expect(JSON.parse(String(fetchCall(fetchMock, 0).init.body))).toMatchObject({ server_key: 'deepwiki' })
    expect(fetchCall(fetchMock, 1)).toMatchObject({ url: '/api/mcp/servers/5', init: { method: 'PUT', body: '{"is_enabled":false}' } })
    expect(fetchCall(fetchMock, 2)).toMatchObject({ url: '/api/mcp/servers/5', init: { method: 'DELETE' } })
    expect(fetchCall(fetchMock, 3)).toMatchObject({ url: '/api/mcp/servers/5/probe', init: { method: 'POST' } })
  })

  it('OAuth 发起、完成、撤销', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse({ authorization_url: 'https://auth.example.com' })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(authorizeMcpServer(5)).resolves.toEqual({ authorization_url: 'https://auth.example.com' })
    await completeMcpOAuth({ state: 's', code: 'c' })
    await revokeMcpOAuth(5)

    expect(fetchCall(fetchMock, 0)).toMatchObject({ url: '/api/mcp/servers/5/oauth/authorize', init: { method: 'POST' } })
    expect(fetchCall(fetchMock, 1)).toMatchObject({ url: '/api/mcp/oauth/complete', init: { method: 'POST', body: '{"state":"s","code":"c"}' } })
    expect(fetchCall(fetchMock, 2)).toMatchObject({ url: '/api/mcp/servers/5/oauth', init: { method: 'DELETE' } })
  })

  it('后端错误转成 ApiError，保留中文信息', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ data: null, error: { message: 'server_key 已被占用', details: {} }, request_id: 'r' }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    ))))

    const error = await createMcpServer({ visibility: 'private', server_key: 'a', name: 'a', url: 'https://a.com' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ message: 'server_key 已被占用', status: 409 })
  })
})
