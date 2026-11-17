/** 可见范围：workspace 工作区共享（owner / admin 管理），private 仅本人可见。 */
export type McpVisibility = 'workspace' | 'private'

/** 认证方式：无、静态请求头、OAuth 2.1（按用户授权）。 */
export type McpAuthType = 'none' | 'static_headers' | 'oauth'

/** server 级审批模式：全部需要审批 / 信任工具注解 / 全部免审批。 */
export type McpApprovalMode = 'always' | 'trust_annotations' | 'never'

/** 当前用户在 OAuth server 上的授权状态；不含 token。 */
export interface McpOAuthStatus {
  status: 'authorized' | 'unauthorized' | 'expired'
  scope?: string | null
  expires_at?: string | null
}

/** server 对外视图：不含凭证；没有写权限的成员看到的 url 查询参数被打码。 */
export interface McpServerResponse {
  id: number
  server_key: string
  visibility: McpVisibility
  name: string
  description?: string | null
  url: string
  auth_type: McpAuthType | string
  approval_mode: McpApprovalMode | string
  tool_allowlist: string[]
  tool_denylist: string[]
  call_timeout_seconds?: number | null
  config_rev: number
  is_enabled: boolean
  /** 当前用户能否修改、删除、探测。 */
  writable: boolean
  /** 请求头名称，值一律为 ********；只在新建、修改的响应里给出。 */
  headers?: Record<string, string> | null
  tool_count: number
  last_probe_at?: string | null
  last_probe_error?: string | null
  created_by?: number | null
  created_at: string
  updated_at: string
  /** 只有 OAuth server 才有。 */
  oauth?: McpOAuthStatus | null
}

/** 新建 server 请求；server_key 在工作区内唯一，地址只支持 https。 */
export interface McpServerCreateRequest {
  visibility: McpVisibility
  server_key: string
  name: string
  description?: string | null
  url: string
  auth_type?: McpAuthType
  headers?: Record<string, string>
  approval_mode?: McpApprovalMode
  tool_allowlist?: string[]
  tool_denylist?: string[]
  call_timeout_seconds?: number | null
  is_enabled?: boolean
}

/**
 * 更新 server 请求：字段可省略；visibility / server_key 只用于核对。
 * description、call_timeout_seconds 可传 null 清空；headers 提交即整体替换，值为 ******** 表示沿用原值。
 */
export interface McpServerUpdateRequest {
  visibility?: McpVisibility
  server_key?: string
  name?: string
  description?: string | null
  url?: string
  auth_type?: McpAuthType
  headers?: Record<string, string>
  approval_mode?: McpApprovalMode
  tool_allowlist?: string[]
  tool_denylist?: string[]
  call_timeout_seconds?: number | null
  is_enabled?: boolean
}

/** 探测得到的工具摘要。 */
export interface McpToolSummary {
  /** MCP 原名。 */
  name: string
  description: string
  input_schema_sha256: string
  /** 注解 readOnlyHint，未给为空。 */
  read_only?: boolean | null
  /** 注解 destructiveHint，未给为空。 */
  destructive?: boolean | null
}

/** 新建结果：server 视图 + 探测到的工具摘要。 */
export interface McpServerCreateResponse {
  server: McpServerResponse
  tools: McpToolSummary[]
}

/** 管理界面的一项工具：附模型名、是否被过滤和推导出的审批要求。 */
export interface McpToolResponse extends McpToolSummary {
  /** 发给模型的工具名；与同 server 其他工具撞名时为空。 */
  model_name: string | null
  /** 是否被 tool_allowlist / tool_denylist 过滤掉。 */
  filtered_out: boolean
  requires_approval: boolean
}

export interface McpToolSchemaChange {
  name: string
  before_sha256: string
  after_sha256: string
}

export interface McpToolDiff {
  added: string[]
  removed: string[]
  schema_changed: McpToolSchemaChange[]
}

/** 重新探测结果：成功给出与上次快照的差异，失败时 error 非空、快照不变。 */
export interface McpProbeResponse {
  ok: boolean
  error?: string | null
  server: McpServerResponse
  diff: McpToolDiff
}

export interface McpOAuthAuthorizeResponse {
  authorization_url: string
}

/** 授权回跳地址上的 state、code、iss 原样提交。 */
export interface McpOAuthCompleteRequest {
  state: string
  code: string
  iss?: string | null
}

export interface McpOAuthRevokeResponse {
  revoked: boolean
}

export interface McpServerDeleteResult {
  deleted: boolean
}
