import type { PermissionBehavior, PermissionScope } from './model'

/** 工具权限规则写入请求。 */
export interface PermissionRuleCreate {
  scope: PermissionScope
  session_id?: number | null
  tool_name: string
  behavior: PermissionBehavior
  matcher?: Record<string, unknown> | null
}

/** 权限规则删除结果。 */
export interface PermissionRuleDeleteResult {
  deleted: number
}
