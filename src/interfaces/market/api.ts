import type {
  MarketBrowseItem,
  MarketListingKind,
  MarketReviewItem,
  MarketVersionStatus,
} from './model'

/**
 * GET /api/market/listings 查询参数，多个条件之间是 AND。
 * installed=true 时返回当前工作区有效安装的全部条目（含已下架、平台已下架）；其他组合只返回已上架条目。
 */
export interface GetMarketListingListParams {
  kind?: MarketListingKind
  category?: string
  /** 对名称和简介做模糊匹配。 */
  keyword?: string
  /** 当前工作区是否已安装（有效安装）。 */
  installed?: boolean
  /** 是否已安装且有新版本。 */
  has_update?: boolean
  /** 是否官方条目。 */
  is_official?: boolean
  /** 默认 20，取值 1–100。 */
  limit?: number
  offset?: number
}

/** GET /api/market/listings 分页结果；total 是筛选后的总数。 */
export interface MarketListingPage {
  items: MarketBrowseItem[]
  total: number
  limit: number
  offset: number
}

/** POST /api/market/submissions 请求体：提交新条目或新版本。 */
export interface CreateMarketSubmissionRequest {
  kind: MarketListingKind
  /** 要上架的 Agent 或 Skill 的 ID，必须属于当前工作区。 */
  source_id: number
  category: string
  release_note?: string | null
}

/** GET /api/market/mine/by-source 查询参数：按源 Agent 或 Skill 查当前工作区的条目。 */
export interface GetMyMarketListingDetailParams {
  kind: MarketListingKind
  /** 源 Agent 或 Skill 的 ID。 */
  source_id: number
}

/** GET /api/market/installs/by-target 查询参数：按安装出来的 Agent 或 Skill 查它来自哪个条目。 */
export interface GetMarketInstallByTargetParams {
  kind: MarketListingKind
  /** 当前工作区里 Agent 或 Skill 的 ID。 */
  target_id: number
}

/** POST /api/market/admin/versions/{id}/approve 请求体，审核意见可不填。 */
export interface ApproveMarketVersionRequest {
  comment?: string | null
}

/** 驳回版本和强制下架共用的请求体，原因必填。 */
export interface MarketReasonRequest {
  reason: string
}

/** GET /api/market/admin/versions 查询参数，status 默认 pending。 */
export interface GetMarketReviewListParams {
  status?: MarketVersionStatus
  limit?: number
  offset?: number
}

/** GET /api/market/admin/versions 分页结果。 */
export interface MarketReviewPage {
  items: MarketReviewItem[]
  total: number
  limit: number
  offset: number
}
