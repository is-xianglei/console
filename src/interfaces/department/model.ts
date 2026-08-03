/** 部门详情。 */
export interface DepartmentResponse {
  id: number
  workspace_id: number
  parent_id?: number | null
  name: string
  code?: string | null
  description?: string | null
  manager_id?: number | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

/** 部门树节点。 */
export interface DepartmentTreeResponse extends DepartmentResponse {
  children?: DepartmentTreeResponse[]
}

/** 部门成员详情。 */
export interface DepartmentMemberResponse {
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
  joined_at?: string | null
}

/** 成员部门分配结果。 */
export interface DepartmentAssignmentResponse {
  id: number
  workspace_id: number
  user_id: number
  department_id?: number | null
  job_title?: string | null
  updated_at: string
}
