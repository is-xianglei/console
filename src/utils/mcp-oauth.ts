/** 发起 OAuth 授权前记下 server id 和回跳位置；回调页据此回到原页面（MCP 详情或聊天会话）。 */
const STORAGE_KEY = 'mcp_oauth_pending'

export interface PendingOAuth {
  serverId: number
  /** 站内路径；没有时回 server 详情。 */
  returnTo: string | null
}

/** 只接受站内路径，避免把回跳地址带到别的站点。 */
function safeReturnTo(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : null
}

export function rememberOAuthServer(serverId: number, returnTo?: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ serverId, returnTo: safeReturnTo(returnTo) }))
  } catch {
    // 隐私模式等场景写不进去时，回调后只能回列表。
  }
}

export function takeOAuthServer(): PendingOAuth | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { serverId?: unknown; returnTo?: unknown }
    const serverId = Number(parsed.serverId)
    if (!Number.isInteger(serverId) || serverId <= 0) return null
    return { serverId, returnTo: safeReturnTo(parsed.returnTo) }
  } catch {
    return null
  }
}
