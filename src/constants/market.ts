import type {
  MarketListingKind,
  MarketListingStatus,
  MarketSkillAction,
  MarketVersionStatus,
} from '../interfaces/market/model'

/** 徽标语义色，与 Nuxt UI 的 color 取值一致。 */
export type MarketBadgeColor = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'

/** 市场卡片网格每页条数：3 列的整数倍。 */
export const MARKET_PAGE_SIZES = [12, 24, 48]

/** 审核队列每页条数。 */
export const MARKET_REVIEW_PAGE_SIZE = 10

/** 条目类型的展示名。 */
export const MARKET_KIND_LABELS: Record<MarketListingKind, string> = {
  agent: 'Agent',
  skill: 'Skill',
}

/** 条目状态的展示名与颜色。 */
export const MARKET_LISTING_STATUS_META: Record<MarketListingStatus, { label: string; color: MarketBadgeColor }> = {
  unlisted: { label: '未上架', color: 'neutral' },
  listed: { label: '已上架', color: 'success' },
  delisted: { label: '已下架', color: 'warning' },
  removed: { label: '平台已下架', color: 'error' },
}

/** 版本审核状态的展示名与颜色。 */
export const MARKET_VERSION_STATUS_META: Record<MarketVersionStatus, { label: string; color: MarketBadgeColor }> = {
  pending: { label: '待审核', color: 'warning' },
  approved: { label: '已通过', color: 'success' },
  rejected: { label: '已驳回', color: 'error' },
  withdrawn: { label: '已撤回', color: 'neutral' },
}

/** 安装或升级时每个 Skill 处理方式的展示名与颜色。 */
export const MARKET_SKILL_ACTION_META: Record<MarketSkillAction, { label: string; color: MarketBadgeColor }> = {
  create: { label: '新建', color: 'success' },
  restore: { label: '恢复', color: 'info' },
  reuse: { label: '复用', color: 'neutral' },
  conflict: { label: '冲突', color: 'error' },
  overwrite: { label: '覆盖', color: 'warning' },
  unbind: { label: '解绑', color: 'warning' },
}
