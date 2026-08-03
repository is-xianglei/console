import type { WorkspaceMemberRole, WorkspaceType } from './model'

/** 工作区列表查询参数。 */
export interface GetWorkspaceListParams {
  limit?: number
  offset?: number
}

/** 创建工作区请求。 */
export interface WorkspaceCreateRequest {
  name: string
  slug: string
  display_name: string
  logo_url?: string | null
  workspace_type?: WorkspaceType
  industry?: string | null
  company_size?: string | null
  billing_email?: string | null
}

/** 更新工作区请求。 */
export interface WorkspaceUpdateRequest {
  display_name?: string | null
  logo_url?: string | null
  industry?: string | null
  company_size?: string | null
  billing_email?: string | null
  settings?: Record<string, unknown> | null
}

/** 邀请工作区成员请求。 */
export interface WorkspaceMemberInviteRequest {
  email: string
  role?: WorkspaceMemberRole
}

/** 更新工作区成员角色请求。 */
export interface WorkspaceMemberRoleUpdateRequest {
  role: WorkspaceMemberRole
}

/** OpenAPI 将删除响应声明为通用字典。 */
export type WorkspaceDeleteResult = Record<string, unknown>

/** OpenAPI 将移除成员响应声明为通用字典。 */
export type WorkspaceMemberDeleteResult = Record<string, unknown>
