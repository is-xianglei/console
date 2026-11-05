/**
 * 应用市场状态：分类、浏览、已安装与版本更新、详情与安装、我的上架、审核队列。
 * 接口错误在这里转成后端返回的中文 message 交给页面展示；
 * 每类列表请求带递增序号，筛选变化或切换工作区后，旧请求的响应直接丢弃。
 */
import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ApiError } from '../http'
import {
  approveMarketVersion,
  createMarketSubmission,
  delistMarketListing,
  getMarketCategoryList,
  getMarketInstallByTarget,
  getMarketListingDetail,
  getMarketListingList,
  getMarketReviewList,
  getMyMarketListingDetail,
  getMyMarketListingList,
  installMarketListing,
  rejectMarketVersion,
  relistMarketListing,
  removeMarketListing,
  upgradeMarketListing,
  withdrawMarketVersion,
} from '../http/market'
import type {
  CreateMarketSubmissionRequest,
  GetMarketListingListParams,
  GetMarketReviewListParams,
} from '../interfaces/market/api'
import type {
  MarketBrowseItem,
  MarketCategory,
  MarketInstallResult,
  MarketInstalledTarget,
  MarketListingDetail,
  MarketListingKind,
  MarketMyListingItem,
  MarketReviewItem,
  MarketVersion,
} from '../interfaces/market/model'

interface MarketState {
  categories: MarketCategory[]
  /** 浏览页当前页的条目。 */
  browseItems: MarketBrowseItem[]
  browseTotal: number
  browseLoading: boolean
  /** 「已安装」或「版本更新」当前页的条目，两个模块共用。 */
  installedItems: MarketBrowseItem[]
  installedTotal: number
  installedLoading: boolean
  detail: MarketListingDetail | null
  detailLoading: boolean
  myListings: MarketMyListingItem[]
  myListingsLoading: boolean
  /** Agent / Skill 详情页「申请上架 / 提交新版本」入口对应的条目；还没有条目时为 null。 */
  listingBySource: MarketMyListingItem | null
  /** Agent / Skill 详情页的对象是从哪个市场条目装来的；不是从市场装来的为 null。 */
  installedFrom: MarketInstalledTarget | null
  /** 当前对象的 installedFrom 是否已查过；查到之前不显示「申请上架」，避免入口先出现再消失。 */
  installedFromLoaded: boolean
  reviewItems: MarketReviewItem[]
  reviewTotal: number
  reviewLoading: boolean
}

/** 加载失败：带状态码，页面据此区分 404（不存在或无权查看）与其他错误。 */
export interface MarketLoadError {
  message: string
  status: number
}

/** 安装、升级的结果：成功带报告，失败带后端的中文说明。 */
export interface MarketInstallOutcome {
  result: MarketInstallResult | null
  error: string | null
}

/** 提交上架的结果：成功带新生成的待审版本。 */
export interface MarketSubmitOutcome {
  version: MarketVersion | null
  error: string | null
}

/** 后端错误直接用它的中文 message；网络异常等非接口错误用兜底文案。 */
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message
  return fallback
}

export const useMarketStore = defineStore('market', () => {
  const state = reactive<MarketState>({
    categories: [],
    browseItems: [],
    browseTotal: 0,
    browseLoading: false,
    installedItems: [],
    installedTotal: 0,
    installedLoading: false,
    detail: null,
    detailLoading: false,
    myListings: [],
    myListingsLoading: false,
    listingBySource: null,
    installedFrom: null,
    installedFromLoaded: false,
    reviewItems: [],
    reviewTotal: 0,
    reviewLoading: false,
  })

  let browseRequest = 0
  let installedRequest = 0
  /** installedItems 当前是不是「版本更新」的结果；换到另一个模块时据此先清空。 */
  let installedOnlyUpdates = false
  let detailRequest = 0
  let myListingsRequest = 0
  let listingBySourceRequest = 0
  /** listingBySource 当前对应的源对象，形如 `agent:12`；换了源对象时据此先清空。 */
  let listingBySourceKey = ''
  let installedFromRequest = 0
  /** installedFrom 当前对应的对象，形如 `skill:8`；换了对象时据此先清空。 */
  let installedFromKey = ''
  let reviewRequest = 0

  /** 分类是全平台共用的常量，加载过一次就不再请求。 */
  async function loadCategories(): Promise<string | null> {
    if (state.categories.length) return null
    try {
      state.categories = await getMarketCategoryList()
      return null
    } catch (error) {
      return errorMessage(error, '市场分类加载失败')
    }
  }

  /** 浏览页：按筛选条件拉取一页已上架条目。 */
  async function loadBrowsePage(params: GetMarketListingListParams): Promise<string | null> {
    const request = ++browseRequest
    state.browseLoading = true
    try {
      const page = await getMarketListingList(params)
      if (request !== browseRequest) return null
      state.browseItems = page.items
      state.browseTotal = page.total
      return null
    } catch (error) {
      if (request !== browseRequest) return null
      state.browseItems = []
      state.browseTotal = 0
      return errorMessage(error, '市场列表加载失败')
    } finally {
      if (request === browseRequest) state.browseLoading = false
    }
  }

  /**
   * 「已安装」「版本更新」：按当前工作区的安装状态拉取一页条目，筛选和分页都由后端完成。
   * 两个模块共用一份状态，换到另一个模块时先清空，避免短暂显示另一个模块的条目。
   */
  async function loadInstalledPage(params: GetMarketListingListParams): Promise<string | null> {
    const request = ++installedRequest
    const onlyUpdates = params.has_update === true
    if (onlyUpdates !== installedOnlyUpdates) {
      state.installedItems = []
      state.installedTotal = 0
      installedOnlyUpdates = onlyUpdates
    }
    state.installedLoading = true
    try {
      const page = await getMarketListingList(params)
      if (request !== installedRequest) return null
      state.installedItems = page.items
      state.installedTotal = page.total
      return null
    } catch (error) {
      if (request !== installedRequest) return null
      state.installedItems = []
      state.installedTotal = 0
      return errorMessage(error, '已安装条目加载失败')
    } finally {
      if (request === installedRequest) state.installedLoading = false
    }
  }

  /** 条目详情和当前工作区的安装预览；换了条目先清空，避免短暂显示上一个条目。 */
  async function loadDetail(listingId: number): Promise<MarketLoadError | null> {
    const request = ++detailRequest
    if (state.detail && state.detail.listing.id !== listingId) state.detail = null
    state.detailLoading = true
    try {
      const detail = await getMarketListingDetail(listingId)
      if (request !== detailRequest) return null
      state.detail = detail
      return null
    } catch (error) {
      if (request !== detailRequest) return null
      state.detail = null
      let status = 0
      if (error instanceof ApiError) status = error.status
      return { message: errorMessage(error, '条目详情加载失败'), status }
    } finally {
      if (request === detailRequest) state.detailLoading = false
    }
  }

  /** 安装到当前工作区；成功后由页面重新拉详情，刷新安装状态和预览。 */
  async function installListing(listingId: number): Promise<MarketInstallOutcome> {
    try {
      const result = await installMarketListing(listingId)
      return { result, error: null }
    } catch (error) {
      return { result: null, error: errorMessage(error, '安装失败') }
    }
  }

  /** 原地升级到当前版本；成功后由页面重新拉详情。 */
  async function upgradeListing(listingId: number): Promise<MarketInstallOutcome> {
    try {
      const result = await upgradeMarketListing(listingId)
      return { result, error: null }
    } catch (error) {
      return { result: null, error: errorMessage(error, '升级失败') }
    }
  }

  /** 当前工作区的全部条目及版本（含审核意见、驳回理由）。 */
  async function loadMyListings(): Promise<string | null> {
    const request = ++myListingsRequest
    state.myListingsLoading = true
    try {
      const items = await getMyMarketListingList()
      if (request !== myListingsRequest) return null
      state.myListings = items
      return null
    } catch (error) {
      if (request !== myListingsRequest) return null
      state.myListings = []
      return errorMessage(error, '我的上架加载失败')
    } finally {
      if (request === myListingsRequest) state.myListingsLoading = false
    }
  }

  /**
   * 按源 Agent / Skill 查当前工作区的条目，决定入口显示「申请上架」还是「提交新版本」。
   * 还没有条目时后端返回 null，属于正常情况。换了源对象先清空，同一对象刷新时保留旧内容，入口文案不闪。
   */
  async function loadListingBySource(kind: MarketListingKind, sourceId: number): Promise<string | null> {
    const request = ++listingBySourceRequest
    const key = `${kind}:${sourceId}`
    if (key !== listingBySourceKey) {
      state.listingBySource = null
      listingBySourceKey = key
    }
    try {
      const item = await getMyMarketListingDetail({ kind, source_id: sourceId })
      if (request !== listingBySourceRequest) return null
      state.listingBySource = item
      return null
    } catch (error) {
      if (request !== listingBySourceRequest) return null
      state.listingBySource = null
      return errorMessage(error, '上架状态加载失败')
    }
  }

  /**
   * 按安装出来的 Agent / Skill 查它来自哪个市场条目；从市场装来的内容不能再上架。
   * 不是从市场装来的时后端返回 null，属于正常情况。换了对象先清空，同一对象刷新时保留旧内容。
   * 查询失败时按「不是从市场装来」处理，入口照常显示，提交时由后端兜底返回 409。
   */
  async function loadInstalledFrom(kind: MarketListingKind, targetId: number): Promise<string | null> {
    const request = ++installedFromRequest
    const key = `${kind}:${targetId}`
    if (key !== installedFromKey) {
      state.installedFrom = null
      state.installedFromLoaded = false
      installedFromKey = key
    }
    try {
      const target = await getMarketInstallByTarget({ kind, target_id: targetId })
      if (request !== installedFromRequest) return null
      state.installedFrom = target
      state.installedFromLoaded = true
      return null
    } catch (error) {
      if (request !== installedFromRequest) return null
      state.installedFrom = null
      state.installedFromLoaded = true
      return errorMessage(error, '市场来源加载失败')
    }
  }

  /** 提交上架申请或新版本；成功后重新查这个源对象的条目，入口文案和待审提示随之更新。 */
  async function submitListing(payload: CreateMarketSubmissionRequest): Promise<MarketSubmitOutcome> {
    let version: MarketVersion
    try {
      version = await createMarketSubmission(payload)
    } catch (error) {
      return { version: null, error: errorMessage(error, '提交上架申请失败') }
    }
    await loadListingBySource(payload.kind, payload.source_id)
    return { version, error: null }
  }

  /** 撤回待审版本；成功后刷新「我的上架」。 */
  async function withdrawVersion(versionId: number): Promise<string | null> {
    try {
      await withdrawMarketVersion(versionId)
    } catch (error) {
      return errorMessage(error, '撤回失败')
    }
    await loadMyListings()
    return null
  }

  /** 作者下架；成功后刷新「我的上架」。 */
  async function delistListing(listingId: number): Promise<string | null> {
    try {
      await delistMarketListing(listingId)
    } catch (error) {
      return errorMessage(error, '下架失败')
    }
    await loadMyListings()
    return null
  }

  /** 作者重新上架；成功后刷新「我的上架」。 */
  async function relistListing(listingId: number): Promise<string | null> {
    try {
      await relistMarketListing(listingId)
    } catch (error) {
      return errorMessage(error, '重新上架失败')
    }
    await loadMyListings()
    return null
  }

  /** 审核队列：按状态分页拉取版本（含快照全文）。 */
  async function loadReviewPage(params: GetMarketReviewListParams): Promise<string | null> {
    const request = ++reviewRequest
    state.reviewLoading = true
    try {
      const page = await getMarketReviewList(params)
      if (request !== reviewRequest) return null
      state.reviewItems = page.items
      state.reviewTotal = page.total
      return null
    } catch (error) {
      if (request !== reviewRequest) return null
      state.reviewItems = []
      state.reviewTotal = 0
      return errorMessage(error, '审核队列加载失败')
    } finally {
      if (request === reviewRequest) state.reviewLoading = false
    }
  }

  /** 审核通过；审核意见只有空白时按未填写处理，与后端一致。 */
  async function approveVersion(versionId: number, comment: string): Promise<string | null> {
    const trimmed = comment.trim()
    try {
      if (trimmed) await approveMarketVersion(versionId, { comment: trimmed })
      else await approveMarketVersion(versionId)
      return null
    } catch (error) {
      return errorMessage(error, '审核通过失败')
    }
  }

  /** 驳回，理由必填（页面先做必填校验）。 */
  async function rejectVersion(versionId: number, reason: string): Promise<string | null> {
    try {
      await rejectMarketVersion(versionId, { reason: reason.trim() })
      return null
    } catch (error) {
      return errorMessage(error, '驳回失败')
    }
  }

  /** 平台强制下架，理由必填（页面先做必填校验）。 */
  async function removeListing(listingId: number, reason: string): Promise<string | null> {
    try {
      await removeMarketListing(listingId, { reason: reason.trim() })
      return null
    } catch (error) {
      return errorMessage(error, '强制下架失败')
    }
  }

  return {
    state,
    loadCategories,
    loadBrowsePage,
    loadInstalledPage,
    loadDetail,
    installListing,
    upgradeListing,
    loadMyListings,
    loadListingBySource,
    loadInstalledFrom,
    submitListing,
    withdrawVersion,
    delistListing,
    relistListing,
    loadReviewPage,
    approveVersion,
    rejectVersion,
    removeListing,
  }
})
