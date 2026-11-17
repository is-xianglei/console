/**
 * 权限能力表（R7）。
 *
 * 当前无后端权限模型，`can` 默认放开（兜底「默认允许」），只集中登记**目标级**硬规则——
 * 例如「不能删除当前登录用户」（迁自 usePeopleManager）。
 * 后端接入权限后只改本文件：在 `targetRules` 里注册规则，或对 `can` 增加后端校验。
 *
 * TODO(权限)：后端字段来源待定。预计从用户角色 / 工作区角色 / 资源 owner 判断，
 * 在此处集中收敛，按钮层统一消费 `can()`，不再各写判断。
 */

export type PermissionAction =
  | 'create'
  | 'edit'
  | 'update'
  | 'delete'
  | 'toggle'
  | 'batch'
  | 'assignRole'
  | 'resetPassword'
  | 'remove'
  | 'join'
  | 'leave'

export type PermissionResource =
  | 'agent'
  | 'workflow'
  | 'department'
  | 'group'
  | 'person'
  | 'people'
  | 'memory'
  | 'skill'
  | 'session'
  | 'workspaceMember'
  | 'workspace'

export interface PermissionTarget {
  id?: number | string
  ownerId?: number | string | null
  /** 当前资源对象的「发起者/创建者」id，用于「不能删自己」之外的对象级规则。 */
  createdBy?: number | string | null
  /** 用户角色的字符串，用于 owner / admin 规则。 */
  role?: string
  /** 当前登录用户 id，供目标级规则比对。 */
  currentUserId?: number | string | null
  /** 操作发起者（当前登录用户）的工作区角色，用于「非管理员不能操作管理员」。 */
  operatorRole?: string
}

export interface PermissionDecision {
  allowed: boolean
  reason?: string
}

export type TargetRule = (
  resource: PermissionResource,
  action: PermissionAction,
  target: PermissionTarget | undefined,
) => PermissionDecision

/** 从目标中读取「资源行的工作区角色」（person 行级规则用）。 */
function resourceRole(target: PermissionTarget | undefined): string | undefined {
  if (!target) return undefined
  if (target.role != null) return target.role
  return undefined
}

/** 操作发起者的工作区角色（非管理员不可操作管理员）。 */
function operatorRole(target: PermissionTarget | undefined): string | undefined {
  return target?.operatorRole
}

/**
 * 目标级规则：按资源注册，命中即返回决定；不命中则视为「无规则 = 默认允许」。
 * 注意：规则按注册顺序求值，第一条命中生效。
 */
export const targetRules: Record<string, TargetRule> = {
  // people/person：当前登录用户不能删/停用自己；非管理员不能操作管理员（A6）。
  person: (_resource, action, target) => {
    if (target?.currentUserId == null) return { allowed: true }
    const isSelf = target.id != null && String(target.id) === String(target.currentUserId)
    if (action === 'delete') {
      if (isSelf) return { allowed: false, reason: '不能删除当前登录用户' }
    } else if (action === 'toggle') {
      if (isSelf) return { allowed: false, reason: '不能停用当前登录用户' }
    }
    const rowRole = resourceRole(target)
    const operator = operatorRole(target)
    // 非管理员不能操作管理员行（若自身即管理员则不拦）。
    if (rowRole === 'admin' && operator !== 'admin') {
      const label = action === 'delete' ? '不能删除管理员' : '不能操作管理员'
      return { allowed: false, reason: label }
    }
    return { allowed: true }
  },
  people: (_resource, action, target) => {
    if (target?.currentUserId == null) return { allowed: true }
    const isSelf = target.id != null && String(target.id) === String(target.currentUserId)
    if (action === 'delete') {
      if (isSelf) return { allowed: false, reason: '不能删除当前登录用户' }
    } else if (action === 'toggle') {
      if (isSelf) return { allowed: false, reason: '不能停用当前登录用户' }
    }
    const rowRole = resourceRole(target)
    const operator = operatorRole(target)
    if (rowRole === 'admin' && operator !== 'admin') {
      const label = action === 'delete' ? '不能删除管理员' : '不能操作管理员'
      return { allowed: false, reason: label }
    }
    return { allowed: true }
  },
  // skill：写操作（新建/编辑/启停/上传/删除）只有工作区 owner / admin 可调，member 只读。
  // 角色未知（工作区列表未加载）按无权限处理，后端同样会返回 403。
  skill: (_resource, _action, target) => {
    const role = operatorRole(target)
    if (role === 'owner' || role === 'admin') return { allowed: true }
    return { allowed: false, reason: '仅工作区所有者或管理员可修改技能' }
  },
  // workspace member：owner 不可移除；非 admin 不可改角色。
  workspaceMember: (_resource, _action, target) => {
    if (target?.role === 'owner') return { allowed: false, reason: '工作区所有者不可移除' }
    return { allowed: true }
  },
}

export const ALL_PERMISSION_ACTIONS: PermissionAction[] = [
  'create',
  'edit',
  'update',
  'delete',
  'toggle',
  'batch',
  'assignRole',
  'resetPassword',
  'remove',
  'join',
  'leave',
]

export const ALL_PERMISSION_RESOURCES: PermissionResource[] = [
  'agent',
  'workflow',
  'department',
  'group',
  'person',
  'people',
  'memory',
  'skill',
  'session',
  'workspaceMember',
  'workspace',
]
