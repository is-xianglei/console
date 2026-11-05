import type {
  ApproveMarketVersionRequest,
  CreateMarketSubmissionRequest,
  GetMarketInstallByTargetParams,
  GetMarketListingListParams,
  GetMarketReviewListParams,
  GetMyMarketListingDetailParams,
  MarketListingPage,
  MarketReasonRequest,
  MarketReviewPage,
} from '../interfaces/market/api'
import type {
  MarketCategory,
  MarketInstallResult,
  MarketInstalledTarget,
  MarketListing,
  MarketListingDetail,
  MarketMyListingItem,
  MarketVersion,
} from '../interfaces/market/model'
import { request } from './index'

/** 把查询参数拼成 query string；未填写的参数不带，布尔值写成 true / false。 */
function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    query.set(key, String(value))
  }
  const queryString = query.toString()
  if (!queryString) return ''
  return `?${queryString}`
}

/** GET /api/market/categories — 市场分类（key + 中文名）。 */
export function getMarketCategoryList(): Promise<MarketCategory[]> {
  return request<MarketCategory[]>('/market/categories')
}

/**
 * GET /api/market/listings — 分页浏览条目，带当前工作区的安装状态；筛选和分页都在服务端完成。
 * 默认只有已上架条目，按已安装筛选时也包含已下架的。
 */
export function getMarketListingList(params: GetMarketListingListParams = {}): Promise<MarketListingPage> {
  const query = buildQuery({
    kind: params.kind,
    category: params.category,
    keyword: params.keyword,
    installed: params.installed,
    has_update: params.has_update,
    is_official: params.is_official,
    limit: params.limit,
    offset: params.offset,
  })
  return request<MarketListingPage>(`/market/listings${query}`)
}

/** GET /api/market/listings/{listing_id} — 当前版本快照全文和安装预览。 */
export function getMarketListingDetail(listingId: number): Promise<MarketListingDetail> {
  return request<MarketListingDetail>(`/market/listings/${listingId}`)
}

/**
 * GET /api/market/installs/by-target — 当前工作区的 Agent 或 Skill 是从哪个市场条目装来的。
 * 不是从市场装来的时返回 null，属于正常情况。
 */
export function getMarketInstallByTarget(params: GetMarketInstallByTargetParams): Promise<MarketInstalledTarget | null> {
  const query = buildQuery({ kind: params.kind, target_id: params.target_id })
  return request<MarketInstalledTarget | null>(`/market/installs/by-target${query}`)
}

/** POST /api/market/listings/{listing_id}/install — 安装到当前工作区。 */
export function installMarketListing(listingId: number): Promise<MarketInstallResult> {
  return request<MarketInstallResult>(`/market/listings/${listingId}/install`, { method: 'POST' })
}

/** POST /api/market/listings/{listing_id}/upgrade — 把已安装的条目原地升级到当前版本。 */
export function upgradeMarketListing(listingId: number): Promise<MarketInstallResult> {
  return request<MarketInstallResult>(`/market/listings/${listingId}/upgrade`, { method: 'POST' })
}

/** POST /api/market/submissions — 提交上架申请或新版本，生成一个待审版本。 */
export function createMarketSubmission(payload: CreateMarketSubmissionRequest): Promise<MarketVersion> {
  return request<MarketVersion>('/market/submissions', { method: 'POST', body: JSON.stringify(payload) })
}

/** GET /api/market/mine — 当前工作区的全部条目，每个条目附带全部版本。 */
export function getMyMarketListingList(): Promise<MarketMyListingItem[]> {
  return request<MarketMyListingItem[]>('/market/mine')
}

/**
 * GET /api/market/mine/by-source — 按源 Agent 或 Skill 查当前工作区的条目，结构与 /mine 的单个条目相同。
 * 还没有条目时返回 null，属于正常情况。
 */
export function getMyMarketListingDetail(params: GetMyMarketListingDetailParams): Promise<MarketMyListingItem | null> {
  const query = buildQuery({ kind: params.kind, source_id: params.source_id })
  return request<MarketMyListingItem | null>(`/market/mine/by-source${query}`)
}

/** POST /api/market/versions/{version_id}/withdraw — 撤回待审版本。 */
export function withdrawMarketVersion(versionId: number): Promise<MarketVersion> {
  return request<MarketVersion>(`/market/versions/${versionId}/withdraw`, { method: 'POST' })
}

/** POST /api/market/listings/{listing_id}/delist — 作者下架。 */
export function delistMarketListing(listingId: number): Promise<MarketListing> {
  return request<MarketListing>(`/market/listings/${listingId}/delist`, { method: 'POST' })
}

/** POST /api/market/listings/{listing_id}/relist — 作者重新上架，只能从 delisted 恢复。 */
export function relistMarketListing(listingId: number): Promise<MarketListing> {
  return request<MarketListing>(`/market/listings/${listingId}/relist`, { method: 'POST' })
}

/** GET /api/market/admin/versions — 平台管理员查询待审版本（含快照全文）。 */
export function getMarketReviewList(params: GetMarketReviewListParams = {}): Promise<MarketReviewPage> {
  const query = buildQuery({
    status: params.status,
    limit: params.limit,
    offset: params.offset,
  })
  return request<MarketReviewPage>(`/market/admin/versions${query}`)
}

/** POST /api/market/admin/versions/{version_id}/approve — 审核通过，审核意见可不填。 */
export function approveMarketVersion(
  versionId: number,
  payload: ApproveMarketVersionRequest = {},
): Promise<MarketVersion> {
  return request<MarketVersion>(`/market/admin/versions/${versionId}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** POST /api/market/admin/versions/{version_id}/reject — 驳回，理由必填。 */
export function rejectMarketVersion(versionId: number, payload: MarketReasonRequest): Promise<MarketVersion> {
  return request<MarketVersion>(`/market/admin/versions/${versionId}/reject`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** POST /api/market/admin/listings/{listing_id}/remove — 平台强制下架，理由必填。 */
export function removeMarketListing(listingId: number, payload: MarketReasonRequest): Promise<MarketListing> {
  return request<MarketListing>(`/market/admin/listings/${listingId}/remove`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
