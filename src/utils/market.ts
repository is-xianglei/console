/**
 * 应用市场的纯函数：权限判断、查询参数、快照解析、安装按钮状态等。
 * 不依赖 store 与组件，便于单测。
 */
import type { GetMarketListingListParams } from '../interfaces/market/api'
import type {
  MarketAgentSnapshot,
  MarketCategory,
  MarketInstallReport,
  MarketInstalledTarget,
  MarketListing,
  MarketListingDetail,
  MarketListingKind,
  MarketListingStatus,
  MarketSkillFile,
  MarketSkillOutcome,
  MarketSkillSnapshot,
  MarketSnapshot,
  MarketVersion,
} from '../interfaces/market/model'

/** 浏览页的筛选条件；kind、category 为 'all' 表示不限。 */
export interface MarketBrowseFilters {
  kind: MarketListingKind | 'all'
  category: string
  keyword: string
  /** 只看官方条目；不勾选时官方和社区条目都看。 */
  official: boolean
  page: number
  pageSize: number
}

/** 「已安装」「版本更新」的分页条件。 */
export interface MarketInstalledFilters {
  /** true 为「版本更新」，只看有新版本的条目；false 为「已安装」。 */
  onlyUpdates: boolean
  page: number
  pageSize: number
}

/** 安装 / 升级按钮的展示状态。 */
export interface MarketInstallActionState {
  label: string
  disabled: boolean
  /** 禁用原因；可点击时为空串。 */
  reason: string
}

/** 安装 / 升级报告里各分组是否显示；为 false 时标题和内容都不渲染。 */
export interface MarketReportGroupVisibility {
  /** 工具组：绑定和丢弃的工具，只有 Agent 条目有。 */
  tools: boolean
  /** Skill 组：新建、恢复、复用、冲突等没有改动本地已有 Skill 的条目。 */
  skills: boolean
  /** 被覆盖或解绑的 Skill 组。 */
  changedSkills: boolean
}

/** 上架、下架、安装、升级都要求当前工作区的所有者或管理员，口径与后端一致。 */
export function isMarketWriter(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

/** 把浏览页筛选条件转成列表接口参数：页码换算成 offset，「不限」的条件不传。 */
export function buildListingQuery(filters: MarketBrowseFilters): GetMarketListingListParams {
  const params: GetMarketListingListParams = {
    limit: filters.pageSize,
    offset: (Math.max(1, filters.page) - 1) * filters.pageSize,
  }
  if (filters.kind !== 'all') params.kind = filters.kind
  if (filters.category !== 'all') params.category = filters.category
  const keyword = filters.keyword.trim()
  if (keyword) params.keyword = keyword
  if (filters.official) params.is_official = true
  return params
}

/**
 * 把「已安装」「版本更新」的分页条件转成列表接口参数，页码换算方式与浏览页一致。
 * 「版本更新」只传 has_update（有更新必然已安装），「已安装」只传 installed。
 */
export function buildInstalledQuery(filters: MarketInstalledFilters): GetMarketListingListParams {
  const params: GetMarketListingListParams = {
    limit: filters.pageSize,
    offset: (Math.max(1, filters.page) - 1) * filters.pageSize,
  }
  if (filters.onlyUpdates) params.has_update = true
  else params.installed = true
  return params
}

/** 分类 key 转中文名；分类列表还没加载或 key 未知时原样显示。 */
export function getCategoryLabel(categories: MarketCategory[], key: string | null | undefined): string {
  if (!key) return ''
  const category = categories.find((item) => item.key === key)
  if (category) return category.label
  return key
}

/** 快照是否为 Agent 条目的快照（带 agent 字段）。 */
export function isAgentSnapshot(snapshot: MarketSnapshot): snapshot is MarketAgentSnapshot {
  return 'agent' in snapshot
}

/** 快照里的名称：Agent 取 agent.name，Skill 取 skill.name。 */
export function getSnapshotName(snapshot: MarketSnapshot): string {
  if (isAgentSnapshot(snapshot)) return snapshot.agent.name
  return snapshot.skill.name
}

/** 快照里的全部 Skill：Agent 条目是它绑定的 Skill，Skill 条目就是它自己。 */
export function getSnapshotSkills(snapshot: MarketSnapshot): MarketSkillSnapshot[] {
  if (isAgentSnapshot(snapshot)) return snapshot.skills
  return [snapshot.skill]
}

/** 附带文件的字节数：文本按 UTF-8 编码计算，base64 按解码后的长度计算。 */
export function getSkillFileSize(file: MarketSkillFile): number {
  if (file.encoding !== 'base64') return new TextEncoder().encode(file.content).length
  const content = file.content.replace(/\s/g, '')
  let padding = 0
  if (content.endsWith('==')) padding = 2
  else if (content.endsWith('=')) padding = 1
  return Math.max(0, Math.floor((content.length * 3) / 4) - padding)
}

/** 字节数格式化为 B / KB / MB。 */
export function formatByteSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

/** 条目下的待审版本；后端保证每个条目最多一个。 */
export function getPendingVersion(versions: MarketVersion[]): MarketVersion | null {
  const pending = versions.find((version) => version.status === 'pending')
  return pending ?? null
}

/**
 * 「我的上架」里条目的名称：首次审核通过前条目没有名称，用最新版本的名称（versions 版本号大的在前）。
 * 版本被撤回或驳回后也一样；「待首次审核」由页面按 current_version_number 单独标出。
 */
export function getListingDisplayName(listing: MarketListing, versions: MarketVersion[]): string {
  if (listing.name) return listing.name
  const latestVersion = versions[0]
  // 条目都是提交版本时建出来的，至少有一个版本；这里只防御异常数据。
  if (!latestVersion) return '未命名条目'
  return latestVersion.name
}

/**
 * 详情页安装 / 升级按钮的状态，按优先级判断：
 * 1. 条目不是已上架状态，后端不给预览，不显示按钮（返回 null），说明见 getInstallUnavailableText；
 * 2. 已是最新版本；
 * 3. 没有写权限；
 * 4. 预览里有阻断项（同名冲突等），原因直接用后端的中文说明。
 */
export function getInstallActionState(
  detail: MarketListingDetail,
  canWrite: boolean,
): MarketInstallActionState | null {
  const preview = detail.install_preview
  if (!preview) return null

  let label = '安装'
  if (preview.mode === 'upgrade') label = `升级到 v${preview.target_version_number}`

  // 已装且已是最新版本：按钮本身说明状态，不再重复给原因。
  const installedVersion = preview.installed_version_number
  if (installedVersion !== null && installedVersion >= preview.target_version_number) {
    return { label: '已是最新版本', disabled: true, reason: '' }
  }

  if (!canWrite) {
    return { label, disabled: true, reason: '仅工作区所有者或管理员可以安装或升级' }
  }
  if (!preview.can_proceed) {
    return { label, disabled: true, reason: preview.blockers.join('；') }
  }
  return { label, disabled: false, reason: '' }
}

/** 覆盖和解绑会影响本地已有的 Skill，报告里单独成组。 */
export function isChangedMarketSkill(skill: MarketSkillOutcome): boolean {
  return skill.action === 'overwrite' || skill.action === 'unbind'
}

/**
 * 安装 / 升级报告里哪些分组要显示：分组没有内容就连标题一起隐藏，避免出现空标题。
 * Agent 的工具组总是显示，没有工具时内容为「无」；Agent 一个 Skill 都没有时，Skill 组同样显示「无」。
 */
export function getReportGroupVisibility(
  report: MarketInstallReport,
  kind: MarketListingKind,
): MarketReportGroupVisibility {
  let changedCount = 0
  for (const skill of report.skills) {
    if (isChangedMarketSkill(skill)) changedCount += 1
  }
  const otherCount = report.skills.length - changedCount
  const isAgent = kind === 'agent'

  // 只有覆盖、解绑类时，它们已经在「被覆盖或解绑的 Skill」组列出，Skill 组没有内容可显示。
  let showSkills = otherCount > 0
  if (isAgent && report.skills.length === 0) showSkills = true

  return {
    tools: isAgent,
    skills: showSkills,
    changedSkills: changedCount > 0,
  }
}

/**
 * 详情页没有安装预览时的说明。条目不是已上架状态时后端不给预览，安装、升级也会被拒绝；
 * 当前工作区装过的条目下架后仍能打开详情，这时提示「已下架」。
 */
export function getInstallUnavailableText(status: MarketListingStatus): string {
  if (status === 'delisted' || status === 'removed') return '条目已下架，不能安装或升级'
  return '条目未上架，不能安装或升级'
}

/** Agent / Skill 详情页的市场来源说明；随 Agent 一起装来的托管 Skill 要说明是跟着哪个 Agent 来的。 */
export function getInstalledFromLabel(target: MarketInstalledTarget): string {
  let name = target.listing_name
  // 装过的条目都审核通过过，名称实际总有值；这里只防御异常数据。
  if (!name) name = '未命名条目'
  if (target.installed_with_agent) return `来自应用市场：随 Agent「${name}」安装`
  return `来自应用市场：${name}`
}
