import type {
  GetWorkspaceListParams,
  WorkspaceCreateRequest,
  WorkspaceDeleteResult,
  WorkspaceMemberDeleteResult,
  WorkspaceMemberInviteRequest,
  WorkspaceMemberRoleUpdateRequest,
  WorkspaceUpdateRequest,
} from '@/interfaces/workspace/api'
import type {
  WorkspaceMemberDetailResponse,
  WorkspaceMemberResponse,
  WorkspaceResponse,
} from '@/interfaces/workspace/model'
import { request } from './index'

function createListQuery(params?: GetWorkspaceListParams): string {
  const query = new URLSearchParams()
  if (params?.limit != null) query.set('limit', String(params.limit))
  if (params?.offset != null) query.set('offset', String(params.offset))
  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

/** 创建工作区。 */
export function createWorkspace(payload: WorkspaceCreateRequest): Promise<WorkspaceResponse> {
  return request<WorkspaceResponse>('/workspaces', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 查询工作区列表。 */
export function getWorkspaceList(
  params?: GetWorkspaceListParams,
): Promise<WorkspaceResponse[]> {
  return request<WorkspaceResponse[]>(`/workspaces${createListQuery(params)}`)
}

/** 查询工作区详情。 */
export function getWorkspaceDetail(workspaceId: number): Promise<WorkspaceResponse> {
  return request<WorkspaceResponse>(`/workspaces/${workspaceId}`)
}

/** 更新工作区。 */
export function updateWorkspace(
  workspaceId: number,
  payload: WorkspaceUpdateRequest,
): Promise<WorkspaceResponse> {
  return request<WorkspaceResponse>(`/workspaces/${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** 删除工作区。 */
export function deleteWorkspace(workspaceId: number): Promise<WorkspaceDeleteResult> {
  return request<WorkspaceDeleteResult>(`/workspaces/${workspaceId}`, { method: 'DELETE' })
}

/** 查询工作区成员列表。 */
export function getWorkspaceMemberList(
  workspaceId: number,
): Promise<WorkspaceMemberDetailResponse[]> {
  return request<WorkspaceMemberDetailResponse[]>(`/workspaces/${workspaceId}/members`)
}

/** 邀请成员加入工作区。 */
export function inviteWorkspaceMember(
  workspaceId: number,
  payload: WorkspaceMemberInviteRequest,
): Promise<WorkspaceMemberResponse> {
  return request<WorkspaceMemberResponse>(`/workspaces/${workspaceId}/members/invite`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 接受工作区邀请。 */
export function acceptWorkspaceInvite(workspaceId: number): Promise<WorkspaceMemberResponse> {
  return request<WorkspaceMemberResponse>(`/workspaces/${workspaceId}/members/accept`, {
    method: 'POST',
  })
}

/** 更新工作区成员角色。 */
export function updateWorkspaceMemberRole(
  workspaceId: number,
  userId: number,
  payload: WorkspaceMemberRoleUpdateRequest,
): Promise<WorkspaceMemberResponse> {
  return request<WorkspaceMemberResponse>(
    `/workspaces/${workspaceId}/members/${userId}/role`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  )
}

/** 移除工作区成员。 */
export function deleteWorkspaceMember(
  workspaceId: number,
  userId: number,
): Promise<WorkspaceMemberDeleteResult> {
  return request<WorkspaceMemberDeleteResult>(`/workspaces/${workspaceId}/members/${userId}`, {
    method: 'DELETE',
  })
}
