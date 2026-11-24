/** AgentOS 持久化的会话子代理运行记录。列表不包含完整推理或工具历史；不再包含队友。 */
export interface SubAgentRunResponse {
  id: number
  session_id: number
  /** 内部运行标识（成员带 wf-、委派带 delegate- 前缀，可能截断），不要用来显示。 */
  member_name: string
  /** 委派自建 Agent 与 Workflow 成员填写，内置子代理为空。 */
  agent_id?: number | null
  /** running、succeeded、failed、interrupted；续跑时同一次 Agent 调用下可能有一条 interrupted 加一条新记录。 */
  status: string
  prompt: string
  report: string | null
  error_message: string | null
  started_at: string
  finished_at: string | null
  /** 与流里的 parent_id 相同：Agent 工具为父调用的 tool_use ID，Workflow 成员为 member:{agent_id}；父调用键落库之前的历史记录为 null。 */
  parent_id: string | null
  /** 父回合；历史记录为 null。 */
  turn_id: string | null
  /** 与流里的 agent_name 同源，是运行当时的名字（数据库 Agent 的名称原文，内置子代理为类型名）。 */
  agent_name: string
  /** 与流里的 sub_run_id 相同（run-{id}），直接用它，不要自己拼。 */
  sub_run_id: string
}

/** working：有待处理的工作（正在运行或排队等认领）；idle：空闲等消息；shutdown：已关停。 */
export type TeamMemberStatus = 'working' | 'idle' | 'shutdown'

/**
 * 会话里的队友。名单成员（Team 会话）agent_id 有值、agent_type 与 prompt 为 null；
 * lead 用 TeamSpawn 派生的内置类型队友正好相反。
 */
export interface TeamMemberResponse {
  id: number
  session_id: number
  team_id: number | null
  name: string
  role: string
  status: TeamMemberStatus | string
  agent_type: string | null
  agent_id: number | null
  prompt: string | null
  /** 最近一次激活。 */
  activation_id: string | null
  created_at: string
  updated_at: string
}

export type TeamMessageType =
  | 'message'
  | 'broadcast'
  | 'shutdown_request'
  | 'shutdown_response'
  | 'plan_approval_response'
  | 'idle_notification'

/**
 * 团队消息。sender / recipient 是成员名或 lead；广播按收件人拆成多行，message_type 为 broadcast。
 * shutdown_request 与 shutdown_response 用 request_id 配对；read_at 为空表示收件人还没收取。
 */
export interface TeamMessageResponse {
  id: number
  session_id: number
  sender: string
  recipient: string
  message_type: TeamMessageType | string
  content: string
  request_id: string | null
  read_at: string | null
  created_at: string
}

/**
 * 队友激活状态：queued 等后台认领；needs_attention 有结果未知的工具调用、需要人工处理。
 * interrupted 不再产生，只剩旧数据。
 */
export type TeamActivationStatus = 'queued' | 'running' | 'completed' | 'failed' | 'needs_attention' | 'interrupted'

/** 队友的一次后台执行；id 即 activation_id，也是它事件流的订阅键。 */
export interface TeamActivationResponse {
  id: string
  session_id: number
  member_id: number
  status: TeamActivationStatus | string
  error_message: string | null
  created_at: string
  finished_at: string | null
}

/** 会话团队通知流的帧。每帧带 cursor，断线后用 after=cursor 续订；stream_error 之后流结束，重连即可。 */
export type TeamNotification =
  | { type: 'team_activation'; session_id: number; member: string; activation_id: string; cursor?: string }
  | { type: 'team_lead_turn'; session_id: number; turn_id: string; cursor?: string }
  | { type: 'stream_error'; message?: string; cursor?: string }
