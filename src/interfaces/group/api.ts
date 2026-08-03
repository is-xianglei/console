import type {
  GroupJoinMode,
  GroupMemberRole,
  GroupType,
  GroupVisibility,
} from './model'

/** 创建群组请求。 */
export interface GroupCreateRequest {
  name: string
  slug: string
  description?: string | null
  avatar_url?: string | null
  group_type?: GroupType
  visibility?: GroupVisibility
  join_mode?: GroupJoinMode
  settings?: Record<string, unknown>
}

/** 更新群组请求。 */
export interface GroupUpdateRequest {
  name?: string | null
  slug?: string | null
  description?: string | null
  avatar_url?: string | null
  group_type?: GroupType | null
  visibility?: GroupVisibility | null
  join_mode?: GroupJoinMode | null
  settings?: Record<string, unknown> | null
  is_active?: boolean | null
}

/** 查询群组列表参数。 */
export interface GroupListParams {
  group_type?: string | null
  search?: string | null
}

/** 查询群组成员参数。 */
export interface GroupMemberListParams {
  include_pending?: boolean
}

/** 邀请群组成员请求。 */
export interface GroupMemberInviteRequest {
  user_id: number
  role?: GroupMemberRole
}

/** 更新群组成员角色请求。 */
export interface GroupMemberRoleUpdateRequest {
  role: GroupMemberRole
}

/** 转让群组负责人请求。 */
export interface GroupOwnerTransferRequest {
  user_id: number
}

export interface GroupDeleteResult {
  deleted: boolean
}

export interface GroupLeaveResult {
  left: boolean
}

export interface GroupRejectResult {
  rejected: boolean
}

export interface GroupRemoveMemberResult {
  removed: boolean
}
