import type {
  ApprovalDecision,
  EnterPlanModeRequestPayload,
  ExitPlanModeRequestPayload,
  SessionShareResult,
  SessionShareTargets,
  SessionVisibility,
  SseEvent,
  ToolApprovalRequestPayload,
  TurnStatus,
  UnknownToolCall,
  UserQuestionRequestPayload,
} from './model'

import type { ChatModelSelection } from '../settings/models/model'

/** 修改会话名称或聊天配置。 */
export type UpdateSessionRequest = Partial<ChatModelSelection> & { title?: string }

/** 发送会话消息请求。 */
export interface SendMessageRequest extends Partial<ChatModelSelection> {
  /** 已存在会话 ID；不传时由后端创建会话。 */
  session_id?: number | null
  /** 新会话绑定的 Agent ID，与 workflow_id 互斥。 */
  agent_id?: number | null
  /** 新会话绑定的 Workflow ID，与 agent_id 互斥。 */
  workflow_id?: number | null
  /** 新会话选用的 Team，只在建会话的第一条消息里带；与 agent_id、workflow_id 互斥。 */
  team_definition_id?: number | null
  /** 用户消息正文。 */
  content: string
  /**
   * 前端为每条发言生成的 ID（UUID）：各处回显，用来对上发言；同时是幂等键，
   * 同一 ID 原样重发不会再入队，返回跟随原发言的流；同一 ID 内容不同返回 409。
   */
  client_input_id?: string
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

/** 取消暂停点的响应：暂停点元数据加上收尾后的会话状态与后继回合（与停止接口同义）。 */
export interface SuspensionCancelResponse extends RuntimeSuspensionResponse {
  session_status: string
  /** 同一事务建出的后继回合，接手排队的发言；没有排队发言时为 null。 */
  successor_turn_id: string | null
}

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

/** 会话当前最新轮次的执行快照。status 为 queued 或 running 都应订阅，不能只看 executing。 */
export interface ActiveTurnResponse {
  turn_id: string
  status: TurnStatus | string
  /** running 且为 false 表示执行中断、等待续跑。 */
  executing: boolean
  last_event_offset: number
}

/** 取消轮次后的状态。session_status 为 running 时，排队的发言已由后继回合接手。 */
export interface TurnCancelResponse {
  turn_id: string
  status: TurnStatus | string
  session_status: string
  /** 同一事务建出的后继回合，接手排队的发言；没有排队发言时为 null。停止后直接订阅它。 */
  successor_turn_id: string | null
}

/** 会话里还没被回合认领的发言，按提交顺序。 */
export interface PendingInputResponse {
  input_id: number
  /** 客户端发言 ID，没传时为 null。 */
  client_input_id: string | null
  session_id: number
  /** 当前负责这条发言的回合；会话已归档时为空。 */
  turn_id: string | null
  content: string
  created_at: string
}

/** 会话的一个回合（含历史回合），带结果未知的工具调用。 */
export interface SessionTurnResponse {
  turn_id: string
  status: TurnStatus | string
  /** 回合起始的 user 消息，用来把提示卡挂到消息列表上。 */
  started_message_id: number | null
  created_at: string
  unknown_tool_calls: UnknownToolCall[]
}

/** 控制台 SSE 生命周期回调。 */
export interface SseHandlers<T = SseEvent> {
  onEvent: (event: T) => void
  onError?: (error: Error) => void
  onDone?: () => void
}
