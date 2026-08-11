/** 编排模式：顺序、并行、路由、循环。 */
export type PlanMode = 'sequential' | 'parallel' | 'routing' | 'loop'

/** 编排方案列表查询参数。 */
export interface GetPlanListParams {
  keyword?: string | null
  mode?: PlanMode | null
  is_enabled?: boolean | null
  limit?: number
  offset?: number
}

/** 方案成员载荷：agent_id 为正整数，role_config 存放模式相关配置。 */
export interface PlanMemberRequest {
  agent_id: number
  role_config: Record<string, unknown>
}

/** 创建编排方案请求；成员数量限制 2-5。 */
export interface PlanCreateRequest {
  name: string
  description?: string | null
  mode: PlanMode
  config: Record<string, unknown>
  is_enabled?: boolean
  members: PlanMemberRequest[]
}

/** 更新编排方案请求，字段为空表示不修改。 */
export interface PlanUpdateRequest {
  name?: string | null
  description?: string | null
  mode?: PlanMode | null
  config?: Record<string, unknown> | null
  is_enabled?: boolean | null
  members?: PlanMemberRequest[] | null
}

/** 方案成员响应；is_available 表示成员 Agent 当前仍处于启用状态。 */
export interface PlanMemberResponse {
  id: number
  agent_id: number
  agent_name: string
  position: number
  role_config: Record<string, unknown>
  is_available: boolean
}

/** 编排方案响应。 */
export interface PlanResponse {
  id: number
  workspace_id: number
  name: string
  description?: string | null
  mode: PlanMode
  config: Record<string, unknown>
  is_enabled: boolean
  created_by_user_id: number
  members: PlanMemberResponse[]
  created_at: string
  updated_at: string
}

/** 编排方案分页列表。 */
export interface PlanListResponse {
  items: PlanResponse[]
  total: number
  limit: number
  offset: number
}

/** 编排方案删除结果。 */
export interface PlanDeleteResult {
  deleted: boolean
}
