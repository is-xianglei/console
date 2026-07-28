export type PermissionScope = 'global' | 'session'
export type PermissionBehavior = 'allow' | 'ask' | 'deny'

/** 持久化的工具权限规则。 */
export interface PermissionRule {
  id: number
  scope: PermissionScope | string
  session_id: number | null
  tool_name: string
  behavior: PermissionBehavior | string
  matcher: Record<string, unknown> | null
  source: string
  created_at: string
  updated_at: string
}
