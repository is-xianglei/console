/** 创建部门请求。 */
export interface DepartmentCreateRequest {
  parent_id?: number | null
  name: string
  code?: string | null
  description?: string | null
  manager_id?: number | null
  sort_order?: number
  is_active?: boolean
}

/** 更新部门请求。 */
export interface DepartmentUpdateRequest {
  parent_id?: number | null
  name?: string | null
  code?: string | null
  description?: string | null
  manager_id?: number | null
  sort_order?: number | null
  is_active?: boolean | null
}

/** 查询部门成员参数。 */
export interface DepartmentMemberListParams {
  include_descendants?: boolean
}

/** 设置成员部门请求。 */
export interface DepartmentSetMemberRequest {
  department_id?: number | null
  job_title?: string | null
}

/** 删除部门结果。 */
export interface DepartmentDeleteResult {
  deleted: boolean
}
