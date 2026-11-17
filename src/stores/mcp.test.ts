import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../http'
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
} from '../http/mcp'
import type { McpServerResponse } from '../interfaces/mcp/api'
import { useMcpStore } from './mcp'

vi.mock('../http/mcp', () => ({
  authorizeMcpServer: vi.fn(),
  completeMcpOAuth: vi.fn(),
  createMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
  getMcpServerDetail: vi.fn(),
  getMcpServerList: vi.fn(),
  getMcpServerToolList: vi.fn(),
  probeMcpServer: vi.fn(),
  revokeMcpOAuth: vi.fn(),
  updateMcpServer: vi.fn(),
}))

const server: McpServerResponse = {
  id: 5,
  server_key: 'deepwiki',
  visibility: 'workspace',
  name: 'DeepWiki',
  url: 'https://mcp.deepwiki.com/mcp',
  auth_type: 'none',
  approval_mode: 'always',
  tool_allowlist: [],
  tool_denylist: [],
  config_rev: 1,
  is_enabled: true,
  writable: true,
  tool_count: 3,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
}
const tool = { name: 'ask_question', description: '', input_schema_sha256: 'x', model_name: 'mcp__deepwiki__ask_question', filtered_out: false, requires_approval: true }

describe('mcp store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() })
    setActivePinia(createPinia())
    vi.resetAllMocks()
    vi.mocked(getMcpServerList).mockResolvedValue([server])
  })

  it('加载列表，失败时返回后端信息并清空', async () => {
    const store = useMcpStore()
    expect(await store.loadServers()).toBeNull()
    expect(store.state.items).toEqual([server])

    vi.mocked(getMcpServerList).mockRejectedValueOnce(new ApiError('MCP 功能未启用', 'FORBIDDEN', 403))
    expect(await store.loadServers()).toBe('MCP 功能未启用')
    expect(store.state.items).toEqual([])
  })

  it('详情只有 404 才算不存在', async () => {
    const store = useMcpStore()
    vi.mocked(getMcpServerDetail).mockRejectedValueOnce(new ApiError('MCP server 不存在', 'NOT_FOUND', 404))
    expect(await store.loadServerDetail(5)).toEqual({ status: 'not-found' })
    vi.mocked(getMcpServerDetail).mockRejectedValueOnce(new ApiError('服务器错误', 'ERROR', 500))
    expect(await store.loadServerDetail(5)).toEqual({ status: 'error', message: '服务器错误' })
  })

  it('新建成功写入列表，失败返回探测错误', async () => {
    const store = useMcpStore()
    vi.mocked(createMcpServer).mockResolvedValueOnce({ server, tools: [] })
    const created = await store.saveServer({ create: { visibility: 'workspace', server_key: 'deepwiki', name: 'DeepWiki', url: server.url } })
    expect(created).toEqual({ item: server, error: null })
    expect(store.state.items).toEqual([server])

    vi.mocked(createMcpServer).mockRejectedValueOnce(new ApiError('探测失败：连接超时', 'BAD_REQUEST', 400))
    const failed = await store.saveServer({ create: { visibility: 'workspace', server_key: 'x', name: 'x', url: server.url } })
    expect(failed).toEqual({ item: null, error: '探测失败：连接超时' })
    expect(store.state.saving).toBe(false)
  })

  it('启停只提交 is_enabled，失败回滚', async () => {
    const store = useMcpStore()
    await store.loadServers()
    vi.mocked(updateMcpServer).mockRejectedValueOnce(new ApiError('无权执行该工作区操作', 'FORBIDDEN', 403))
    expect(await store.setServerEnabled(5, false)).toBe('无权执行该工作区操作')
    expect(updateMcpServer).toHaveBeenCalledWith(5, { is_enabled: false })
    expect(store.state.items[0]?.is_enabled).toBe(true)
    expect(store.state.togglingIds).toEqual([])
  })

  it('工具快照按 server 缓存，探测成功后失效', async () => {
    const store = useMcpStore()
    vi.mocked(getMcpServerToolList).mockResolvedValue([tool])
    await store.loadTools(5)
    await store.loadTools(5)
    expect(getMcpServerToolList).toHaveBeenCalledOnce()

    vi.mocked(probeMcpServer).mockResolvedValueOnce({ ok: true, server: { ...server, config_rev: 2 }, diff: { added: [], removed: [], schema_changed: [] } })
    const outcome = await store.probeServer(5)
    expect(outcome?.result?.ok).toBe(true)
    expect(store.state.toolsByServer[5]).toBeUndefined()
    expect(store.state.items[0]?.config_rev).toBe(2)
  })

  it('删除后移出列表', async () => {
    const store = useMcpStore()
    await store.loadServers()
    vi.mocked(deleteMcpServer).mockResolvedValueOnce({ deleted: true })
    expect(await store.removeServer(5)).toBeNull()
    expect(store.state.items).toEqual([])
  })

  it('OAuth：发起返回地址，完成写回 server，撤销后重读详情', async () => {
    const store = useMcpStore()
    vi.mocked(authorizeMcpServer).mockResolvedValueOnce({ authorization_url: 'https://auth.example.com/authorize' })
    expect(await store.beginAuthorization(5)).toEqual({ url: 'https://auth.example.com/authorize', error: null })

    vi.mocked(authorizeMcpServer).mockRejectedValueOnce(new ApiError('未配置 AGENTOS_PUBLIC_BASE_URL', 'ERROR', 500))
    expect(await store.beginAuthorization(5)).toEqual({ url: null, error: '未配置 AGENTOS_PUBLIC_BASE_URL' })

    const authorized = { ...server, auth_type: 'oauth', oauth: { status: 'authorized' as const } }
    vi.mocked(completeMcpOAuth).mockResolvedValueOnce(authorized)
    expect(await store.completeAuthorization({ state: 's', code: 'c' })).toEqual({ item: authorized, error: null })

    vi.mocked(revokeMcpOAuth).mockResolvedValueOnce({ revoked: true })
    vi.mocked(getMcpServerDetail).mockResolvedValueOnce({ ...authorized, oauth: { status: 'unauthorized' } })
    expect(await store.revokeAuthorization(5)).toBeNull()
    expect(store.state.items[0]?.oauth?.status).toBe('unauthorized')
  })

  it('重置后丢弃旧工作区的列表响应', async () => {
    const store = useMcpStore()
    let resolveList!: (value: McpServerResponse[]) => void
    vi.mocked(getMcpServerList).mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve }))
    const loading = store.loadServers()
    store.resetMcp()
    resolveList([server])
    expect(await loading).toBeNull()
    expect(store.state.items).toEqual([])
  })
})
