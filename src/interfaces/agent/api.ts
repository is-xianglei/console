/** Agent 列表查询参数。 */
export interface GetAgentListParams {
  keyword?: string | null
  is_enabled?: boolean | null
  limit?: number
  offset?: number
}

/** 创建 Agent 请求。 */
export interface AgentCreateRequest {
  name: string
  description?: string | null
  system_prompt: string
  model_name?: string | null
  is_enabled?: boolean
  tool_ids?: number[]
  skill_ids?: number[]
}

/** 更新 Agent 请求。 */
export interface AgentUpdateRequest {
  name?: string | null
  description?: string | null
  system_prompt?: string | null
  model_name?: string | null
  is_enabled?: boolean | null
}

/** Agent 响应。 */
export interface AgentResponse {
  id: number
  workspace_id: number
  name: string
  description?: string | null
  system_prompt: string
  model_name?: string | null
  is_enabled: boolean
  created_by_user_id: number
  tool_ids?: number[]
  skill_ids?: number[]
  created_at: string
  updated_at: string
}

/** Agent 分页列表。 */
export interface AgentListResponse {
  items: AgentResponse[]
  total: number
  limit: number
  offset: number
}

/** 全量替换 Agent 工具绑定请求。 */
export interface AgentToolBindingsRequest {
  tool_ids?: number[]
}

/** 全量替换 Agent Skill 绑定请求。 */
export interface AgentSkillBindingsRequest {
  skill_ids?: number[]
}

/** Agent 删除结果。 */
export interface AgentDeleteResult {
  deleted: boolean
}
