import { request } from './client'
import { streamPost, type SseHandlers } from './sse'
import type {
  HealthData,
  SessionMessageResponse,
  SessionResponse,
  SendMessageRequest,
  TaskResponse,
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

/** GET /api/tasks?session_id= — 查询会话任务编排列表 */
export function fetchTasks(sessionId: number | string): Promise<TaskResponse[]> {
  return request<TaskResponse[]>(`/tasks?session_id=${sessionId}`)
}

/**
 * POST /api/sessions/messages — 发送消息(SSE 流式响应)。
 * 返回 abort 函数。session_id 不传时后端自动建会话,
 * 首个 session_ready 事件会带回新会话 id。
 */
export function sendMessage(req: SendMessageRequest, handlers: SseHandlers): () => void {
  return streamPost('/sessions/messages', req, handlers)
}
