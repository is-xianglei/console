import type { Directive, DirectiveBinding } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  targetRules,
  type PermissionAction,
  type PermissionDecision,
  type PermissionResource,
  type PermissionTarget,
} from '@/constants/permissions'

export interface UsePermissionsReturn {
  can: (action: PermissionAction, resource: PermissionResource, target?: PermissionTarget) => PermissionDecision
}

/**
 * 权限可见性（R7）。
 *
 * 兜底「默认允许」：后端尚无权限模型时 `can` 默认 true，只集中已知目标级硬规则
 * （「不能删自己」迁自 usePeopleManager，owner 不可移除迁自 workspace-member-panel）。
 * 后端补齐后只改 `src/constants/permissions.ts`，按钮层消费 `can()` 不再各写判断。
 */
export function usePermissions(): UsePermissionsReturn {
  const authStore = useAuthStore()

  function currentTarget(target?: PermissionTarget): PermissionTarget | undefined {
    const userId = authStore.state.user?.id
    const enriched = userId == null ? target : { ...target, currentUserId: userId }
    if (!enriched) return undefined
    // 操作发起者角色：留给 person 行级规则（A6：非管理员不能操作管理员），由按钮层用 workspace 成员角色传入。
    const operator = authStore.state.user as { workspace_role?: string } | null
    if (operator?.workspace_role) return { ...enriched, operatorRole: String(operator.workspace_role) }
    return enriched
  }

  function can(action: PermissionAction, resource: PermissionResource, target?: PermissionTarget): PermissionDecision {
    const enriched = currentTarget(target)
    const rule = targetRules[resource] as
      | ((res: PermissionResource, action: PermissionAction, t: PermissionTarget | undefined) => PermissionDecision)
      | undefined
    if (rule) {
      const decision = rule(resource, action, enriched)
      if (!decision.allowed) return decision
    }
    return { allowed: true }
  }

  return { can }
}

/** 解析 v-can 修饰符：缺省隐藏，.disable 改为 disabled + title 说明原因。 */
export function resolveCanModifiers(binding: { modifiers?: Partial<Record<string, boolean>> }): { mode: 'hide' | 'disable' } {
  if (binding.modifiers?.disable) return { mode: 'disable' }
  return { mode: 'hide' }
}

/**
 * v-can 指令：按权限决定元素可见性。
 * - 缺省：无权限直接隐藏（v-if 语义）；
 * - .disable：无权限时不隐藏，而是设为 disabled 并加 title 说明原因。
 *
 * 用法：`<button v-can:delete="{ resource: 'person', id: row.id }">删除</button>`
 */
export const vCan: Directive<HTMLElement, { resource: PermissionResource } & PermissionTarget> = {
  mounted(el, binding) {
    applyCan(el, binding)
  },
  updated(el, binding) {
    applyCan(el, binding)
  },
}

function applyCan(
  el: HTMLElement,
  binding: DirectiveBinding<{ resource: PermissionResource } & PermissionTarget>,
) {
  if (!binding.value) return
  const { resource, ...target } = binding.value
  const action = (binding.arg ?? 'delete') as PermissionAction

  const { can } = usePermissions()
  const decision = can(action, resource, target)
  if (decision.allowed) return

  const { mode } = resolveCanModifiers(binding)
  if (mode === 'hide') {
    el.style.display = 'none'
    return
  }
  // 禁用模式：确认命中一个可交互元素再置 disabled。
  const interactive = el.matches('button, a, [role="button"], input, select, textarea')
    ? el
    : el.querySelector('button, a, [role="button"], input, select, textarea')
  if (interactive) {
    ;(interactive as HTMLElement).setAttribute('disabled', 'true')
    if (decision.reason) (interactive as HTMLElement).setAttribute('title', decision.reason)
  }
}
