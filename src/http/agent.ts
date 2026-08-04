import type {
  AgentCreateRequest,
  AgentDeleteResult,
  AgentListResponse,
  AgentResponse,
  AgentSkillBindingsRequest,
  AgentToolBindingsRequest,
  AgentUpdateRequest,
  GetAgentListParams,
} from '@/interfaces/agent/api'
import { request } from './index'

function createAgentListQuery(params?: GetAgentListParams): string {
  const query = new URLSearchParams()
  if (params?.keyword != null) query.set('keyword', params.keyword)
  if (params?.is_enabled != null) query.set('is_enabled', String(params.is_enabled))
  if (params?.limit != null) query.set('limit', String(params.limit))
  if (params?.offset != null) query.set('offset', String(params.offset))
  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

/** 查询 Agent 列表。 */
export function getAgentList(params?: GetAgentListParams): Promise<AgentListResponse> {
  return request<AgentListResponse>(`/agents${createAgentListQuery(params)}`)
}

/** 查询 Agent 详情。 */
export function getAgentDetail(agentId: number): Promise<AgentResponse> {
  return request<AgentResponse>(`/agents/${agentId}`)
}

/** 创建 Agent。 */
export function createAgent(payload: AgentCreateRequest): Promise<AgentResponse> {
  return request<AgentResponse>('/agents', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 更新 Agent。 */
export function updateAgent(
  agentId: number,
  payload: AgentUpdateRequest,
): Promise<AgentResponse> {
  return request<AgentResponse>(`/agents/${agentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** 删除 Agent。 */
export function deleteAgent(agentId: number): Promise<AgentDeleteResult> {
  return request<AgentDeleteResult>(`/agents/${agentId}`, { method: 'DELETE' })
}

/** 全量替换 Agent 的工具绑定。 */
export function updateAgentTools(
  agentId: number,
  payload: AgentToolBindingsRequest,
): Promise<AgentResponse> {
  return request<AgentResponse>(`/agents/${agentId}/tools`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

/** 全量替换 Agent 的 Skill 绑定。 */
export function updateAgentSkills(
  agentId: number,
  payload: AgentSkillBindingsRequest,
): Promise<AgentResponse> {
  return request<AgentResponse>(`/agents/${agentId}/skills`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
