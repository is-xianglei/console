import type { SessionAppId } from '../app/model'
import type { ChatModeSlug, ThinkingEffort } from '../settings/models/model'

/** 后端会话摘要。 */
export interface SessionResponse {
  id: number
  title: string
  status: string
  model_name?: string | null
  model_provider_id?: string | null
  mode_slug?: ChatModeSlug
  thinking_effort?: ThinkingEffort
  system_prompt?: string | null
  user_id?: number | null
  workspace_id?: number | null
  agent_id?: number | null
  /** 会话绑定的 Workflow ID;未绑定为 null(与 agent_id 互斥) */
  workflow_id?: number | null
  visibility: string
  shared_with?: number[]
  shared_with_departments?: number[]
  shared_with_groups?: number[]
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
  last_active_at: string
}

export type SessionVisibility = 'private' | 'workspace' | 'public'

export interface SessionShareTargets {
  users?: number[]
  departments?: number[]
  groups?: number[]
}

export interface SessionShareResult {
  session_id: number
  visibility: string
  users?: number[]
  departments?: number[]
  groups?: number[]
}

/** 助手消息中持久化的内容块。 */
export interface MsgContentBlock {
  type: 'thinking' | 'text' | 'tool_use' | 'tool_result' | string
  thinking?: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

/** 后端会话历史消息。 */
export interface SessionMessageResponse {
  id: number
  session_id: number
  turn_id?: string | null
  role: 'user' | 'assistant' | 'tool' | string
  content: unknown
  /** 编排分支路径,主线消息为空;非空表示编排某个节点的产出 */
  branch?: string | null
  token_estimate: number
  created_at: string
}

/** 后端任务快照。 */
export interface TaskResponse {
  id: number
  session_id: number
  subject: string
  description: string
  status: string
  owner: string
  blocked_by: unknown[]
  created_at: string
  updated_at: string
}

/** SSE 事件发起者。 */
export interface SseActor {
  role: 'orchestrator' | 'subagent' | 'teammate' | string
  name: string
  run_id?: string
  task?: string
  /** 成员 Agent 的数据库 ID(编排/子代理场景均可能携带) */
  agent_id?: number
  team?: { id: number; is_lead: boolean }
}

export type InteractionKind =
  | 'tool_approval'
  | 'user_question'
  | 'enter_plan_mode'
  | 'exit_plan_mode'

export interface InteractionQuestionOption {
  label: string
  description: string
  preview?: string | null
}

export interface InteractionQuestion {
  question: string
  header: string
  options: InteractionQuestionOption[]
  multiSelect?: boolean
}

export interface ToolApprovalRequestPayload {
  /** source：MCP 工具为 "mcp:{server_key}"，内置工具不带。 */
  tool: { id: string; name: string; input: Record<string, unknown>; source?: string }
  reason: string
  allowed_decisions: ApprovalDecision[]
  can_update_input: boolean
}

export interface UserQuestionRequestPayload {
  questions: InteractionQuestion[]
  metadata?: { source?: string | null } | null
}

export interface EnterPlanModeRequestPayload {
  message: string
}

export interface ExitPlanModeRequestPayload {
  plan_id: string
  plan: string
  plan_version: number
  allowedPrompts: Array<Record<string, unknown>>
}

interface SseInteractionBase {
  request_id: string
  suspension_id: string
  schema_version: number
}

/** SSE 中需要用户处理的通用交互请求。 */
export type SseInteraction =
  | (SseInteractionBase & { kind: 'tool_approval'; request_payload: ToolApprovalRequestPayload })
  | (SseInteractionBase & { kind: 'user_question'; request_payload: UserQuestionRequestPayload })
  | (SseInteractionBase & { kind: 'enter_plan_mode'; request_payload: EnterPlanModeRequestPayload })
  | (SseInteractionBase & { kind: 'exit_plan_mode'; request_payload: ExitPlanModeRequestPayload })

/** tool_sources 事件里的一项：message 是可直接展示的中文，不带授权地址。 */
export interface ToolSourceFault {
  /** "mcp:{server_key}" */
  source: string
  /** 来源整体失败、对不上具体 server 时为 null。 */
  server_id: number | null
  kind: 'unavailable' | 'auth_required' | 'timeout' | 'invalid' | string
  message: string
}

/** SSE 统一事件信封。 */
export interface SseEvent {
  type:
    | 'session_ready'
    | 'turn_start'
    | 'turn_end'
    | 'block_start'
    | 'thinking_delta'
    | 'text_delta'
    | 'block_stop'
    | 'tool_use'
    | 'tool_result'
    | 'permission_request'
    | 'interaction_request'
    | 'error'
    | 'task_snapshot'
    | 'tool_sources'
    | 'workflow_progress'
    | 'run_started'
    | 'run_snapshot'
    | 'run_end'
    | string
  sequence: number
  session_id: number
  /** 轮次级 SSE 的稳定关联键。 */
  turn_id?: string
  /** run_snapshot 快照内容。 */
  state?: Record<string, unknown>
  expired?: boolean
  cancelled?: boolean
  ts?: number
  actor?: SseActor
  data?: {
    session_id: number
    title?: string
    status?: string
    reason?: 'baseline' | 'created' | 'updated' | string
    tasks?: TaskResponse[]
    /** tool_sources：本回合不可用的作用域工具来源，只在有故障时紧随 turn_start 发出。 */
    faults?: ToolSourceFault[]
  }
  block?: { index: number; block_type?: 'thinking' | 'text' | 'tool_use' | string }
  text?: string
  tool?: {
    id: string
    name: string
    input?: Record<string, unknown>
    output?: string
    is_error?: boolean
    /** MCP 工具为 "mcp:{server_key}"，内置工具不带。 */
    source?: string
  }
  permission?: {
    request_id: string
    tool_id: string
    tool_name: string
    tool_input?: Record<string, unknown>
    behavior?: string
    reason?: string
  }
  interaction?: SseInteraction
  /** Workflow 编排进度事件(workflow_progress)的进度负载 */
  progress?: SseWorkflowProgress
  stop_reason?: string
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  }
  error?: { code: string; message: string; retriable: boolean; fatal: boolean }
}

export type ApprovalDecision = 'allow_once' | 'always_allow' | 'deny'

/** 子代理或思考点的运行状态。 */
export type RunStatus = 'queued' | 'think' | 'run' | 'done' | 'error'
export type TaskState = 'queued' | 'active' | 'done' | 'error'
export type WorkbenchMode = 'chat' | 'split' | 'app' | 'graph'

/** SSE workflow_progress 事件的进度负载(编排者发出)。 */
export interface SseWorkflowProgress {
  /** 阶段:member 成员执行、routing 智能路由、merging 结果汇总 */
  phase: 'member' | 'routing' | 'merging' | string
  status: 'running' | 'done' | 'failed' | string
  /** member/routing 命中时携带的成员 Agent ID;配置期失败(成员被停用/删除)时可能缺失 */
  agent_id?: number
  /** 成员的 Agent 显示名;配置期失败时可能缺失 */
  member_name?: string
  /** 顺序模式 member 阶段的执行位次(从 1 起) */
  ordinal?: number
  /** 顺序模式成员总数 */
  total?: number
}

/** 进度图上单个成员的运行时状态。 */
export interface WorkflowMemberProgress {
  agentId: number
  memberName: string | null
  status: 'running' | 'done' | 'failed'
  ordinal?: number
  total?: number
}

/** Workflow 进度图视图状态:按 agent_id 归并的成员 + 路由/汇总阶段。 */
export interface WorkflowProgressState {
  members: Record<number, WorkflowMemberProgress>
  routing: 'running' | 'done' | 'failed' | null
  routedAgentId: number | null
  merging: 'running' | 'done' | 'failed' | null
}

/** 会话列表视图模型。 */
export interface Session {
  id: string
  title: string
  time: string
  count: number
  badge?: string
  appId?: SessionAppId
  /** 会话创建者 ID；共享会话也必须保留，供前端判断写权限。 */
  userId?: number | null
  /** 当前用户是否仅拥有读取权限。 */
  readOnly?: boolean
  agentId?: number | null
  /** 会话绑定的 Workflow ID;与 agentId 互斥 */
  workflowId?: number | null
  modelName?: string | null
  modelProviderId?: string | null
  /** 仅 metadata.model_provider_override=true 表示用户显式选模型。 */
  modelProviderOverride?: boolean
  modeSlug?: ChatModeSlug
  thinkingEffort?: ThinkingEffort
  /** 切回标准模式时恢复本会话上次选择的思考强度。 */
  standardThinkingEffort?: ThinkingEffort
  status?: string
  visibility?: SessionVisibility
  sharedWith?: number[]
  sharedWithDepartments?: number[]
  sharedWithGroups?: number[]
}

export type CliTag =
  | 'START'
  | 'THINK'
  | 'TOOL'
  | 'SPAWN'
  | 'RESULT'
  | 'ERROR'
  | 'WARN'
  | 'DONE'

/** 子代理事件流中的单条记录。think/answer 的结束语义与中间对话区的 ChatBlock 一致 */
export type StreamEvent =
  | { kind: 'think'; text: string; done: boolean; seconds?: number }
  | { kind: 'answer'; text: string; streaming: boolean }
  | { kind: 'tool'; fn: string; body: string; done: boolean; is_error?: boolean; mcp?: string }

/** 控制台右栏中的子代理。 */
export interface SubAgent {
  id: string
  pid: string
  name: string
  icon: string
  status: RunStatus
  progress: number
  stream: StreamEvent[]
  /** 面板对应的数据库 Agent ID(进度图点击跳转时按它匹配) */
  agentId?: number
}

/** 控制台任务条中的任务。 */
export interface Task {
  id: string
  name: string
  state: TaskState
  description?: string
  blockedBy?: number[]
  owner?: string
}

export type ApprovalStatus = 'pending' | ApprovalDecision
export type InteractionStatus = 'pending' | 'resolved' | 'cancelled'

/** 中间对话区的消息块。 */
export type ChatBlock =
  /** done：推理已结束（block_stop 或流收尾）；seconds：实时流测得的思考秒数，历史消息没有 */
  | { kind: 'think'; text: string; done: boolean; seconds?: number }
  /** mcp：来自 MCP server 时为 server_key，fn 里的工具名已去掉 mcp__ 前缀。 */
  | { kind: 'tool'; tag: CliTag; fn: string; body: string; done: boolean; mcp?: string }
  | { kind: 'answer'; text: string; streaming: boolean }
  /** 本回合不可用的 MCP server（未授权、超时、连不上），放在这一轮回复的最上面。 */
  | { kind: 'sources'; faults: ToolSourceFault[] }
  | {
      kind: 'approval'
      requestId: string
      toolName: string
      toolInput: Record<string, unknown>
      reason: string
      status: ApprovalStatus
    }
  | {
      kind: 'interaction'
      interaction: SseInteraction
      status: InteractionStatus
      responseLabel?: string
    }

/** 控制台对话消息。 */
export interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  /** 后端轮次 ID，用于完整快照覆盖同轮次的助手历史。 */
  turnId?: string | null
  time: string
  text?: string
  blocks?: ChatBlock[]
}

/** 派发子代理时使用的模板。 */
export interface SubAgentTemplate {
  name: string
  icon: string
  think: string
  fn: string
  body: string
  answer: string
  task: string
}
