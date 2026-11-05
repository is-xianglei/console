/**
 * 应用市场（Agent 市场与 Skill 市场）的业务模型。
 * 字段与后端 AgentOS market/schemas.py 保持一致，时间均为 ISO 字符串。
 */

/** 条目类型。 */
export type MarketListingKind = 'agent' | 'skill'

/**
 * 条目状态：
 * - unlisted：还没有审核通过的版本；
 * - listed：已上架；
 * - delisted：作者下架；
 * - removed：平台管理员下架，或官方预置已从代码中删除。
 */
export type MarketListingStatus = 'unlisted' | 'listed' | 'delisted' | 'removed'

/** 版本审核状态。 */
export type MarketVersionStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

/** 工具被丢弃的原因：找不到、已停用、自建 Agent 不允许绑定。 */
export type MarketToolDropReason = 'not_found' | 'disabled' | 'not_bindable'

/**
 * 安装或升级时每个 Skill 的处理方式：
 * create 新建，restore 恢复同名的软删记录，reuse 复用内容相同的同名记录，
 * conflict 同名但内容不同（整个安装或升级会被拒绝），
 * overwrite 升级时用新内容覆盖托管 Skill，unbind 升级时只解绑、不删除。
 */
export type MarketSkillAction = 'create' | 'restore' | 'reuse' | 'conflict' | 'overwrite' | 'unbind'

/** 市场分类，key 取自 GET /api/market/categories。 */
export interface MarketCategory {
  key: string
  label: string
}

/** Skill 快照里的附带文件；utf-8 为文本原文，base64 为二进制编码。 */
export interface MarketSkillFile {
  encoding: string
  content: string
}

/** Skill 快照，字段与 skill 域的 SkillBundle 一致。 */
export interface MarketSkillSnapshot {
  name: string
  /** SKILL.md 原文（含 frontmatter）。 */
  content: string
  /** 相对路径 → 文件内容，不含 SKILL.md。 */
  extra_files: Record<string, MarketSkillFile>
  skill_hash: string
}

/** Agent 快照中的 Agent 本体。 */
export interface MarketAgentSnapshotBody {
  name: string
  description: string | null
  system_prompt: string
  /** 绑定工具的 tool_key，不含运行时自动追加的 Skill 相关工具。 */
  tool_keys: string[]
}

/** Agent 条目的快照：Agent 本体加上它绑定的全部 Skill 内容。 */
export interface MarketAgentSnapshot {
  agent: MarketAgentSnapshotBody
  skills: MarketSkillSnapshot[]
}

/** Skill 条目的快照。 */
export interface MarketSkillListingSnapshot {
  skill: MarketSkillSnapshot
}

/** 版本快照：提交那一刻生成，之后不可变。 */
export type MarketSnapshot = MarketAgentSnapshot | MarketSkillListingSnapshot

/** 市场条目（上架、下架、强制下架接口的返回，以及「我的上架」里的条目）。 */
export interface MarketListing {
  id: number
  kind: MarketListingKind
  is_official: boolean
  official_key: string | null
  publisher_workspace_id: number | null
  source_agent_id: number | null
  source_skill_id: number | null
  status: MarketListingStatus
  /** 下架原因。 */
  status_reason: string | null
  /** 最新一个审核通过的版本号；还没有通过的版本时为空。 */
  current_version_number: number | null
  /** 当前版本的名称，首次审核通过前为空。 */
  name: string | null
  summary: string | null
  category: string | null
  created_by_user_id: number | null
  created_at: string
  updated_at: string
}

/** 版本元数据，不含快照全文。 */
export interface MarketVersion {
  id: number
  listing_id: number
  version_number: number
  /** 该版本快照里的名称；条目的 name 在首次审核通过前为空，用最新版本的名称展示。 */
  name: string
  status: MarketVersionStatus
  /** 提交时选择的分类。 */
  category: string
  release_note: string | null
  snapshot_hash: string
  submitted_by_user_id: number | null
  reviewed_by_user_id: number | null
  reviewed_at: string | null
  /** 审核意见；驳回时为驳回理由。 */
  review_comment: string | null
  created_at: string
  updated_at: string
}

/** 带快照全文的版本（详情页当前版本、审核队列）。 */
export interface MarketVersionDetail extends MarketVersion {
  snapshot: MarketSnapshot
}

/** 浏览列表项：条目展示字段加上当前工作区的安装状态。 */
export interface MarketBrowseItem {
  id: number
  kind: MarketListingKind
  name: string | null
  summary: string | null
  category: string | null
  is_official: boolean
  /** 列表只在按已安装筛选时才会出现非 listed 的条目。 */
  status: MarketListingStatus
  /** 下架原因。 */
  status_reason: string | null
  current_version_number: number | null
  /** 发布方：官方条目为「官方」，社区条目为发布工作区的展示名。 */
  publisher_name: string | null
  install_count: number
  /** 当前工作区是否有有效安装。 */
  installed: boolean
  installed_version_number: number | null
  /** 已安装、条目仍在上架且有更新的版本，即可以升级。 */
  has_update: boolean
  updated_at: string
}

/** 不可用而被丢弃的工具。 */
export interface MarketDroppedTool {
  tool_key: string
  reason: MarketToolDropReason
  /** 丢弃原因的中文说明。 */
  message: string
}

/** 单个 Skill 的处理结果。 */
export interface MarketSkillOutcome {
  name: string
  action: MarketSkillAction
  /** 对应的 Skill ID；预览时要新建的还没有 ID。 */
  skill_id: number | null
}

/** 安装或升级报告：绑定和丢弃的工具，以及每个 Skill 的处理结果。 */
export interface MarketInstallReport {
  bound_tool_keys: string[]
  dropped_tools: MarketDroppedTool[]
  skills: MarketSkillOutcome[]
}

/** 安装或升级预览：与实际执行用同一套判定代码，只是不写库。 */
export interface MarketInstallPreview {
  /** 没装过时为安装，已装过时为升级。 */
  mode: 'install' | 'upgrade'
  installed_version_number: number | null
  target_version_number: number
  /** 能否执行；为 false 时原因见 blockers。 */
  can_proceed: boolean
  blockers: string[]
  /** 安装 Agent 时本工作区是否已有同名 Agent。 */
  agent_name_conflict: boolean
  report: MarketInstallReport
}

/** 条目详情：当前版本快照全文加上当前工作区的安装预览。 */
export interface MarketListingDetail {
  listing: MarketBrowseItem
  status: MarketListingStatus
  status_reason: string | null
  /** 还没有审核通过的版本时为空。 */
  current_version: MarketVersionDetail | null
  /** 条目不是已上架状态时为空（有有效安装的工作区能查看已下架条目，这时也为空）。 */
  install_preview: MarketInstallPreview | null
}

/** 安装记录。 */
export interface MarketInstallRecord {
  id: number
  listing_id: number
  workspace_id: number
  installed_version_number: number
  target_agent_id: number | null
  target_skill_id: number | null
  /** 安装 Agent 时新建或恢复的 Skill ID，升级时只覆盖这些。 */
  managed_skill_ids: number[]
  installed_by_user_id: number
  created_at: string
  updated_at: string
}

/** 当前工作区里的 Agent 或 Skill 是从哪个市场条目装来的（GET /api/market/installs/by-target）。 */
export interface MarketInstalledTarget {
  listing_id: number
  /** 条目当前的名称；装过的条目都审核通过过，实际总有值。 */
  listing_name: string | null
  listing_status: MarketListingStatus
  installed_version_number: number
  /** 为 true 表示这是随 Agent 条目一起装来的托管 Skill，listing_id 指向那个 Agent 条目。 */
  installed_with_agent: boolean
}

/** 安装、升级接口的返回。 */
export interface MarketInstallResult {
  install: MarketInstallRecord
  report: MarketInstallReport
}

/** 「我的上架」里的一项：条目及其全部版本（版本号大的在前）。 */
export interface MarketMyListingItem {
  listing: MarketListing
  versions: MarketVersion[]
}

/** 审核队列里的一项：带快照全文的版本、所属条目和发布工作区名称。 */
export interface MarketReviewItem {
  version: MarketVersionDetail
  listing: MarketListing
  publisher_name: string | null
}
