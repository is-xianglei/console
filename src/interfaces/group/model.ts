export type GroupType = 'team' | 'community' | 'region' | 'custom'
export type GroupVisibility = 'workspace' | 'private' | 'public'
export type GroupJoinMode = 'invite' | 'open' | 'approval'
export type GroupMemberRole = 'admin' | 'member'

/** 群组详情。 */
export interface GroupResponse {
  id: number
  workspace_id: number
  name: string
  slug: string
  description?: string | null
  avatar_url?: string | null
  group_type: string
  created_by: number
  owner_id: number
  visibility: string
  join_mode: string
  settings?: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

/** 群组成员详情。 */
export interface GroupMemberResponse {
  id: number
  group_id: number
  user_id: number
  username: string
  email: string
  full_name?: string | null
  avatar_url?: string | null
  role: string
  status: string
  invited_by?: number | null
  joined_at?: string | null
  created_at: string
}

/** 加入、邀请或成员变更结果。 */
export interface GroupJoinResponse {
  group_id: number
  user_id: number
  role: string
  status: string
  joined_at?: string | null
}
