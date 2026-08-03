import type {
  DepartmentCreateRequest,
  DepartmentDeleteResult,
  DepartmentMemberListParams,
  DepartmentSetMemberRequest,
  DepartmentUpdateRequest,
} from '@/interfaces/department/api'
import type {
  DepartmentAssignmentResponse,
  DepartmentMemberResponse,
  DepartmentResponse,
  DepartmentTreeResponse,
} from '@/interfaces/department/model'
import { request } from './index'

/** 创建部门。 */
export function createDepartment(
  workspaceId: number,
  payload: DepartmentCreateRequest,
): Promise<DepartmentResponse> {
  return request<DepartmentResponse>(`/workspaces/${workspaceId}/departments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 查询工作区部门列表。 */
export function getDepartmentList(workspaceId: number): Promise<DepartmentResponse[]> {
  return request<DepartmentResponse[]>(`/workspaces/${workspaceId}/departments`)
}

/** 查询工作区部门树。 */
export function getDepartmentTree(workspaceId: number): Promise<DepartmentTreeResponse[]> {
  return request<DepartmentTreeResponse[]>(`/workspaces/${workspaceId}/departments/tree`)
}

/** 查询部门详情。 */
export function getDepartmentDetail(
  workspaceId: number,
  departmentId: number,
): Promise<DepartmentResponse> {
  return request<DepartmentResponse>(
    `/workspaces/${workspaceId}/departments/${departmentId}`,
  )
}

/** 更新部门。 */
export function updateDepartment(
  workspaceId: number,
  departmentId: number,
  payload: DepartmentUpdateRequest,
): Promise<DepartmentResponse> {
  return request<DepartmentResponse>(
    `/workspaces/${workspaceId}/departments/${departmentId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  )
}

/** 删除部门。 */
export function deleteDepartment(
  workspaceId: number,
  departmentId: number,
): Promise<DepartmentDeleteResult> {
  return request<DepartmentDeleteResult>(
    `/workspaces/${workspaceId}/departments/${departmentId}`,
    { method: 'DELETE' },
  )
}

/** 查询部门的祖先部门列表。 */
export function getDepartmentAncestorList(
  workspaceId: number,
  departmentId: number,
): Promise<DepartmentResponse[]> {
  return request<DepartmentResponse[]>(
    `/workspaces/${workspaceId}/departments/${departmentId}/ancestors`,
  )
}

/** 查询部门的子孙部门列表。 */
export function getDepartmentDescendantList(
  workspaceId: number,
  departmentId: number,
): Promise<DepartmentResponse[]> {
  return request<DepartmentResponse[]>(
    `/workspaces/${workspaceId}/departments/${departmentId}/descendants`,
  )
}

/** 查询部门成员列表。 */
export function getDepartmentMemberList(
  workspaceId: number,
  departmentId: number,
  params?: DepartmentMemberListParams,
): Promise<DepartmentMemberResponse[]> {
  const query = new URLSearchParams()
  if (params?.include_descendants != null) {
    query.set('include_descendants', String(params.include_descendants))
  }
  const queryString = query.toString()
  return request<DepartmentMemberResponse[]>(
    `/workspaces/${workspaceId}/departments/${departmentId}/members${queryString ? `?${queryString}` : ''}`,
  )
}

/** 设置或清除成员所属部门。 */
export function updateMemberDepartment(
  workspaceId: number,
  userId: number,
  payload: DepartmentSetMemberRequest,
): Promise<DepartmentAssignmentResponse> {
  return request<DepartmentAssignmentResponse>(
    `/workspaces/${workspaceId}/members/${userId}/department`,
    { method: 'POST', body: JSON.stringify(payload) },
  )
}
