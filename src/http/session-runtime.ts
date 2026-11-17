import type { SseHandlers } from '../interfaces/console/api'
import type { SseEvent } from '../interfaces/console/model'
import type {
  SubAgentRunResponse,
  TeamActivationResponse,
  TeamMemberResponse,
  TeamMessageResponse,
  TeamNotification,
} from '../interfaces/console/runtime'
import { streamGet } from './console'
import { request } from './index'

function sessionQuery(sessionId: number | string, extra: Record<string, string> = {}) {
  return new URLSearchParams({ session_id: String(sessionId), ...extra }).toString()
}

/** Agent 工具派出的一次性子代理和 Workflow 成员的运行记录；不包含队友。 */
export function getSessionSubAgentRuns(sessionId: number | string): Promise<SubAgentRunResponse[]> {
  return request<SubAgentRunResponse[]>('/teams/subagent-runs?' + sessionQuery(sessionId))
}

/** 会话里的队友；没有团队时返回空数组。 */
export function getSessionTeamMemberList(sessionId: number | string): Promise<TeamMemberResponse[]> {
  return request<TeamMemberResponse[]>('/teams/members?' + sessionQuery(sessionId))
}

/** 会话的全部团队消息。 */
export function getSessionTeamMessageList(sessionId: number | string): Promise<TeamMessageResponse[]> {
  return request<TeamMessageResponse[]>('/teams/messages?' + sessionQuery(sessionId))
}

/** 最近的激活在前；limit 取 1～200，默认 50。 */
export function getSessionTeamActivationList(
  sessionId: number | string,
  limit?: number,
): Promise<TeamActivationResponse[]> {
  const extra: Record<string, string> = limit == null ? {} : { limit: String(limit) }
  return request<TeamActivationResponse[]>('/teams/activations?' + sessionQuery(sessionId, extra))
}

/** 订阅一次激活的事件流：先推 run_snapshot 再推增量，读到 run_end 结束；事件的 turn_id 即 activation_id。 */
export function subscribeTeamActivation(
  sessionId: number | string,
  activationId: string,
  handlers: SseHandlers<SseEvent>,
): () => void {
  return streamGet<SseEvent>(
    `/teams/activations/${encodeURIComponent(activationId)}/subscription?${sessionQuery(sessionId)}`,
    handlers,
  )
}

/** 订阅会话团队通知流：不会自己结束；after 为上次收到的 cursor，缺省从流里现存的第一条开始。 */
export function subscribeTeamStream(
  sessionId: number | string,
  after: string | null,
  handlers: SseHandlers<TeamNotification>,
): () => void {
  const extra: Record<string, string> = after ? { after } : {}
  return streamGet<TeamNotification>('/teams/stream?' + sessionQuery(sessionId, extra), handlers)
}
