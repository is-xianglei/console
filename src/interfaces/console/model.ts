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
  /** 建会话时选用的 Team；会话建好后不能切换。 */
  team_definition_id?: number | null
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
  /**
   * 这条消息在所属回合事件流里对应的位置（落库水位）。回合起始的 user 消息为 null；
   * 注入发言等于它的 input_claimed 的 sequence，tool 消息等于它的 tool_result 的 sequence。
   */
  stream_offset?: number | null
  /** 所属回合此刻是否正在执行（按执行租约现算）；为 true 的回合以订阅快照为准。 */
  in_flight?: boolean
  /** user 消息由哪些发言组成，起始发言也有；其他角色为空数组。 */
  input_ids?: number[]
  /** 与 input_ids 一一对应的 client_input_id，没传的位置为 null。 */
  client_input_ids?: Array<string | null>
}

/**
 * 回合状态。queued 等后台认领；running 执行中（active-turn 的 executing 为 false 表示执行中断、等待续跑）；
 * awaiting_interaction 挂起等人；其余为终态，needs_attention 表示有结果未知的工具调用、需要人工处理。
 */
export type TurnStatus =
  | 'queued'
  | 'running'
  | 'awaiting_interaction'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'needs_attention'

/** run_end.status 的取值；awaiting_interaction 不是终态，决定之后同一回合继续。 */
export type RunEndStatus = 'completed' | 'awaiting_interaction' | 'failed' | 'needs_attention' | 'interrupted'

/** 续跑时结果未知、没有自动重跑的工具调用；「需要人工处理」提示卡展示它。 */
export interface UnknownToolCall {
  /** 与消息里 tool_use 块的 id 一致；后端字段可为空。 */
  tool_use_id: string | null
  tool_name: string
  /** MCP 工具为 "mcp:{server_key}"，内置工具为 null。 */
  source: string | null
  status: 'unknown' | string
  /** 入参的紧凑 JSON，超过 200 个字符截断并加「…」。 */
  input_summary: string
  /** 工具真正开始执行的时间。 */
  started_at: string
  /** 子代理或 Workflow 成员发起的调用为所属子运行的 sub_run_id，lead 自己的为 null。 */
  sub_run_id: string | null
}

/** run_snapshot.state.inputs 的一项：本回合已认领的发言。 */
export interface SnapshotInput {
  message_id: number
  input_ids: number[]
  /** 与 input_ids 一一对应，没传的位置为 null。 */
  client_input_ids: Array<string | null>
  /** 等于这条 user 消息的 stream_offset。 */
  sequence: number
}

/** 快照里的一个内容块。主线的块带 segment，子运行的块没有。 */
export interface SnapshotBlock {
  segment?: number
  index: number
  kind: 'thinking' | 'text' | 'tool_use' | string
  text?: string
  closed?: boolean
  tool?: { id?: string; name?: string; input?: Record<string, unknown>; source?: string } | null
  result?: { id?: string; name?: string; output?: string; is_error?: boolean } | null
  sequence?: number
  result_sequence?: number | null
}

/** 快照里的一条错误。 */
export interface SnapshotRunError {
  error: { code?: string; message?: string; retriable?: boolean; fatal?: boolean }
  sequence?: number
}

/** 快照里的主线：每次执行（续跑、审批之后）segment 加 1，块按 (segment, index) 唯一。 */
export interface SnapshotMainState {
  segment: number
  in_turn: boolean
  usage?: SseUsage | null
  stop_reason?: string | null
  blocks: SnapshotBlock[]
}

/** 快照里的一个子运行：块按 (sub_run_id, index) 唯一，没有 segment。 */
export interface SnapshotSubRunState {
  sub_run_id: string
  parent_id: string | null
  agent_id: number | null
  agent_name: string
  /** 子运行 turn_start 收到的任务；没见到它（头部被裁剪）时为 null。 */
  task: string | null
  in_turn: boolean
  usage?: SseUsage | null
  stop_reason?: string | null
  errors: SnapshotRunError[]
  blocks: SnapshotBlock[]
}

/** run_snapshot.state：主线、子运行与主线错误；子运行的错误在各自 sub_runs[].errors 里。 */
export interface RunSnapshotState {
  main: SnapshotMainState
  sub_runs: SnapshotSubRunState[]
  errors: SnapshotRunError[]
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

/** SSE 事件发起者已删除：主线帧不带归属，子运行的帧统一包成 subagent_event。 */

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

/**
 * SSE 统一事件信封。归属规则：
 * - 主线帧（turn_start、block_*、*_delta、tool_*、interaction_request、error、workflow_progress、turn_end）
 *   带 session_id、sequence，不带归属，也不带 turn_id；
 * - 子运行的每一帧都是 subagent_event：原事件名放在 sub_type，载荷与主线同名事件一致，
 *   外层带 parent_id、sub_run_id、agent_id、agent_name，turn_start 另带 task；
 * - 会话级（session_ready、task_snapshot、tool_sources、input_claimed）：type、data、sequence；
 * - 执行边界（run_started、run_resumed、run_end）与跟随方合成的 run_snapshot：带 turn_id、sequence；
 * - 跟随方合成的 input_queued、run_switched、stream_error：没有 sequence，只出现在本次 HTTP 响应里。
 */
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
    | 'subagent_event'
    | 'run_started'
    | 'run_resumed'
    | 'run_snapshot'
    | 'run_end'
    | 'input_queued'
    | 'input_claimed'
    | 'run_switched'
    | 'stream_error'
    | string
  /** 回合内的位置：每个回合从 1 编号、按块预留、跳号正常；run_snapshot 可能为 0；跟随方合成帧没有。 */
  sequence?: number
  session_id?: number
  /** 执行边界与跟随方合成帧携带；主线与子运行事件不带，当前回合要从边界帧记住。 */
  turn_id?: string
  /** run_snapshot 快照内容。 */
  state?: Record<string, unknown>
  /** run_end 的结果。 */
  status?: RunEndStatus | string
  expired?: boolean
  cancelled?: boolean
  /** run_resumed：该回合的第几次执行。 */
  attempt?: number
  /** run_resumed：落库水位。 */
  watermark?: number
  /** run_resumed：Workflow 回合按子运行给出的水位，键是 sub_run_id，覆盖 watermark；主 Agent 回合不带。 */
  sub_run_watermarks?: Record<string, number>
  /** input_queued、run_switched：本次发言。 */
  input_id?: number
  /** input_queued、run_switched：请求里带的客户端发言 ID，没传时为 null。 */
  client_input_id?: string | null
  /** run_switched：发言原来所在的回合。 */
  previous_turn_id?: string
  /** stream_error：读流失败的原因。 */
  message?: string
  ts?: number
  /** subagent_event：子运行的内部事件名，取值与主线事件名相同。 */
  sub_type?: string
  /** subagent_event：父卡的键。Agent 工具派出的子代理是父调用的 tool.id，Workflow 成员是 member:{agent_id}。 */
  parent_id?: string | null
  /** subagent_event：子运行标识，与 /teams/subagent-runs 的 sub_run_id 是同一个值。 */
  sub_run_id?: string
  /** subagent_event：数据库 Agent 的 ID；内置子代理为 null。 */
  agent_id?: number | null
  /** subagent_event：显示名；数据库 Agent 是运行当时的名称原文，内置子代理是类型名。 */
  agent_name?: string
  /** subagent_event 的 turn_start：子运行收到的完整任务。 */
  task?: string
  data?: {
    session_id: number
    title?: string
    status?: string
    reason?: 'baseline' | 'created' | 'updated' | string
    tasks?: TaskResponse[]
    /** tool_sources：本回合不可用的作用域工具来源，只在有故障时紧随 turn_start 发出。 */
    faults?: ToolSourceFault[]
    /** input_claimed：认领发言的回合。 */
    turn_id?: string
    /** input_claimed：写进历史的那条 user 消息。 */
    message_id?: number
    /** input_claimed：这条 user 消息包含的发言。 */
    input_ids?: number[]
    /** input_claimed：与 input_ids 一一对应的客户端发言 ID，没传的位置为 null。 */
    client_input_ids?: Array<string | null>
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
  /** 提问被取消、停掉等待审批的回合时为 user_cancelled；不再有 interaction_* 取值。 */
  stop_reason?: string
  usage?: SseUsage
  error?: { code: SseErrorCode | string; message: string; retriable: boolean; fatal: boolean }
}

/** turn_end 的用量。 */
export interface SseUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

/**
 * 流内 error 帧的错误码。TURN_FAILED 遇到数据库时限时 retriable 为 true；
 * *_NEEDS_ATTENTION 表示续跑时遇到结果未知、不能重跑的工具。
 */
export type SseErrorCode =
  | 'TURN_FAILED'
  | 'WORKFLOW_RUN_FAILED'
  | 'TURN_NEEDS_ATTENTION'
  | 'TEAMMATE_NEEDS_ATTENTION'

export type ApprovalDecision = 'allow_once' | 'always_allow' | 'deny'

/** 子代理或思考点的运行状态；interrupted 是执行被打断的子运行，续跑时由新记录接着跑。 */
export type RunStatus = 'queued' | 'think' | 'run' | 'done' | 'error' | 'interrupted'
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
  /** 成员卡的键，只在 phase: "member" 的节点上出现，等于挂在它下面的子运行的 parent_id。 */
  member_id?: string
  /** 顺序模式 member 阶段的执行位次(从 1 起) */
  ordinal?: number
  /** 顺序模式成员总数 */
  total?: number
}

/** 进度图上单个成员的运行时状态。 */
export interface WorkflowMemberProgress {
  /** 成员卡的键(member:{agent_id})；进度按它归并。 */
  memberId: string
  agentId: number
  memberName: string | null
  status: 'running' | 'done' | 'failed'
  ordinal?: number
  total?: number
}

/** Workflow 进度图视图状态:按 member_id 归并的成员 + 路由/汇总阶段。 */
export interface WorkflowProgressState {
  members: Record<string, WorkflowMemberProgress>
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
  /** 建会话时选用的 Team；与 agentId、workflowId 互斥。 */
  teamDefinitionId?: number | null
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

/** 控制台右栏中的子代理（一次子运行）。 */
export interface SubAgent {
  /** 子运行标识 sub_run_id，与 /teams/subagent-runs 的 sub_run_id 是同一个值。 */
  id: string
  pid: string
  name: string
  icon: string
  status: RunStatus
  progress: number
  stream: StreamEvent[]
  /** 面板对应的数据库 Agent ID；内置子代理为空。 */
  agentId?: number | null
  /** 挂靠的父卡：Agent 工具是父调用的 tool.id，Workflow 成员是 member:{agent_id}；历史记录可能为空。 */
  parentId?: string | null
  /** 所属回合；历史记录为 null。按 (turnId, parentId) 把子运行挂回父卡。 */
  turnId?: string | null
  /** 子运行 turn_start 收到的任务；没见到（头部被裁剪）时为空。 */
  task?: string | null
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
  /**
   * mcp：来自 MCP server 时为 server_key，fn 里的工具名已去掉 mcp__ 前缀。
   * toolId：历史消息里的 tool_use.id；截断快照只带在途结果时据此回填到已落库的工具卡。
   */
  | { kind: 'tool'; tag: CliTag; fn: string; body: string; done: boolean; mcp?: string; toolId?: string }
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
  /**
   * 回合需要人工处理：续跑时有工具执行到一半、结果未知，后端没有自动重跑。
   * message 来自流里的 error 帧；calls 来自回合列表接口，刷新后据此还原。
   */
  | { kind: 'attention'; message?: string; calls: UnknownToolCall[] }

/** <team-inbox> 里的一条队友消息：heading 是方括号里的来源说明，例如「writer 已转为空闲」。 */
export interface TeamInboxEntry {
  heading: string
  body: string
}

/** 队友消息合并成的 user 消息，在聊天区显示成可折叠的「团队消息」卡片，不是用户气泡。 */
export interface TeamInbox {
  entries: TeamInboxEntry[]
  /** 是自动回合的第一条消息：这一轮由队友消息触发，没有用户输入。 */
  trigger: boolean
}

/** 控制台对话消息。 */
export interface ChatMessage {
  id: string
  /** 后端轮次 ID，用于完整快照覆盖同轮次的助手历史。排队中的发言还不属于任何回合，为空。 */
  turnId?: string | null
  role: 'user' | 'ai' | 'team'
  time: string
  text?: string
  blocks?: ChatBlock[]
  /** role 为 team 时的消息内容。 */
  inbox?: TeamInbox
  /** 已落库消息的后端 ID；实时流建出的回复没有。 */
  messageId?: number
  /** 注入发言在回合事件流里的位置；回合起始的发言为空。 */
  streamOffset?: number | null
  /** user 消息由哪些发言组成。 */
  inputIds?: number[]
  /** 这些发言的客户端发言 ID（去掉没传的）；本页发出的发言从一开始就有，用它对上之后的事件和列表条目。 */
  clientInputIds?: string[]
  /** 发言还在排队，等回合认领。 */
  queued?: boolean
  /** 排队发言当前由哪个回合负责。 */
  queuedTurnId?: string | null
  /** 发送因服务暂时不可用（503）失败，可以原样重发。 */
  retryable?: boolean
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
