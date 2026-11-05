import { defineAsyncComponent, type Component } from 'vue'
import { isMarketWriter } from '@/utils/market'

/** 市场模块 key，同时也是 `/apps/:section` 的路由参数。 */
export type MarketSectionKey = 'discover' | 'installed' | 'updates' | 'mine' | 'review'

/** 判断模块可见性所需的身份信息。 */
export interface MarketAccess {
  /** 当前工作区角色，取自 authStore.currentWorkspace.membership_role。 */
  role: string | null | undefined
  /** 是否平台管理员，取自当前用户的 is_platform_admin。 */
  isPlatformAdmin: boolean
}

export interface MarketSection {
  key: MarketSectionKey
  label: string
  icon: string
  /** 模块根组件：无 props，按需自取 store。 */
  component: Component
  /** 缺省即所有人可见。 */
  visible?: (access: MarketAccess) => boolean
}

export const DEFAULT_MARKET_SECTION: MarketSectionKey = 'discover'

// 「已安装」和「版本更新」是同一份列表的两种筛选，共用一个组件，按路由参数区分。
const InstalledSection = defineAsyncComponent(() => import('./sections/installed/index.vue'))

// 组件按需加载，菜单只在进入对应模块时才拉取代码。
export const MARKET_SECTIONS: MarketSection[] = [
  { key: 'discover', label: '发现', icon: 'i-lucide-compass', component: defineAsyncComponent(() => import('./sections/discover/index.vue')) },
  { key: 'installed', label: '已安装', icon: 'i-lucide-package-check', component: InstalledSection },
  { key: 'updates', label: '版本更新', icon: 'i-lucide-refresh-cw', component: InstalledSection },
  // 「我的上架」接口要求当前工作区的所有者或管理员。
  { key: 'mine', label: '我的上架', icon: 'i-lucide-upload-cloud', component: defineAsyncComponent(() => import('./sections/mine/index.vue')), visible: (access) => isMarketWriter(access.role) },
  // 审核接口只认平台管理员，不看工作区。
  { key: 'review', label: '审核队列', icon: 'i-lucide-list-checks', component: defineAsyncComponent(() => import('./sections/review/index.vue')), visible: (access) => access.isPlatformAdmin },
]

/** 按身份过滤出可见模块，保持注册顺序。 */
export function getVisibleMarketSections(access: MarketAccess): MarketSection[] {
  return MARKET_SECTIONS.filter((section) => {
    if (!section.visible) return true
    return section.visible(access)
  })
}

/** 路由参数 → 可见模块；缺省、未知或无权访问时回落到「发现」。 */
export function resolveMarketSection(value: unknown, access: MarketAccess): MarketSection {
  const visible = getVisibleMarketSections(access)
  const matched = visible.find((section) => section.key === value)
  if (matched) return matched
  return visible.find((section) => section.key === DEFAULT_MARKET_SECTION)!
}
