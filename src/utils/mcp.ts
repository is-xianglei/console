import type {
  McpApprovalMode,
  McpAuthType,
  McpServerCreateRequest,
  McpServerResponse,
  McpServerUpdateRequest,
  McpToolResponse,
} from '@/interfaces/mcp/api'
import type { AgentMcpBindingDraft, McpFormModel, McpValidationIssue } from '@/interfaces/mcp/model'
import type { AgentMcpBinding } from '@/interfaces/agent/api'

/** 与后端 SERVER_KEY_PATTERN 一致：小写字母开头，只含小写字母、数字和单个下划线，不以下划线结尾。 */
export const MCP_SERVER_KEY_PATTERN = /^[a-z](?:_?[a-z0-9])*$/
export const MCP_SERVER_KEY_MAX = 24

export const MCP_AUTH_LABEL: Record<McpAuthType, string> = {
  none: '无',
  static_headers: '请求头',
  oauth: 'OAuth',
}

export const MCP_APPROVAL_LABEL: Record<McpApprovalMode, string> = {
  always: '全部需要审批',
  trust_annotations: '信任工具注解',
  never: '全部免审批',
}

export function authLabel(value: string): string {
  return MCP_AUTH_LABEL[value as McpAuthType] ?? value
}

export function approvalLabel(value: string): string {
  return MCP_APPROVAL_LABEL[value as McpApprovalMode] ?? value
}

function normalizeAuthType(value: string): McpAuthType {
  return value === 'static_headers' || value === 'oauth' ? value : 'none'
}

function normalizeApprovalMode(value: string): McpApprovalMode {
  return value === 'trust_annotations' || value === 'never' ? value : 'always'
}

export function emptyMcpForm(canManageShared: boolean): McpFormModel {
  return {
    id: null,
    // 普通成员只能建私有 server。
    visibility: canManageShared ? 'workspace' : 'private',
    serverKey: '',
    name: '',
    description: '',
    url: '',
    authType: 'none',
    headers: [{ name: '', value: '' }],
    approvalMode: 'always',
    toolAllowlist: [],
    toolDenylist: [],
    callTimeoutSeconds: '',
    // 新建默认停用：「保存」按表单值保存，「保存并启用」强制启用。
    isEnabled: false,
    originalAuthType: null,
  }
}

/** 编辑时后端不回显请求头值，表单里请求头留空表示沿用。 */
export function mcpResponseToForm(server: McpServerResponse): McpFormModel {
  const authType = normalizeAuthType(server.auth_type)
  return {
    id: server.id,
    visibility: server.visibility,
    serverKey: server.server_key,
    name: server.name,
    description: server.description ?? '',
    url: server.url,
    authType,
    headers: [{ name: '', value: '' }],
    approvalMode: normalizeApprovalMode(server.approval_mode),
    toolAllowlist: [...server.tool_allowlist],
    toolDenylist: [...server.tool_denylist],
    callTimeoutSeconds: server.call_timeout_seconds == null ? '' : String(server.call_timeout_seconds),
    isEnabled: server.is_enabled,
    originalAuthType: authType,
  }
}

/** 名称和值都为空的行视为没填。 */
export function filledHeaders(form: McpFormModel) {
  return form.headers
    .map((row) => ({ name: row.name.trim(), value: row.value }))
    .filter((row) => row.name || row.value.trim())
}

/** 编辑一个原本就是请求头认证的 server 时，请求头可以留空沿用原值。 */
export function canKeepHeaders(form: McpFormModel): boolean {
  return form.id != null && form.originalAuthType === 'static_headers'
}

export function validateMcpForm(form: McpFormModel): McpValidationIssue[] {
  const issues: McpValidationIssue[] = []
  if (!form.name.trim()) issues.push({ field: 'name', message: '请输入名称' })
  const key = form.serverKey.trim()
  if (!key) issues.push({ field: 'serverKey', message: '请输入标识' })
  else if (form.id == null && (key.length > MCP_SERVER_KEY_MAX || !MCP_SERVER_KEY_PATTERN.test(key))) {
    issues.push({ field: 'serverKey', message: '标识须为 1～24 个字符，小写字母开头，只含小写字母、数字和单个下划线' })
  }
  const url = form.url.trim()
  if (!url) issues.push({ field: 'url', message: '请输入地址' })
  else if (!/^https?:\/\/\S+$/i.test(url)) issues.push({ field: 'url', message: '地址格式不正确，须以 https:// 开头' })
  if (form.authType === 'static_headers') {
    const rows = filledHeaders(form)
    if (rows.some((row) => !row.name || !row.value.trim())) {
      issues.push({ field: 'headers', message: '请求头的名称和值都要填写' })
    } else if (!rows.length && !canKeepHeaders(form)) {
      issues.push({ field: 'headers', message: '至少配置一个请求头' })
    }
  }
  const timeout = form.callTimeoutSeconds.trim()
  if (timeout && !/^[1-9]\d*$/.test(timeout)) {
    issues.push({ field: 'callTimeoutSeconds', message: '调用超时须为正整数' })
  }
  return issues
}

function headersRecord(form: McpFormModel): Record<string, string> {
  return Object.fromEntries(filledHeaders(form).map((row) => [row.name, row.value]))
}

function timeoutValue(form: McpFormModel): number | null {
  const timeout = form.callTimeoutSeconds.trim()
  return timeout ? Number(timeout) : null
}

export function buildMcpCreatePayload(form: McpFormModel, enabled: boolean): McpServerCreateRequest {
  const payload: McpServerCreateRequest = {
    visibility: form.visibility,
    server_key: form.serverKey.trim(),
    name: form.name.trim(),
    description: form.description.trim() || null,
    url: form.url.trim(),
    auth_type: form.authType,
    approval_mode: form.approvalMode,
    tool_allowlist: [...form.toolAllowlist],
    tool_denylist: [...form.toolDenylist],
    call_timeout_seconds: timeoutValue(form),
    is_enabled: enabled,
  }
  if (form.authType === 'static_headers') payload.headers = headersRecord(form)
  return payload
}

/**
 * 修改时 visibility / server_key 不提交（只用于核对，提交也不能改）。
 * 请求头：只有填写了才提交，提交即整体替换；不提交时后端沿用原值，切换到其他认证方式时后端自动清掉。
 */
export function buildMcpUpdatePayload(form: McpFormModel, enabled: boolean): McpServerUpdateRequest {
  const payload: McpServerUpdateRequest = {
    name: form.name.trim(),
    description: form.description.trim() || null,
    url: form.url.trim(),
    auth_type: form.authType,
    approval_mode: form.approvalMode,
    tool_allowlist: [...form.toolAllowlist],
    tool_denylist: [...form.toolDenylist],
    call_timeout_seconds: timeoutValue(form),
    is_enabled: enabled,
  }
  if (form.authType === 'static_headers' && filledHeaders(form).length) payload.headers = headersRecord(form)
  return payload
}

export type McpStatusTone = 'success' | 'warning' | 'error' | 'muted'

export interface McpStatus {
  tone: McpStatusTone
  icon: string
  label: string
}

/** 卡片 / 详情上的连接状态：探测失败 > OAuth 未授权 > 正常 > 未探测。 */
export function mcpStatus(server: McpServerResponse): McpStatus {
  if (server.last_probe_error) {
    return { tone: 'error', icon: 'i-lucide-circle-x', label: server.last_probe_error }
  }
  if (server.auth_type === 'oauth' && server.oauth?.status !== 'authorized') {
    return {
      tone: 'warning',
      icon: 'i-lucide-key-round',
      label: server.oauth?.status === 'expired' ? '授权已过期' : '未授权',
    }
  }
  if (server.last_probe_at) return { tone: 'success', icon: 'i-lucide-circle-check', label: '连接正常' }
  return { tone: 'muted', icon: 'i-lucide-circle-dashed', label: '未探测' }
}

/** 详情「最近探测」行只看探测本身：失败 / 正常 / 未探测；授权状态在认证行单独显示。 */
export function mcpProbeStatus(server: McpServerResponse): McpStatus {
  if (server.last_probe_error) {
    return { tone: 'error', icon: 'i-lucide-circle-x', label: server.last_probe_error }
  }
  if (server.last_probe_at) return { tone: 'success', icon: 'i-lucide-circle-check', label: '探测成功' }
  return { tone: 'muted', icon: 'i-lucide-circle-dashed', label: '未探测' }
}

/** 卡片底部左侧：OAuth 未授权时提示授权状态，否则显示工具数。 */
export function mcpMetaText(server: McpServerResponse): string {
  if (server.auth_type === 'oauth' && server.oauth?.status !== 'authorized') {
    return server.oauth?.status === 'expired' ? '授权已过期' : '未授权'
  }
  return `${server.tool_count} 工具`
}

/** Agent 只能绑定已启用的工作区共享 server。 */
export function isBindableMcpServer(server: McpServerResponse): boolean {
  return server.visibility === 'workspace' && server.is_enabled
}

export function bindingsToDrafts(bindings: AgentMcpBinding[] | undefined): AgentMcpBindingDraft[] {
  return (bindings ?? []).map((binding) => ({ serverId: binding.server_id, toolNames: [...(binding.tool_names ?? [])] }))
}

/** 空白名单提交 null（全部工具），后端不接受空列表。 */
export function draftsToBindings(drafts: AgentMcpBindingDraft[]): AgentMcpBinding[] {
  return drafts.map((draft) => ({
    server_id: draft.serverId,
    tool_names: draft.toolNames.length ? [...draft.toolNames] : null,
  }))
}

/** 比较两组绑定是否等价（顺序无关，tool_names 为 null 与空数组等价）。 */
export function sameMcpBindings(current: AgentMcpBinding[] | undefined, next: AgentMcpBinding[]): boolean {
  const key = (binding: AgentMcpBinding) => `${binding.server_id}:${[...(binding.tool_names ?? [])].sort().join(',')}`
  const a = (current ?? []).map(key).sort()
  const b = next.map(key).sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/** 绑定下拉里可选的工具：被 server 名单过滤掉的不列出，已选的保留以便取消。 */
export function bindableToolNames(tools: McpToolResponse[], selected: string[]): string[] {
  const names = tools.filter((tool) => !tool.filtered_out).map((tool) => tool.name)
  for (const name of selected) if (!names.includes(name)) names.push(name)
  return names
}
