import type {
  GroupCreateRequest,
  GroupDeleteResult,
  GroupLeaveResult,
  GroupListParams,
  GroupMemberInviteRequest,
  GroupMemberListParams,
  GroupMemberRoleUpdateRequest,
  GroupOwnerTransferRequest,
  GroupRejectResult,
  GroupRemoveMemberResult,
  GroupUpdateRequest,
} from '@/interfaces/group/api'
import type {
  GroupJoinResponse,
  GroupMemberResponse,
  GroupResponse,
} from '@/interfaces/group/model'
import { request } from './index'

/** 创建群组。 */
export function createGroup(
  workspaceId: number,
  payload: GroupCreateRequest,
): Promise<GroupResponse> {
  return request<GroupResponse>(`/workspaces/${workspaceId}/groups`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 查询工作区群组列表。 */
export function getGroupList(
  workspaceId: number,
  params?: GroupListParams,
): Promise<GroupResponse[]> {
  const query = new URLSearchParams()
  if (params?.group_type) query.set('group_type', params.group_type)
  if (params?.search) query.set('search', params.search)
  const queryString = query.toString()
  return request<GroupResponse[]>(
    `/workspaces/${workspaceId}/groups${queryString ? `?${queryString}` : ''}`,
  )
}

/** 查询群组详情。 */
export function getGroupDetail(workspaceId: number, groupId: number): Promise<GroupResponse> {
  return request<GroupResponse>(`/workspaces/${workspaceId}/groups/${groupId}`)
}

/** 更新群组。 */
export function updateGroup(
  workspaceId: number,
  groupId: number,
  payload: GroupUpdateRequest,
): Promise<GroupResponse> {
  return request<GroupResponse>(`/workspaces/${workspaceId}/groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** 删除群组。 */
export function deleteGroup(
  workspaceId: number,
  groupId: number,
): Promise<GroupDeleteResult> {
  return request<GroupDeleteResult>(`/workspaces/${workspaceId}/groups/${groupId}`, {
    method: 'DELETE',
  })
}

/** 查询群组成员列表。 */
export function getGroupMemberList(
  workspaceId: number,
  groupId: number,
  params?: GroupMemberListParams,
): Promise<GroupMemberResponse[]> {
  const query = new URLSearchParams()
  if (params?.include_pending != null) {
    query.set('include_pending', String(params.include_pending))
  }
  const queryString = query.toString()
  return request<GroupMemberResponse[]>(
    `/workspaces/${workspaceId}/groups/${groupId}/members${queryString ? `?${queryString}` : ''}`,
  )
}

/** 邀请用户加入群组。 */
export function createGroupMemberInvite(
  workspaceId: number,
  groupId: number,
  payload: GroupMemberInviteRequest,
): Promise<GroupJoinResponse> {
  return request<GroupJoinResponse>(
    `/workspaces/${workspaceId}/groups/${groupId}/members/invite`,
    { method: 'POST', body: JSON.stringify(payload) },
  )
}

/** 加入群组或创建加入申请。 */
export function createGroupMembership(
  workspaceId: number,
  groupId: number,
): Promise<GroupJoinResponse> {
  return request<GroupJoinResponse>(
    `/workspaces/${workspaceId}/groups/${groupId}/members/join`,
    { method: 'POST' },
  )
}

/** 当前用户退出群组。 */
export function deleteCurrentGroupMembership(
  workspaceId: number,
  groupId: number,
): Promise<GroupLeaveResult> {
  return request<GroupLeaveResult>(
    `/workspaces/${workspaceId}/groups/${groupId}/members/leave`,
    { method: 'POST' },
  )
}

/** 批准群组加入申请。 */
export function updateGroupMemberApproval(
  workspaceId: number,
  groupId: number,
  userId: number,
): Promise<GroupJoinResponse> {
  return request<GroupJoinResponse>(
    `/workspaces/${workspaceId}/groups/${groupId}/members/${userId}/approve`,
    { method: 'POST' },
  )
}

/** 拒绝群组加入申请。 */
export function deleteGroupMemberRequest(
  workspaceId: number,
  groupId: number,
  userId: number,
): Promise<GroupRejectResult> {
  return request<GroupRejectResult>(
    `/workspaces/${workspaceId}/groups/${groupId}/members/${userId}/request`,
    { method: 'DELETE' },
  )
}

/** 更新群组成员角色。 */
export function updateGroupMemberRole(
  workspaceId: number,
  groupId: number,
  userId: number,
  payload: GroupMemberRoleUpdateRequest,
): Promise<GroupJoinResponse> {
  return request<GroupJoinResponse>(
    `/workspaces/${workspaceId}/groups/${groupId}/members/${userId}/role`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  )
}

/** 移除群组成员。 */
export function deleteGroupMember(
  workspaceId: number,
  groupId: number,
  userId: number,
): Promise<GroupRemoveMemberResult> {
  return request<GroupRemoveMemberResult>(
    `/workspaces/${workspaceId}/groups/${groupId}/members/${userId}`,
    { method: 'DELETE' },
  )
}

/** 转让群组负责人。 */
export function updateGroupOwner(
  workspaceId: number,
  groupId: number,
  payload: GroupOwnerTransferRequest,
): Promise<GroupResponse> {
  return request<GroupResponse>(`/workspaces/${workspaceId}/groups/${groupId}/owner`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 查询当前用户在当前工作区加入的群组。 */
export function getMyGroupList(): Promise<GroupResponse[]> {
  return request<GroupResponse[]>('/users/me/groups')
}
