import type { SessionAppId } from '../app/model'

/** 后端会话摘要。 */
export interface SessionResponse {
  id: number
  title: string
  status: string
  model_name?: string | null
  system_prompt?: string | null
  user_id?: number | null
  workspace_id?: number | null
  agent_id?: number | null
  /** 会话绑定的编排方案 ID;未绑定为 null */
  orchestration_plan_id?: number | null
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

/** 编排节点事件(node_start/node_end)携带的节点信息。
 *  path 是与静态拓扑对齐的裸路径;status 只在 node_end 出现。 */
export interface SseNodeInfo {
  path: string
  name: string
  kind: 'sequential' | 'parallel' | 'routing' | 'loop' | 'leaf' | string
  status?: 'completed' | 'suspended' | 'failed' | 'escalated' | string
  detail?: {
    root?: boolean
    plan_id?: number
    mode?: string
    route?: string
    iteration?: number
    max_iterations?: number
  }
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
  tool: { id: string; name: string; input: Record<string, unknown> }
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
    | 'node_start'
    | 'node_end'
    | 'workflow_progress'
    | string
  sequence: number
  session_id: number
  ts?: number
  actor?: SseActor
  data?: {
    session_id: number
    title?: string
    status?: string
    reason?: 'baseline' | 'created' | 'updated' | string
    tasks?: TaskResponse[]
  }
  block?: { index: number; block_type?: 'thinking' | 'text' | 'tool_use' | string }
  text?: string
  tool?: {
    id: string
    name: string
    input?: Record<string, unknown>
    output?: string
    is_error?: boolean
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
  /** 编排节点事件(node_start/node_end)的节点负载 */
  node?: SseNodeInfo
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

/** 编排执行图节点的运行时状态：node_start/node_end 按去掉 #N 轮次的裸路径归并。
 *  pending 由「表中无该键」表达，避免与事件驱动的状态混淆。 */
export interface GraphNodeState {
  /** 去掉 loop 轮次(#N)后的裸路径，与静态拓扑对齐 */
  path: string
  status: 'running' | 'completed' | 'suspended' | 'failed' | 'escalated'
  /** 点击节点切右栏的流键(带 turn 前缀)；前端推不出来，只能取自事件 actor.run_id */
  runId?: string
  /** loop 当前轮次(从 1 起)与轮次上限，取自 detail，不从 path 解析 */
  iteration?: number
  maxIterations?: number
  /** routing 命中的 route_key(挂在被选中叶子上) */
  route?: string
  /** 根节点标记(detail.root)，驱动整图总状态，不匹配任何成员节点 */
  root?: boolean
}

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
  agentId?: number | null
  /** 会话绑定的编排方案 ID;与 agentId 互斥 */
  orchestrationPlanId?: number | null
  /** 会话绑定的 Workflow ID;与 agentId 互斥 */
  workflowId?: number | null
  modelName?: string | null
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
  | { kind: 'tool'; fn: string; body: string; done: boolean }

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
  | { kind: 'tool'; tag: CliTag; fn: string; body: string; done: boolean }
  | { kind: 'answer'; text: string; streaming: boolean }
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
