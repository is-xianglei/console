import type {
  GetWorkflowListParams,
  WorkflowCreateRequest,
  WorkflowDeleteResult,
  WorkflowListResponse,
  WorkflowModeInfo,
  WorkflowResponse,
  WorkflowUpdateRequest,
} from '@/interfaces/workflow/api'
import { request } from './index'

function createWorkflowListQuery(params?: GetWorkflowListParams): string {
  const query = new URLSearchParams()
  if (params?.keyword != null) query.set('keyword', params.keyword)
  if (params?.is_enabled != null) query.set('is_enabled', String(params.is_enabled))
  if (params?.limit != null) query.set('limit', String(params.limit))
  if (params?.offset != null) query.set('offset', String(params.offset))
  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

/** 查询 Workflow 列表。 */
export function getWorkflowList(params?: GetWorkflowListParams): Promise<WorkflowListResponse> {
  return request<WorkflowListResponse>(`/workflows${createWorkflowListQuery(params)}`)
}

/** 查询三种内置编排模式的元数据。 */
export function getWorkflowModeList(): Promise<WorkflowModeInfo[]> {
  return request<WorkflowModeInfo[]>('/workflows/modes')
}

/** 查询 Workflow 详情。 */
export function getWorkflowDetail(workflowId: number): Promise<WorkflowResponse> {
  return request<WorkflowResponse>(`/workflows/${workflowId}`)
}

/** 创建 Workflow。 */
export function createWorkflow(payload: WorkflowCreateRequest): Promise<WorkflowResponse> {
  return request<WorkflowResponse>('/workflows', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 更新 Workflow；agents 提供时整体替换成员。 */
export function updateWorkflow(
  workflowId: number,
  payload: WorkflowUpdateRequest,
): Promise<WorkflowResponse> {
  return request<WorkflowResponse>(`/workflows/${workflowId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** 删除 Workflow。 */
export function deleteWorkflow(workflowId: number): Promise<WorkflowDeleteResult> {
  return request<WorkflowDeleteResult>(`/workflows/${workflowId}`, { method: 'DELETE' })
}
