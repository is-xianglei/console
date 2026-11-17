import { describe, expect, it } from 'vitest'
import type { McpServerResponse, McpToolResponse } from '@/interfaces/mcp/api'
import {
  bindableToolNames,
  bindingsToDrafts,
  buildMcpCreatePayload,
  buildMcpUpdatePayload,
  draftsToBindings,
  emptyMcpForm,
  isBindableMcpServer,
  mcpMetaText,
  mcpResponseToForm,
  mcpProbeStatus,
  mcpStatus,
  sameMcpBindings,
  validateMcpForm,
} from './mcp'

const server: McpServerResponse = {
  id: 5,
  server_key: 'jira',
  visibility: 'workspace',
  name: 'Jira',
  description: null,
  url: 'https://mcp.example.com/jira',
  auth_type: 'static_headers',
  approval_mode: 'trust_annotations',
  tool_allowlist: ['search'],
  tool_denylist: [],
  call_timeout_seconds: 30,
  config_rev: 2,
  is_enabled: true,
  writable: true,
  headers: null,
  tool_count: 4,
  last_probe_at: '2026-11-14T00:00:00Z',
  last_probe_error: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-14T00:00:00Z',
}

function tool(name: string, filteredOut = false): McpToolResponse {
  return { name, description: '', input_schema_sha256: 'x', model_name: `mcp__jira__${name}`, filtered_out: filteredOut, requires_approval: true }
}

describe('MCP 表单校验', () => {
  it('新建时校验名称、标识格式、地址和请求头', () => {
    const form = emptyMcpForm(true)
    form.serverKey = 'Bad_Key_'
    form.url = 'ftp://x'
    form.authType = 'static_headers'
    const fields = validateMcpForm(form).map((issue) => issue.field)
    expect(fields).toEqual(['name', 'serverKey', 'url', 'headers'])
  })

  it('普通成员默认只能建私有 server', () => {
    expect(emptyMcpForm(false).visibility).toBe('private')
    expect(emptyMcpForm(true).visibility).toBe('workspace')
  })

  it('请求头只填了一半时报错，超时必须是正整数', () => {
    const form = { ...emptyMcpForm(true), name: 'a', serverKey: 'a', url: 'https://a.com', authType: 'static_headers' as const }
    form.headers = [{ name: 'X-Key', value: '' }]
    form.callTimeoutSeconds = '0'
    expect(validateMcpForm(form).map((issue) => issue.field)).toEqual(['headers', 'callTimeoutSeconds'])
  })

  it('编辑原本就是请求头认证的 server 时请求头可以留空', () => {
    const form = mcpResponseToForm(server)
    expect(validateMcpForm(form)).toEqual([])
    form.originalAuthType = 'none'
    expect(validateMcpForm(form).map((issue) => issue.field)).toEqual(['headers'])
  })
})

describe('MCP 请求载荷', () => {
  it('新建载荷带可见范围和标识，只有请求头认证才带 headers', () => {
    const form = { ...emptyMcpForm(true), name: ' DeepWiki ', serverKey: 'deepwiki', url: 'https://mcp.deepwiki.com/mcp ' }
    form.headers = [{ name: 'X-Key', value: 'secret' }]
    expect(buildMcpCreatePayload(form, true)).toEqual({
      visibility: 'workspace',
      server_key: 'deepwiki',
      name: 'DeepWiki',
      description: null,
      url: 'https://mcp.deepwiki.com/mcp',
      auth_type: 'none',
      approval_mode: 'always',
      tool_allowlist: [],
      tool_denylist: [],
      call_timeout_seconds: null,
      is_enabled: true,
    })
    form.authType = 'static_headers'
    expect(buildMcpCreatePayload(form, false).headers).toEqual({ 'X-Key': 'secret' })
  })

  it('修改载荷不带 visibility / server_key；请求头留空时不提交，沿用原值', () => {
    const form = mcpResponseToForm(server)
    const payload = buildMcpUpdatePayload(form, true)
    expect(payload).not.toHaveProperty('visibility')
    expect(payload).not.toHaveProperty('server_key')
    expect(payload).not.toHaveProperty('headers')
    expect(payload).toMatchObject({ auth_type: 'static_headers', call_timeout_seconds: 30, tool_allowlist: ['search'] })

    form.headers = [{ name: 'Authorization', value: 'Bearer x' }, { name: '', value: '' }]
    expect(buildMcpUpdatePayload(form, true).headers).toEqual({ Authorization: 'Bearer x' })
  })

  it('清空超时提交 null', () => {
    const form = mcpResponseToForm(server)
    form.callTimeoutSeconds = ''
    expect(buildMcpUpdatePayload(form, true).call_timeout_seconds).toBeNull()
  })
})

describe('MCP 状态', () => {
  it('探测失败优先于授权状态', () => {
    expect(mcpStatus({ ...server, last_probe_error: '连接超时' })).toMatchObject({ tone: 'error', label: '连接超时' })
  })

  it('OAuth 未授权或过期时提示授权', () => {
    const oauth = { ...server, auth_type: 'oauth', oauth: { status: 'unauthorized' as const } }
    expect(mcpStatus(oauth)).toMatchObject({ tone: 'warning', label: '未授权' })
    expect(mcpMetaText(oauth)).toBe('未授权')
    expect(mcpMetaText({ ...oauth, oauth: { status: 'expired' } })).toBe('授权已过期')
    expect(mcpMetaText({ ...oauth, oauth: { status: 'authorized' } })).toBe('4 工具')
  })

  it('探测行只看探测结果，不受授权状态影响', () => {
    const oauth = { ...server, auth_type: 'oauth', oauth: { status: 'unauthorized' as const } }
    expect(mcpProbeStatus(oauth).tone).toBe('success')
    expect(mcpProbeStatus({ ...oauth, last_probe_error: '元数据发现失败' })).toMatchObject({ tone: 'error', label: '元数据发现失败' })
  })

  it('从未探测时显示未探测', () => {
    expect(mcpStatus({ ...server, last_probe_at: null }).tone).toBe('muted')
    expect(mcpStatus(server).tone).toBe('success')
  })
})

describe('Agent MCP 绑定', () => {
  it('只有已启用的共享 server 可以绑定', () => {
    expect(isBindableMcpServer(server)).toBe(true)
    expect(isBindableMcpServer({ ...server, visibility: 'private' })).toBe(false)
    expect(isBindableMcpServer({ ...server, is_enabled: false })).toBe(false)
  })

  it('空工具列表与 null 互转', () => {
    const drafts = bindingsToDrafts([{ server_id: 1, tool_names: null }, { server_id: 2, tool_names: ['a'] }])
    expect(drafts).toEqual([{ serverId: 1, toolNames: [] }, { serverId: 2, toolNames: ['a'] }])
    expect(draftsToBindings(drafts)).toEqual([{ server_id: 1, tool_names: null }, { server_id: 2, tool_names: ['a'] }])
  })

  it('绑定比较与顺序无关', () => {
    expect(sameMcpBindings([{ server_id: 1, tool_names: ['b', 'a'] }], [{ server_id: 1, tool_names: ['a', 'b'] }])).toBe(true)
    expect(sameMcpBindings(undefined, [])).toBe(true)
    expect(sameMcpBindings([{ server_id: 1, tool_names: null }], [{ server_id: 1, tool_names: ['a'] }])).toBe(false)
  })

  it('可选工具排除被过滤的，但保留已选的', () => {
    expect(bindableToolNames([tool('a'), tool('b', true)], [])).toEqual(['a'])
    expect(bindableToolNames([tool('a'), tool('b', true)], ['b', 'gone'])).toEqual(['a', 'b', 'gone'])
  })
})
