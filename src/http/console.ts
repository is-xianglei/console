import { fetchEventSource } from '@microsoft/fetch-event-source'
import type { SessionDeleteResult, SendMessageRequest, SseHandlers } from '../interfaces/console/api'
import type {
  ApprovalDecision,
  HealthData,
  SessionMessageResponse,
  SessionResponse,
  SseEvent,
} from '../interfaces/console/model'
import { request } from './index'

const BASE = '/api'

/** 致命错误抛出后终止 SSE，避免流式任务被自动重放。 */
class FatalError extends Error {}

/** 以 POST 建立 SSE 流，并返回主动中止函数。 */
function streamPost(path: string, body: unknown, handlers: SseHandlers): () => void {
  const controller = new AbortController()
  const token = localStorage.getItem('auth_token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  fetchEventSource(BASE + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
    openWhenHidden: true,
    async onopen(response) {
      const contentType = response.headers.get('content-type') ?? ''
      if (response.ok && contentType.includes('text/event-stream')) return
      throw new FatalError(`SSE 打开失败: HTTP ${response.status}`)
    },
    onmessage(message) {
      if (!message.data || message.data === '[DONE]') return
      try {
        handlers.onEvent(JSON.parse(message.data) as SseEvent)
      } catch {
        // 心跳、注释或损坏帧不会中断仍然有效的事件流。
      }
    },
    onclose() {
      handlers.onDone?.()
    },
    onerror(error) {
      handlers.onError?.(error as Error)
      throw error
    },
  }).catch(() => {
    // 错误已通过 onError 上报，此处只消费被拒绝的 Promise。
  })

  return () => controller.abort()
}

/** GET /api/health — 健康检查 */
export function getHealthDetail(): Promise<HealthData> {
  return request<HealthData>('/health')
}

/** GET /api/sessions — 查询会话列表 */
export function getSessionList(): Promise<SessionResponse[]> {
  return request<SessionResponse[]>('/sessions')
}

/** GET /api/sessions/{id}/messages — 查询会话历史消息 */
export function getSessionMessageList(
  sessionId: number | string,
): Promise<SessionMessageResponse[]> {
  return request<SessionMessageResponse[]>(`/sessions/${sessionId}/messages`)
}

/** PATCH /api/sessions/{id} — 重命名会话 */
export function updateSession(
  sessionId: number | string,
  title: string,
): Promise<SessionResponse> {
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
export function deleteSessionList(ids: number[]): Promise<SessionDeleteResult> {
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
