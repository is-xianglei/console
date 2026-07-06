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

/** DELETE /api/sessions/{id} 与 POST /api/sessions/batch-delete → data */
export interface SessionDeleteResult {
  deleted: number
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
    | 'permission_request'
    | 'error'
    | 'task_snapshot'
    | string
  sequence: number
  session_id: number
  ts?: number
  actor?: SseActor
  /** RuntimeEvent(不带 actor)的负载:session_ready 与 task_snapshot 各取所需。
   *  task_snapshot.tasks 为该会话全量任务,前端整体替换任务面板(对齐 AG-UI 的 STATE_SNAPSHOT)。 */
  data?: {
    session_id: number
    title?: string
    status?: string
    reason?: 'baseline' | 'created' | 'updated' | string
    tasks?: TaskResponse[]
  }
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
  /** permission_request:工具执行前的审批请求(Human-in-the-Loop)。
   *  应答走独立 REST 端点 POST /sessions/{id}/approvals,不回写本流。 */
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

// ===== 权限审批 =====

/** 审批裁决:允许一次 / 始终允许 / 拒绝 */
export type ApprovalDecision = 'allow_once' | 'always_allow' | 'deny'

/** POST /api/sessions/{id}/approvals 请求体 */
export interface SessionApprovalRequest {
  request_id: string
  decision: ApprovalDecision
  updated_input?: Record<string, unknown>
  always_scope?: 'session' | 'global'
}

/** 权限规则作用域 */
export type PermissionScope = 'global' | 'session'
/** 权限判定行为 */
export type PermissionBehavior = 'allow' | 'ask' | 'deny'

/** GET /api/permissions → data[] 单项 */
export interface PermissionRule {
  id: number
  scope: PermissionScope | string
  session_id: number | null
  tool_name: string
  behavior: PermissionBehavior | string
  matcher: Record<string, unknown> | null
  source: string
  created_at: string
  updated_at: string
}

/** POST /api/permissions 请求体 */
export interface PermissionRuleCreate {
  scope: PermissionScope
  session_id?: number | null
  tool_name: string
  behavior: PermissionBehavior
  matcher?: Record<string, unknown> | null
}

/** DELETE /api/permissions/{id} → data */
export interface PermissionRuleDeleteResult {
  deleted: number
}

