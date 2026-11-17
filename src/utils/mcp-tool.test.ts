import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { faultLabel, mcpToolRef, mergeFaults } from './mcp-tool'
import { rememberOAuthServer, takeOAuthServer } from './mcp-oauth'

describe('mcpToolRef', () => {
  it('实时事件按 source 识别并去掉前缀', () => {
    expect(mcpToolRef('mcp__deepwiki__ask_wiki_question', 'mcp:deepwiki')).toEqual({ serverKey: 'deepwiki', toolName: 'ask_wiki_question' })
  })

  it('历史消息没有 source 时按命名规则识别，server_key 可含单个下划线', () => {
    expect(mcpToolRef('mcp__linear_test__list_issues')).toEqual({ serverKey: 'linear_test', toolName: 'list_issues' })
    expect(mcpToolRef('mcp__jira__search__v2')).toEqual({ serverKey: 'jira', toolName: 'search__v2' })
  })

  it('内置工具和非 MCP 来源返回 null', () => {
    expect(mcpToolRef('Read')).toBeNull()
    expect(mcpToolRef('mcp__Bad__x')).toBeNull()
    expect(mcpToolRef('mcp__jira__x', 'skill:abc')).toBeNull()
  })
})

describe('tool_sources 故障', () => {
  const auth = { source: 'mcp:linear', server_id: 3, kind: 'auth_required', message: '需要授权：请到 MCP 管理页为该 server 授权后再试' }

  it('按 kind 给出简短状态，授权范围不足单独区分', () => {
    expect(faultLabel(auth)).toBe('需要授权')
    expect(faultLabel({ ...auth, message: '授权范围不足：请到 MCP 管理页为该 server 重新授权' })).toBe('授权范围不足')
    expect(faultLabel({ ...auth, kind: 'timeout' })).toBe('连接超时')
    expect(faultLabel({ ...auth, kind: 'unavailable' })).toBe('无法连接')
  })

  it('同来源同故障去重', () => {
    const timeout = { ...auth, source: 'mcp:jira', server_id: 4, kind: 'timeout', message: '获取超时' }
    expect(mergeFaults([auth], [auth, timeout])).toEqual([auth, timeout])
  })
})

describe('OAuth 回跳记录', () => {
  let store: Record<string, string>
  beforeEach(() => {
    store = {}
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('记下 server 和站内回跳路径，读一次后清除', () => {
    rememberOAuthServer(3, '/chat/113')
    expect(takeOAuthServer()).toEqual({ serverId: 3, returnTo: '/chat/113' })
    expect(takeOAuthServer()).toBeNull()
  })

  it('站外地址不作为回跳路径', () => {
    rememberOAuthServer(3, '//evil.example.com/x')
    expect(takeOAuthServer()).toEqual({ serverId: 3, returnTo: null })
    rememberOAuthServer(4)
    expect(takeOAuthServer()).toEqual({ serverId: 4, returnTo: null })
  })
})
