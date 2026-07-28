import type {
  ApprovalDecision,
  SseEvent,
} from './model'

/** 发送会话消息请求。 */
export interface SendMessageRequest {
  session_id?: number
  content: string
}

/** 会话删除结果。 */
export interface SessionDeleteResult {
  deleted: number
}

/** 工具审批请求。 */
export interface SessionApprovalRequest {
  request_id: string
  decision: ApprovalDecision
  updated_input?: Record<string, unknown>
  always_scope?: 'session' | 'global'
}

/** 控制台 SSE 生命周期回调。 */
export interface SseHandlers {
  onEvent: (event: SseEvent) => void
  onError?: (error: Error) => void
  onDone?: () => void
}
