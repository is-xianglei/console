import { request } from './client'
import { streamPost, type SseHandlers } from './sse'
import type {
  ApprovalDecision,
  HealthData,
  PermissionRule,
  PermissionRuleCreate,
  PermissionRuleDeleteResult,
  SessionDeleteResult,
  SessionMessageResponse,
  SessionResponse,
  SendMessageRequest,
} from './types'

/** GET /api/health — 健康检查 */
export function fetchHealth(): Promise<HealthData> {
  return request<HealthData>('/health')
}

/** GET /api/sessions — 查询会话列表 */
export function fetchSessions(): Promise<SessionResponse[]> {
  return request<SessionResponse[]>('/sessions')
}

/** GET /api/sessions/{id}/messages — 查询会话历史消息 */
export function fetchMessages(sessionId: number | string): Promise<SessionMessageResponse[]> {
  return request<SessionMessageResponse[]>(`/sessions/${sessionId}/messages`)
}

/** PATCH /api/sessions/{id} — 重命名会话 */
export function renameSession(sessionId: number | string, title: string): Promise<SessionResponse> {
  return request<SessionResponse>(`/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}

/** DELETE /api/sessions/{id} — 物理删除单个会话 */
export function deleteSession(sessionId: number | string): Promise<SessionDeleteResult> {
  return request<SessionDeleteResult>(`/sessions/${sessionId}`, { method: 'DELETE' })
}

/** POST /api/sessions/batch-delete — 批量物理删除会话 */
export function batchDeleteSessions(ids: number[]): Promise<SessionDeleteResult> {
  return request<SessionDeleteResult>('/sessions/batch-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}

/**
 * POST /api/sessions/messages — 发送消息(SSE 流式响应)。
 * 返回 abort 函数。session_id 不传时后端自动建会话,
 * 首个 session_ready 事件会带回新会话 id。
 */
export function sendMessage(req: SendMessageRequest, handlers: SseHandlers): () => void {
  return streamPost('/sessions/messages', req, handlers)
}

/**
 * POST /api/sessions/{id}/approvals — 对挂起的工具审批作出裁决并恢复执行(SSE 流式响应)。
 * 与 sendMessage 同构:返回 abort 函数,恢复后的执行事件从这条新流继续推。
 */
export function respondApproval(
  sessionId: number | string,
  requestId: string,
  decision: ApprovalDecision,
  handlers: SseHandlers,
  opts?: { updatedInput?: Record<string, unknown>; alwaysScope?: 'session' | 'global' },
): () => void {
  return streamPost(
    `/sessions/${sessionId}/approvals`,
    {
      request_id: requestId,
      decision,
      updated_input: opts?.updatedInput,
      always_scope: opts?.alwaysScope ?? 'session',
    },
    handlers,
  )
}

// ===== 权限规则管理 =====

/** GET /api/permissions — 查询权限规则(可按 scope / session_id 过滤) */
export function listPermissionRules(params?: {
  scope?: string
  sessionId?: number | string
}): Promise<PermissionRule[]> {
  const q = new URLSearchParams()
  if (params?.scope) q.set('scope', params.scope)
  if (params?.sessionId != null) q.set('session_id', String(params.sessionId))
  const qs = q.toString()
  return request<PermissionRule[]>(`/permissions${qs ? '?' + qs : ''}`)
}

/** POST /api/permissions — 新增或更新一条权限规则 */
export function upsertPermissionRule(payload: PermissionRuleCreate): Promise<PermissionRule> {
  return request<PermissionRule>('/permissions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** DELETE /api/permissions/{id} — 删除一条权限规则 */
export function deletePermissionRule(
  ruleId: number | string,
): Promise<PermissionRuleDeleteResult> {
  return request<PermissionRuleDeleteResult>(`/permissions/${ruleId}`, { method: 'DELETE' })
}
