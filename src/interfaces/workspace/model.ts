/** 创建工作区时允许的工作区类型。 */
export type WorkspaceType = 'personal' | 'team' | 'enterprise'

/** 工作区成员可配置的角色。 */
export type WorkspaceMemberRole = 'admin' | 'member'

/** 工作区信息。 */
export interface WorkspaceResponse {
  id: number
  name: string
  slug: string
  display_name: string
  logo_url?: string | null
  workspace_type: string
  suspended: boolean
  industry?: string | null
  company_size?: string | null
  billing_email?: string | null
  plan: string
  quotas?: Record<string, unknown>
  settings?: Record<string, unknown>
  /** 仅用户工作区列表返回的当前用户角色。 */
  membership_role?: 'owner' | 'admin' | 'member' | null
  created_at: string
  updated_at: string
}

/** 工作区成员关系。 */
export interface WorkspaceMemberResponse {
  id: number
  workspace_id: number
  user_id: number
  role: string
  department_id?: number | null
  job_title?: string | null
  invited_by?: number | null
  invited_at?: string | null
  joined_at?: string | null
  created_at: string
  updated_at: string
}

/** 带用户资料的工作区成员信息。 */
export interface WorkspaceMemberDetailResponse {
  id: number
  workspace_id: number
  user_id: number
  username: string
  email: string
  full_name?: string | null
  avatar_url?: string | null
  role: string
  department_id?: number | null
  job_title?: string | null
  invited_by?: number | null
  invited_at?: string | null
  joined_at?: string | null
  created_at: string
}
