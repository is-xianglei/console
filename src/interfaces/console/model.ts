import type { SessionAppId } from '../app/model'

/** 健康检查结果。 */
export interface HealthData {
  status: string
}

/** 后端会话摘要。 */
export interface SessionResponse {
  id: number
  title: string
  status: string
  model_name: string | null
  system_prompt: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  last_active_at: string
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
  role: 'user' | 'assistant' | 'tool' | string
  content: string | MsgContentBlock[]
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
  team?: { id: number; is_lead: boolean }
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
    | 'error'
    | 'task_snapshot'
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
export type WorkbenchMode = 'chat' | 'split' | 'app'

/** 会话列表视图模型。 */
export interface Session {
  id: string
  title: string
  time: string
  count: number
  badge?: string
  appId?: SessionAppId
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

/** 子代理事件流中的单条记录。 */
export type StreamEvent =
  | { kind: 'think'; text: string }
  | { kind: 'answer'; text: string }
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

/** 中间对话区的消息块。 */
export type ChatBlock =
  | { kind: 'think'; text: string; duration: string; collapsed: boolean }
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
