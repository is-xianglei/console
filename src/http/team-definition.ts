import type {
  GetTeamDefinitionListParams,
  TeamDefinitionCreateRequest,
  TeamDefinitionDeleteResult,
  TeamDefinitionListResponse,
  TeamDefinitionResponse,
  TeamDefinitionUpdateRequest,
} from '@/interfaces/team-definition/api'
import { request } from './index'

const definitionPath = (definitionId: number) => `/team-definitions/${definitionId}`

function createListQuery(params?: GetTeamDefinitionListParams): string {
  const query = new URLSearchParams()
  if (params?.keyword) query.set('keyword', params.keyword)
  if (params?.is_enabled != null) query.set('is_enabled', String(params.is_enabled))
  if (params?.limit != null) query.set('limit', String(params.limit))
  if (params?.offset != null) query.set('offset', String(params.offset))
  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

/** 查询 Team 列表；读接口要求是工作区的活跃成员。 */
export function getTeamDefinitionList(params?: GetTeamDefinitionListParams): Promise<TeamDefinitionListResponse> {
  return request<TeamDefinitionListResponse>(`/team-definitions${createListQuery(params)}`)
}

/** 不存在时 404「Team不存在」。 */
export function getTeamDefinitionDetail(definitionId: number): Promise<TeamDefinitionResponse> {
  return request<TeamDefinitionResponse>(definitionPath(definitionId))
}

/** 写接口要求工作区 owner/admin。 */
export function createTeamDefinition(payload: TeamDefinitionCreateRequest): Promise<TeamDefinitionResponse> {
  return request<TeamDefinitionResponse>('/team-definitions', { method: 'POST', body: JSON.stringify(payload) })
}

/** 只传改动的字段；members 提供时整体替换。 */
export function updateTeamDefinition(
  definitionId: number,
  payload: TeamDefinitionUpdateRequest,
): Promise<TeamDefinitionResponse> {
  return request<TeamDefinitionResponse>(definitionPath(definitionId), { method: 'PATCH', body: JSON.stringify(payload) })
}

/** 软删除；已经用它建好的会话不受影响。 */
export function deleteTeamDefinition(definitionId: number): Promise<TeamDefinitionDeleteResult> {
  return request<TeamDefinitionDeleteResult>(definitionPath(definitionId), { method: 'DELETE' })
}
