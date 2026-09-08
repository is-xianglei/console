import type {
  ApprovalDecision,
  EnterPlanModeRequestPayload,
  ExitPlanModeRequestPayload,
  SessionShareResult,
  SessionShareTargets,
  SessionVisibility,
  SseEvent,
  ToolApprovalRequestPayload,
  UserQuestionRequestPayload,
} from './model'

/** 发送会话消息请求。 */
export interface SendMessageRequest {
  session_id?: number | null
  agent_id?: number | null
  /** 编排方案 ID:仅开新会话时可传,与 agent_id 互斥 */
  orchestration_plan_id?: number | null
  /** Workflow ID:仅新会话首发可传(会话落库后锁定),与 agent_id 互斥 */
  workflow_id?: number | null
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

export interface ShareSessionRequest {
  visibility: SessionVisibility
  share_with?: SessionShareTargets
}

export type ShareSessionResponse = SessionShareResult

export interface ToolApprovalResolutionRequest {
  kind: 'tool_approval'
  response_payload: {
    decision: ApprovalDecision
    updated_input?: Record<string, unknown> | null
    always_scope?: 'session' | 'global'
    message?: string | null
  }
}

export interface UserQuestionResolutionRequest {
  kind: 'user_question'
  response_payload: {
    decision: 'submit' | 'cancel' | 'discuss' | 'finish_plan_interview'
    answers?: Record<string, string>
    annotations?: Record<string, { preview?: string | null; notes?: string | null }>
    message?: string | null
  }
}

export interface EnterPlanModeResolutionRequest {
  kind: 'enter_plan_mode'
  response_payload: {
    decision: 'approve' | 'reject'
    feedback?: string | null
  }
}

export interface ExitPlanModeResolutionRequest {
  kind: 'exit_plan_mode'
  response_payload: {
    decision: 'approve' | 'reject'
    feedback?: string | null
    edited_plan?: string | null
  }
}

export type InteractionResolutionRequest =
  | ToolApprovalResolutionRequest
  | UserQuestionResolutionRequest
  | EnterPlanModeResolutionRequest
  | ExitPlanModeResolutionRequest

interface InteractionRequestResponseBase {
  id: string
  suspension_id: string
  session_id: number
  turn_id: string
  tool_call_id: number | null
  tool_use_id: string | null
  schema_version: number
  sequence: number
  status: 'pending' | 'resolved' | 'cancelled' | 'expired'
  request_payload: Record<string, unknown>
  response_payload: Record<string, unknown> | null
  responded_by: number | null
  responded_at: string | null
  created_at: string
  updated_at: string
}

export type InteractionRequestResponse =
  | (InteractionRequestResponseBase & {
      kind: 'tool_approval'
      request_payload: ToolApprovalRequestPayload
    })
  | (InteractionRequestResponseBase & {
      kind: 'user_question'
      request_payload: UserQuestionRequestPayload
    })
  | (InteractionRequestResponseBase & {
      kind: 'enter_plan_mode'
      request_payload: EnterPlanModeRequestPayload
    })
  | (InteractionRequestResponseBase & {
      kind: 'exit_plan_mode'
      request_payload: ExitPlanModeRequestPayload
    })

export interface RuntimeSuspensionResponse {
  id: string
  session_id: number
  turn_id: string
  status: 'pending' | 'resuming' | 'resolved' | 'cancelled' | 'failed'
  version: number
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface PendingInteractionResponse {
  suspension: RuntimeSuspensionResponse
  requests: InteractionRequestResponse[]
}

/** 控制台 SSE 生命周期回调。 */
export interface SseHandlers {
  onEvent: (event: SseEvent) => void
  onError?: (error: Error) => void
  onDone?: () => void
}
