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
  | 'plan'
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
}

export interface PermissionDecision {
  allowed: boolean
  reason?: string
}

export type TargetRule = (
  resource: PermissionResource,
  target: PermissionTarget | undefined,
) => PermissionDecision

/**
 * 目标级规则：按资源注册，命中即返回决定；不命中则视为「无规则 = 默认允许」。
 * 注意：规则按注册顺序求值，第一条命中生效。
 */
export const targetRules: Record<string, TargetRule> = {
  // people/person：当前登录用户不能删除自己。
  person: (_resource, target) => {
    if (target?.currentUserId == null) return { allowed: true }
    if (target.id != null && String(target.id) === String(target.currentUserId)) {
      return { allowed: false, reason: '不能删除当前登录用户' }
    }
    return { allowed: true }
  },
  people: (_resource, target) => {
    if (target?.currentUserId == null) return { allowed: true }
    if (target.id != null && String(target.id) === String(target.currentUserId)) {
      return { allowed: false, reason: '不能删除当前登录用户' }
    }
    return { allowed: true }
  },
  // workspace member：owner 不可移除；非 admin 不可改角色。
  workspaceMember: (_resource, target) => {
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
  'plan',
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
