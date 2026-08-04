import type { ToolResponse } from './model'

/** 内置工具列表查询参数。 */
export interface GetToolListParams {
  keyword?: string | null
  is_enabled?: boolean | null
  limit?: number
  offset?: number
}

/** 内置工具分页列表。 */
export interface ToolListResponse {
  items: ToolResponse[]
  total: number
  limit: number
  offset: number
}
