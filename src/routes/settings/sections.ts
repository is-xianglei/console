import { defineAsyncComponent, type Component } from 'vue'
import type { WorkspaceResponse } from '@/interfaces/workspace/model'

/** 设置页模块 key，同时也是 `/settings/:section` 的路由参数。 */
export type SettingsSectionKey =
  | 'profile'
  | 'password'
  | 'workspaces'
  | 'tools'
  | 'evolution'
  | 'channels'
  | 'models'
  | 'services'

/** 当前用户在当前工作区的角色，取自 authStore.currentWorkspace.membership_role。 */
export type WorkspaceRole = WorkspaceResponse['membership_role']

export interface SettingsSection {
  key: SettingsSectionKey
  label: string
  icon: string
  /** 模块根组件：无 props，按需自取 store。 */
  component: Component
  /** 缺省即所有人可见。 */
  visible?: (role: WorkspaceRole) => boolean
}

export const DEFAULT_SETTINGS_SECTION: SettingsSectionKey = 'profile'

/** 当前工作区的 owner / admin，可见并可修改工作区级配置。 */
export function isWorkspaceManager(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin'
}

// 组件按需加载，菜单只在进入对应模块时才拉取代码。
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'profile', label: '个人信息', icon: 'i-lucide-circle-user-round', component: defineAsyncComponent(() => import('./sections/profile/index.vue')) },
  { key: 'password', label: '修改密码', icon: 'i-lucide-key-round', component: defineAsyncComponent(() => import('./sections/password/index.vue')) },
  { key: 'workspaces', label: '工作区', icon: 'i-lucide-building-2', component: defineAsyncComponent(() => import('./sections/workspaces/index.vue')) },
  { key: 'tools', label: '工具权限', icon: 'i-lucide-shield-check', component: defineAsyncComponent(() => import('./sections/tools/index.vue')), visible: isWorkspaceManager },
  { key: 'evolution', label: '自进化', icon: 'i-lucide-sparkles', component: defineAsyncComponent(() => import('./sections/evolution/index.vue')) },
  { key: 'channels', label: '消息渠道', icon: 'i-lucide-message-circle', component: defineAsyncComponent(() => import('./sections/channels/index.vue')) },
  { key: 'models', label: '模型服务', icon: 'i-lucide-cpu', component: defineAsyncComponent(() => import('./sections/models/index.vue')), visible: isWorkspaceManager },
  { key: 'services', label: '服务配置', icon: 'i-lucide-server-cog', component: defineAsyncComponent(() => import('./sections/services/index.vue')), visible: isWorkspaceManager },
]

/** 按当前工作区角色过滤出可见模块，保持注册顺序。 */
export function getVisibleSettingsSections(role: WorkspaceRole): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((section) => section.visible?.(role) ?? true)
}

/** 路由参数 → 可见模块；缺省、未知或无权访问时回落到个人信息。 */
export function resolveSettingsSection(value: unknown, role: WorkspaceRole): SettingsSection {
  const visible = getVisibleSettingsSections(role)
  return visible.find((section) => section.key === value)
    ?? visible.find((section) => section.key === DEFAULT_SETTINGS_SECTION)!
}

/** 旧地址 `/profile?tab=` 的 tab → 设置页模块。 */
export function legacyProfileSection(tab: unknown): SettingsSectionKey {
  return tab === 'workspaces' || tab === 'password' ? tab : DEFAULT_SETTINGS_SECTION
}
