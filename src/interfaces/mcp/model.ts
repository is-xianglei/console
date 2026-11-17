import type { McpApprovalMode, McpAuthType, McpVisibility } from './api'

/** 表单里的一行请求头。 */
export interface McpHeaderRow {
  name: string
  value: string
}

/** 新建 / 编辑 MCP server 的表单模型。 */
export interface McpFormModel {
  id: number | null
  visibility: McpVisibility
  serverKey: string
  name: string
  description: string
  url: string
  authType: McpAuthType
  /**
   * 编辑时后端不回显请求头：留空表示沿用原有请求头，填写后整体替换。
   * 新建、或从其他认证方式切到 static_headers 时至少要一行。
   */
  headers: McpHeaderRow[]
  approvalMode: McpApprovalMode
  toolAllowlist: string[]
  toolDenylist: string[]
  /** 空串表示使用后端默认超时。 */
  callTimeoutSeconds: string
  isEnabled: boolean
  /** 编辑时载入的原认证方式，用来判断请求头能否留空。 */
  originalAuthType: McpAuthType | null
}

export type McpFormField = 'name' | 'serverKey' | 'url' | 'headers' | 'callTimeoutSeconds'

export interface McpValidationIssue {
  field: McpFormField
  message: string
}

/** Agent 表单里的一项 MCP 绑定：toolNames 为空数组表示全部工具。 */
export interface AgentMcpBindingDraft {
  serverId: number
  toolNames: string[]
}
