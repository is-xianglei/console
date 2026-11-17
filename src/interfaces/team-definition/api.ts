/**
 * Team 定义（/api/team-definitions）：工作区里可复用的队友名单。
 * 新建会话时选 Team，会话的主 Agent 担任 lead，名单成员在建会话时快照成运行时团队。
 */

/** 名单成员载荷：同一个 agent_id 可以出现多次，成员名在 Team 内唯一，不能是 lead 或 *。 */
export interface TeamDefinitionMemberItem {
  agent_id: number
  name: string
  role: string
  /** 只表示展示顺序，越小越靠前；不是执行顺序。 */
  sort_order?: number
}

export interface TeamDefinitionCreateRequest {
  name: string
  description?: string | null
  is_enabled?: boolean
  members: TeamDefinitionMemberItem[]
}

/** 至少传一个字段；name、is_enabled、members 不能显式传 null，description 传 null 表示清空；members 整体替换。 */
export interface TeamDefinitionUpdateRequest {
  name?: string
  description?: string | null
  is_enabled?: boolean
  members?: TeamDefinitionMemberItem[]
}

/** agent_name 在 Agent 被删除后为 null。 */
export interface TeamDefinitionMemberResponse {
  agent_id: number
  agent_name: string | null
  name: string
  role: string
  sort_order: number
}

/** members 已按 sort_order 排好，相同时按添加先后。 */
export interface TeamDefinitionResponse {
  id: number
  workspace_id: number
  name: string
  description: string | null
  is_enabled: boolean
  created_by_user_id: number
  members: TeamDefinitionMemberResponse[]
  created_at: string
  updated_at: string
}

/** limit 取 1～100，默认 20。 */
export interface GetTeamDefinitionListParams {
  keyword?: string | null
  is_enabled?: boolean | null
  limit?: number
  offset?: number
}

export interface TeamDefinitionListResponse {
  items: TeamDefinitionResponse[]
  total: number
  limit: number
  offset: number
}

export interface TeamDefinitionDeleteResult {
  deleted: boolean
}
