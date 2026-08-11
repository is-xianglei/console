import type {
  GetPlanListParams,
  PlanCreateRequest,
  PlanDeleteResult,
  PlanListResponse,
  PlanResponse,
  PlanUpdateRequest,
} from '@/interfaces/orchestration-plan/api'
import { request } from './index'

function createPlanListQuery(params?: GetPlanListParams): string {
  const query = new URLSearchParams()
  if (params?.keyword != null) query.set('keyword', params.keyword)
  if (params?.mode != null) query.set('mode', params.mode)
  if (params?.is_enabled != null) query.set('is_enabled', String(params.is_enabled))
  if (params?.limit != null) query.set('limit', String(params.limit))
  if (params?.offset != null) query.set('offset', String(params.offset))
  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

/** 查询编排方案列表。 */
export function getPlanList(params?: GetPlanListParams): Promise<PlanListResponse> {
  return request<PlanListResponse>(`/orchestration-plans${createPlanListQuery(params)}`)
}

/** 查询编排方案详情。 */
export function getPlanDetail(planId: number): Promise<PlanResponse> {
  return request<PlanResponse>(`/orchestration-plans/${planId}`)
}

/** 创建编排方案。 */
export function createPlan(payload: PlanCreateRequest): Promise<PlanResponse> {
  return request<PlanResponse>('/orchestration-plans', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 更新编排方案。 */
export function updatePlan(
  planId: number,
  payload: PlanUpdateRequest,
): Promise<PlanResponse> {
  return request<PlanResponse>(`/orchestration-plans/${planId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** 删除编排方案。 */
export function deletePlan(planId: number): Promise<PlanDeleteResult> {
  return request<PlanDeleteResult>(`/orchestration-plans/${planId}`, { method: 'DELETE' })
}
