import { fetchEventSource } from '@microsoft/fetch-event-source'
import type {
  ActiveTurnResponse,
  InteractionResolutionRequest,
  PendingInteractionResponse,
  RuntimeSuspensionResponse,
  SessionDeleteResult,
  ShareSessionRequest,
  ShareSessionResponse,
  SendMessageRequest,
  SseHandlers,
  TurnCancelResponse,
} from '../interfaces/console/api'
import type {
  SessionMessageResponse,
  SessionResponse,
  SseEvent,
  TaskResponse,
} from '../interfaces/console/model'
import { ApiError, errorFromBody, request } from './index'

const BASE = '/api'

/** 建流被 HTTP 拒绝时保留后端错误，不把业务拒绝误当成流式断线。 */
export class SseOpenError extends ApiError {}

async function requireEventStream(response: Response): Promise<void> {
  const contentType = response.headers.get('content-type') ?? ''
  if (response.ok && contentType.includes('text/event-stream')) return
  const body: unknown = await response.json().catch(() => null)
  const error = errorFromBody(body, response.status)
  throw new SseOpenError(error.message, error.code, error.status, error.details)
}

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
    onopen: requireEventStream,
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

/**
 * 以 GET 建立订阅 SSE（轮次、队友激活、会话团队通知流）。订阅与执行解耦，断开连接不会取消后端执行。
 * 帧体按 T 解析，默认是轮次事件信封。
 */
export function streamGet<T = SseEvent>(path: string, handlers: SseHandlers<T>): () => void {
  const controller = new AbortController()
  const token = localStorage.getItem('auth_token')
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  fetchEventSource(BASE + path, {
    method: 'GET',
    headers,
    signal: controller.signal,
    openWhenHidden: true,
    onopen: requireEventStream,
    onmessage(message) {
      if (!message.data || message.data === '[DONE]') return
      try {
        handlers.onEvent(JSON.parse(message.data) as T)
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

/** GET /api/tasks?session_id=... — 恢复会话任务，包括已结束轮次。 */
export function getSessionTasks(sessionId: number | string): Promise<TaskResponse[]> {
  const query = new URLSearchParams({ session_id: String(sessionId) })
  return request<TaskResponse[]>('/tasks?' + query)
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

/** 保存模式、模型及思考强度，不触发新一轮执行。 */
export function updateSessionChatSelection(
  sessionId: number | string,
  payload: import('../interfaces/settings/models/model').ChatModelSelection,
): Promise<SessionResponse> {
  return request(`/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

/** POST /api/sessions/{id}/archive — 归档会话。 */
export function archiveSession(sessionId: number | string): Promise<SessionResponse> {
  return request<SessionResponse>(`/sessions/${sessionId}/archive`, { method: 'POST' })
}

/** POST /api/sessions/{id}/share — 覆盖会话的完整共享范围。 */
export function shareSession(
  sessionId: number | string,
  payload: ShareSessionRequest,
): Promise<ShareSessionResponse> {
  return request<ShareSessionResponse>(`/sessions/${sessionId}/share`, {
    method: 'POST',
    body: JSON.stringify(payload),
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

/** 查询会话当前待处理的人工交互，页面重建时可恢复交互卡。 */
export function getPendingInteraction(
  sessionId: number | string,
): Promise<PendingInteractionResponse | null> {
  return request<PendingInteractionResponse | null>(`/interactions/sessions/${sessionId}/pending`)
}

/**
 * 响应人工交互并建立新的恢复 SSE 流。
 * 旧流在 interaction_request 后会正常关闭，后续事件只从本流继续推送。
 */
export function respondInteraction(
  sessionId: number | string,
  requestId: string,
  payload: InteractionResolutionRequest,
  handlers: SseHandlers,
): () => void {
  return streamPost(
    `/interactions/sessions/${sessionId}/requests/${encodeURIComponent(requestId)}/resolve`,
    payload,
    handlers,
  )
}

/** 取消会话暂停点以及其中尚未处理的交互请求。 */
export function cancelInteraction(
  sessionId: number | string,
  suspensionId: string,
): Promise<RuntimeSuspensionResponse> {
  return request<RuntimeSuspensionResponse>(
    `/interactions/sessions/${sessionId}/suspensions/${encodeURIComponent(suspensionId)}/cancel`,
    { method: 'POST' },
  )
}

/** 查询会话最新轮次；刷新或断流后据此决定是否续订阅。 */
export function getActiveTurn(sessionId: number | string): Promise<ActiveTurnResponse | null> {
  return request<ActiveTurnResponse | null>(`/sessions/${sessionId}/active-turn`)
}

/** 订阅指定轮次的快照续播流。 */
export function subscribeTurn(
  sessionId: number | string,
  turnId: string,
  handlers: SseHandlers,
): () => void {
  return streamGet(
    `/sessions/${sessionId}/turns/${encodeURIComponent(turnId)}/subscription`,
    handlers,
  )
}

/** 真正取消后端轮次执行；仅断开 SSE 不会停止执行。 */
export function cancelTurn(
  sessionId: number | string,
  turnId: string,
): Promise<TurnCancelResponse> {
  return request<TurnCancelResponse>(
    `/sessions/${sessionId}/turns/${encodeURIComponent(turnId)}/cancel`,
    { method: 'POST' },
  )
}
