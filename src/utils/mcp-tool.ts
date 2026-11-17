import type { ToolSourceFault } from '@/interfaces/console/model'

/** MCP 工具在模型侧的名字：mcp__{server_key}__{原名}；server_key 里没有连续下划线，第一个 __ 就是分隔。 */
const MCP_TOOL_NAME = /^mcp__([a-z](?:_?[a-z0-9])*)__(.+)$/

export interface McpToolRef {
  serverKey: string
  /** 去掉 mcp__{server_key}__ 前缀后的工具名。 */
  toolName: string
}

/**
 * 判断一次工具调用是否来自 MCP server。
 * 实时事件带 source（"mcp:{server_key}"）；历史消息和快照不带，按命名规则从工具名识别。
 */
export function mcpToolRef(name: string, source?: string | null): McpToolRef | null {
  if (source?.startsWith('mcp:')) {
    const serverKey = source.slice(4)
    const prefix = `mcp__${serverKey}__`
    return { serverKey, toolName: name.startsWith(prefix) ? name.slice(prefix.length) : name }
  }
  if (source) return null
  const match = MCP_TOOL_NAME.exec(name)
  return match ? { serverKey: match[1]!, toolName: match[2]! } : null
}

/** 来源里的 server_key（"mcp:jira" → "jira"），对不上时原样返回。 */
export function sourceServerKey(source: string): string {
  return source.startsWith('mcp:') ? source.slice(4) : source
}

/** 故障的简短状态；授权范围不足和未授权都归 auth_required，用后端文案区分。 */
export function faultLabel(fault: ToolSourceFault): string {
  switch (fault.kind) {
    case 'auth_required': return fault.message.includes('范围不足') ? '授权范围不足' : '需要授权'
    case 'timeout': return '连接超时'
    case 'unavailable': return '无法连接'
    case 'invalid': return '配置无效'
    default: return '不可用'
  }
}

/** 同一来源同一种故障只保留一条（Workflow 等场景可能重复推送）。 */
export function mergeFaults(current: ToolSourceFault[], incoming: ToolSourceFault[]): ToolSourceFault[] {
  const seen = new Set(current.map((fault) => `${fault.source}|${fault.kind}`))
  const merged = [...current]
  for (const fault of incoming) {
    const key = `${fault.source}|${fault.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(fault)
  }
  return merged
}
