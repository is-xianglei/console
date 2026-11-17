import type {
  DefaultModelUpdateRequest,
  ModelProbeRequest,
  ModelProviderInput,
  ModelRoleAssignRequest,
} from '@/interfaces/settings/models/api'
import type {
  ChatModelCapabilities,
  ContextProbeResult,
  ModelPreferences,
  ModelProviderItem,
  ModelProviderTestResult,
  ModelRoleAssignment,
  ProviderSchema,
  ReasoningProbeResult,
} from '@/interfaces/settings/models/model'
import { request } from '../index'

const providerPath = (id: string) => `/models/providers/${encodeURIComponent(id)}`

/** 模型服务使用统一认证与响应信封，列表中仅接收掩码密钥。 */
export function getModelProviderList(): Promise<ModelProviderItem[]> {
  return request('/models/providers')
}

export function getModelProviderSchemaList(): Promise<ProviderSchema[]> {
  return request('/models/provider-schemas')
}

export function createModelProvider(payload: ModelProviderInput): Promise<ModelProviderItem> {
  return request('/models/providers', { method: 'POST', body: JSON.stringify(payload) })
}

/** api_key 缺省表示保留已有密钥，禁止将界面掩码作为新密钥写回。 */
export function updateModelProvider(providerId: string, payload: Partial<ModelProviderInput>): Promise<ModelProviderItem> {
  return request(providerPath(providerId), { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteModelProvider(providerId: string): Promise<void> {
  return request(providerPath(providerId), { method: 'DELETE' })
}

export function testModelProvider(providerId: string): Promise<ModelProviderTestResult> {
  return request(`${providerPath(providerId)}/test`, { method: 'POST' })
}

export function getModelRoleList(): Promise<ModelRoleAssignment[]> {
  return request('/models/roles')
}

export function assignModelRole(roleKey: string, payload: ModelRoleAssignRequest): Promise<void> {
  return request(`/models/roles/${encodeURIComponent(roleKey)}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function unassignModelRole(roleKey: string): Promise<void> {
  return request(`/models/roles/${encodeURIComponent(roleKey)}`, { method: 'DELETE' })
}

export function detectModelContextLength(payload: ModelProbeRequest): Promise<ContextProbeResult> {
  return request('/models/providers/detect-context', { method: 'POST', body: JSON.stringify(payload) })
}

export function detectModelReasoning(payload: ModelProbeRequest): Promise<ReasoningProbeResult> {
  return request('/models/providers/detect-reasoning', { method: 'POST', body: JSON.stringify(payload) })
}

export function getDefaultModelPreference(): Promise<ModelPreferences> {
  return request('/models/preferences')
}

export function updateDefaultModelPreference(payload: DefaultModelUpdateRequest): Promise<ModelPreferences> {
  return request('/models/preferences', { method: 'PUT', body: JSON.stringify(payload.preferences) })
}

/** 会话可选模型与模式策略；不会将供应商凭据传给聊天界面。 */
export function getChatModelCapabilities(): Promise<ChatModelCapabilities> {
  return request('/models/capabilities')
}
