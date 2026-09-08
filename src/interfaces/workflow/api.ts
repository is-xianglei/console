/** Workflow 编排模式：顺序执行、并行执行、智能路由（由 LLM 选一个成员）。 */
export type WorkflowMode = 'sequential' | 'parallel' | 'llm_routing'

/** Workflow 列表查询参数；后端 limit 上限 100。 */
export interface GetWorkflowListParams {
  keyword?: string | null
  is_enabled?: boolean | null
  limit?: number
  offset?: number
}

/** 成员载荷：agent_id 为正整数，sort_order 越小越靠前（顺序模式即执行顺序）。 */
export interface WorkflowAgentItem {
  agent_id: number
  sort_order: number
}

/** 创建 Workflow 请求；成员至少 1 个且不可重复，后端对 parallel/llm_routing 要求至少 2 个。 */
export interface WorkflowCreateRequest {
  name: string
  description?: string | null
  mode: WorkflowMode
  is_enabled?: boolean
  agents: WorkflowAgentItem[]
}

/**
 * 更新 Workflow 请求：省略的字段不修改；name/mode/is_enabled/agents 不能显式传 null，
 * agents 一旦提供即整体替换成员列表。
 */
export interface WorkflowUpdateRequest {
  name?: string
  description?: string | null
  mode?: WorkflowMode
  is_enabled?: boolean
  agents?: WorkflowAgentItem[]
}

/** 成员响应；agent_name 在成员 Agent 已被软删除时为 null。 */
export interface WorkflowAgentResponse {
  agent_id: number
  agent_name: string | null
  sort_order: number
}

/** Workflow 响应，agents 已按 (sort_order, agent_id) 升序。 */
export interface WorkflowResponse {
  id: number
  workspace_id: number
  name: string
  description: string | null
  mode: WorkflowMode
  is_enabled: boolean
  created_by_user_id: number
  agents: WorkflowAgentResponse[]
  created_at: string
  updated_at: string
}

/** Workflow 分页列表。 */
export interface WorkflowListResponse {
  items: WorkflowResponse[]
  total: number
  limit: number
  offset: number
}

/** 编排模式元数据（GET /workflows/modes），供表单展示中文名与说明。 */
export interface WorkflowModeInfo {
  mode: WorkflowMode
  name: string
  description: string
}

/** Workflow 删除结果。 */
export interface WorkflowDeleteResult {
  deleted: boolean
}
