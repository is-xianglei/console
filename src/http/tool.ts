import type { GetToolListParams, ToolListResponse } from '@/interfaces/tool/api'
import type { ToolDetailResponse } from '@/interfaces/tool/model'
import { request } from './index'

function createToolListQuery(params?: GetToolListParams): string {
  const query = new URLSearchParams()
  if (params?.keyword != null) query.set('keyword', params.keyword)
  if (params?.is_enabled != null) query.set('is_enabled', String(params.is_enabled))
  if (params?.limit != null) query.set('limit', String(params.limit))
  if (params?.offset != null) query.set('offset', String(params.offset))
  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

/** 查询内置工具目录。 */
export function getToolList(params?: GetToolListParams): Promise<ToolListResponse> {
  return request<ToolListResponse>(`/tools${createToolListQuery(params)}`)
}

/** 查询内置工具详情。 */
export function getToolDetail(toolId: number): Promise<ToolDetailResponse> {
  return request<ToolDetailResponse>(`/tools/${toolId}`)
}
