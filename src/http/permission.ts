import type {
  PermissionRuleCreate,
  PermissionRuleDeleteResult,
} from '@/interfaces/permission/api'
import type { PermissionRule } from '@/interfaces/permission/model'
import { request } from './index'

/** 查询权限规则列表，可按作用域或会话过滤。 */
export function getPermissionRuleList(params?: {
  scope?: string
  sessionId?: number | string
}): Promise<PermissionRule[]> {
  const query = new URLSearchParams()
  if (params?.scope) query.set('scope', params.scope)
  if (params?.sessionId != null) query.set('session_id', String(params.sessionId))
  const queryString = query.toString()
  return request<PermissionRule[]>(`/permissions${queryString ? `?${queryString}` : ''}`)
}

/** 新增或更新一条权限规则。 */
export function updatePermissionRule(payload: PermissionRuleCreate): Promise<PermissionRule> {
  return request<PermissionRule>('/permissions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 删除一条权限规则。 */
export function deletePermissionRule(
  ruleId: number | string,
): Promise<PermissionRuleDeleteResult> {
  return request<PermissionRuleDeleteResult>(`/permissions/${ruleId}`, { method: 'DELETE' })
}
