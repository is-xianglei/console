// ===== 后端 API DTO(对齐 AgentOS OpenAPI 3.1) =====
// 来源:http://127.0.0.1:8000/openapi.json

/** 统一响应信封 ApiResponse[T] */
export interface ApiResponse<T> {
  data: T | null
  error: ErrorBody | null
  request_id: string | null
}

export interface ErrorBody {
  code: string
  message: string
  details?: Record<string, unknown>
}

/** GET /api/health → data */
export interface HealthData {
  status: string
}

/** GET /api/sessions → data[] 中的单项 */
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

// ===== 会话消息 =====

/** assistant 消息 content 数组里的内容块(对齐落库结构) */
export interface MsgContentBlock {
  type: 'thinking' | 'text' | 'tool_use' | 'tool_result' | string
  /** type=thinking */
  thinking?: string
  /** type=text */
  text?: string
  /** type=tool_use */
  id?: string
  name?: string
  input?: Record<string, unknown>
  /** type=tool_result */
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

/** GET /api/sessions/{id}/messages → data[] 单项。
 *  content:user 为 string;assistant 为 MsgContentBlock[]。 */
export interface SessionMessageResponse {
  id: number
  session_id: number
  role: 'user' | 'assistant' | 'tool' | string
  content: string | MsgContentBlock[]
  token_estimate: number
  created_at: string
}

/** POST /api/sessions/messages 请求体 */
export interface SendMessageRequest {
  /** 不传则后端自动创建新会话 */
  session_id?: number
  content: string
}

// ===== 会话任务(任务编排面板) =====

/** GET /api/tasks?session_id= → data[] 单项。对齐后端 TaskResponse。 */
export interface TaskResponse {
  id: number
  session_id: number
  subject: string
  description: string
  /** 后端任务状态:pending | in_progress | completed | deleted(实际取值以后端为准) */
  status: string
  owner: string
  blocked_by: unknown[]
  created_at: string
  updated_at: string
}

// ===== SSE 流式事件(对齐 streaming-protocol.md) =====

export interface SseActor {
  role: 'orchestrator' | 'subagent' | 'teammate' | string
  name: string
  run_id?: string
  task?: string
  team?: { id: number; is_lead: boolean }
}

/** SSE 统一事件信封(各 type 的可选字段合并为宽类型,渲染层按 type 取用) */
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
    | 'error'
    | string
  sequence: number
  session_id: number
  ts?: number
  actor?: SseActor
  /** session_ready 专有 */
  data?: { session_id: number; title: string; status: string }
  block?: { index: number; block_type?: 'thinking' | 'text' | 'tool_use' | string }
  /** *_delta 文本增量 */
  text?: string
  tool?: {
    id: string
    name: string
    input?: Record<string, unknown>
    output?: string
    is_error?: boolean
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

