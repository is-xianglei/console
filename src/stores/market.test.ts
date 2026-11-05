import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../http'
import {
  approveMarketVersion,
  createMarketSubmission,
  getMarketCategoryList,
  getMarketInstallByTarget,
  getMarketListingDetail,
  getMarketListingList,
  getMyMarketListingDetail,
  getMyMarketListingList,
  installMarketListing,
  rejectMarketVersion,
  upgradeMarketListing,
  withdrawMarketVersion,
} from '../http/market'
import type { MarketListingPage } from '../interfaces/market/api'
import type {
  MarketBrowseItem,
  MarketInstallResult,
  MarketInstalledTarget,
  MarketListingDetail,
  MarketMyListingItem,
  MarketVersion,
} from '../interfaces/market/model'
import { useMarketStore } from './market'

vi.mock('../http/market', () => ({
  approveMarketVersion: vi.fn(),
  createMarketSubmission: vi.fn(),
  delistMarketListing: vi.fn(),
  getMarketCategoryList: vi.fn(),
  getMarketInstallByTarget: vi.fn(),
  getMarketListingDetail: vi.fn(),
  getMarketListingList: vi.fn(),
  getMarketReviewList: vi.fn(),
  getMyMarketListingDetail: vi.fn(),
  getMyMarketListingList: vi.fn(),
  installMarketListing: vi.fn(),
  rejectMarketVersion: vi.fn(),
  relistMarketListing: vi.fn(),
  removeMarketListing: vi.fn(),
  upgradeMarketListing: vi.fn(),
  withdrawMarketVersion: vi.fn(),
}))

function browseItem(id: number, overrides: Partial<MarketBrowseItem> = {}): MarketBrowseItem {
  return {
    id,
    kind: 'skill',
    name: `skill-${id}`,
    summary: null,
    category: 'data',
    is_official: false,
    status: 'listed',
    status_reason: null,
    current_version_number: 1,
    publisher_name: '个人工作区',
    install_count: 0,
    installed: false,
    installed_version_number: null,
    has_update: false,
    updated_at: '2026-11-01T00:00:00Z',
    ...overrides,
  }
}

function page(items: MarketBrowseItem[], total: number): MarketListingPage {
  return { items, total, limit: items.length, offset: 0 }
}

function detail(id: number): MarketListingDetail {
  return { listing: browseItem(id), status: 'listed', status_reason: null, current_version: null, install_preview: null }
}

function version(id: number): MarketVersion {
  return {
    id,
    listing_id: 1,
    version_number: id,
    name: '数据分析助手',
    status: 'pending',
    category: 'data',
    release_note: null,
    snapshot_hash: 'hash',
    submitted_by_user_id: 2,
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_comment: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  }
}

function myListing(sourceAgentId: number): MarketMyListingItem {
  return {
    listing: {
      id: 1,
      kind: 'agent',
      is_official: false,
      official_key: null,
      publisher_workspace_id: 3,
      source_agent_id: sourceAgentId,
      source_skill_id: null,
      status: 'listed',
      status_reason: null,
      current_version_number: 1,
      name: '数据分析助手',
      summary: null,
      category: 'data',
      created_by_user_id: 2,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    },
    versions: [version(1)],
  }
}

/** 手动控制 resolve 时机，用来模拟先发后到的旧请求。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
})

describe('market store 浏览', () => {
  it('分类加载过一次就不再请求', async () => {
    vi.mocked(getMarketCategoryList).mockResolvedValue([{ key: 'data', label: '数据分析' }])
    const store = useMarketStore()

    await store.loadCategories()
    await store.loadCategories()

    expect(getMarketCategoryList).toHaveBeenCalledTimes(1)
    expect(store.state.categories).toEqual([{ key: 'data', label: '数据分析' }])
  })

  it('浏览页成功写入条目和总数', async () => {
    vi.mocked(getMarketListingList).mockResolvedValueOnce(page([browseItem(1)], 30))
    const store = useMarketStore()

    const error = await store.loadBrowsePage({ limit: 12, offset: 0 })

    expect(error).toBeNull()
    expect(store.state.browseItems.map((item) => item.id)).toEqual([1])
    expect(store.state.browseTotal).toBe(30)
    expect(store.state.browseLoading).toBe(false)
  })

  it('浏览页失败时清空并返回后端的中文说明', async () => {
    vi.mocked(getMarketListingList).mockRejectedValueOnce(new ApiError('当前工作区成员资格无效', 'HTTP_ERROR', 403))
    const store = useMarketStore()

    const error = await store.loadBrowsePage({ limit: 12, offset: 0 })

    expect(error).toBe('当前工作区成员资格无效')
    expect(store.state.browseItems).toEqual([])
    expect(store.state.browseTotal).toBe(0)
  })

  it('先发后到的旧请求不覆盖新结果', async () => {
    const slow = deferred<MarketListingPage>()
    vi.mocked(getMarketListingList)
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(page([browseItem(2)], 1))
    const store = useMarketStore()

    const first = store.loadBrowsePage({ kind: 'agent' })
    await store.loadBrowsePage({ kind: 'skill' })
    slow.resolve(page([browseItem(1)], 1))
    await first

    expect(store.state.browseItems.map((item) => item.id)).toEqual([2])
  })

})

describe('market store 已安装与版本更新', () => {
  it('筛选参数原样交给后端，写入当前页和筛选后的总数', async () => {
    vi.mocked(getMarketListingList).mockResolvedValueOnce(page([browseItem(1, { installed: true })], 30))
    const store = useMarketStore()

    const error = await store.loadInstalledPage({ installed: true, limit: 12, offset: 12 })

    expect(error).toBeNull()
    expect(getMarketListingList).toHaveBeenCalledWith({ installed: true, limit: 12, offset: 12 })
    expect(store.state.installedItems.map((item) => item.id)).toEqual([1])
    expect(store.state.installedTotal).toBe(30)
    expect(store.state.installedLoading).toBe(false)
  })

  it('从「已安装」换到「版本更新」时先清空，不短暂显示上一个模块的条目', async () => {
    vi.mocked(getMarketListingList).mockResolvedValueOnce(page([browseItem(1, { installed: true })], 1))
    const store = useMarketStore()
    await store.loadInstalledPage({ installed: true, limit: 12, offset: 0 })

    const updates = deferred<MarketListingPage>()
    vi.mocked(getMarketListingList).mockReturnValueOnce(updates.promise)
    const loading = store.loadInstalledPage({ has_update: true, limit: 12, offset: 0 })
    expect(store.state.installedItems).toEqual([])
    expect(store.state.installedTotal).toBe(0)

    updates.resolve(page([browseItem(2, { installed: true, has_update: true })], 1))
    await loading
    expect(store.state.installedItems.map((item) => item.id)).toEqual([2])
  })

  it('同一模块翻页时保留旧内容，失败时清空并返回错误', async () => {
    vi.mocked(getMarketListingList).mockResolvedValueOnce(page([browseItem(1, { installed: true })], 20))
    const store = useMarketStore()
    await store.loadInstalledPage({ installed: true, limit: 12, offset: 0 })

    const next = deferred<MarketListingPage>()
    vi.mocked(getMarketListingList).mockReturnValueOnce(next.promise)
    const loading = store.loadInstalledPage({ installed: true, limit: 12, offset: 12 })
    expect(store.state.installedItems.map((item) => item.id)).toEqual([1])

    next.resolve(page([browseItem(13, { installed: true })], 20))
    await loading
    expect(store.state.installedItems.map((item) => item.id)).toEqual([13])

    vi.mocked(getMarketListingList).mockRejectedValueOnce(new ApiError('服务异常', 'HTTP_ERROR', 500))
    await expect(store.loadInstalledPage({ installed: true, limit: 12, offset: 0 })).resolves.toBe('服务异常')
    expect(store.state.installedItems).toEqual([])
    expect(store.state.installedTotal).toBe(0)
  })
})

describe('market store 详情与安装', () => {
  it('详情 404 时返回状态码，页面据此显示「不存在」', async () => {
    vi.mocked(getMarketListingDetail).mockRejectedValueOnce(new ApiError('市场条目不存在', 'HTTP_ERROR', 404))
    const store = useMarketStore()

    const error = await store.loadDetail(9)

    expect(error).toEqual({ message: '市场条目不存在', status: 404 })
    expect(store.state.detail).toBeNull()
  })

  it('换了条目先清掉旧详情，同一条目刷新时保留旧内容', async () => {
    vi.mocked(getMarketListingDetail).mockResolvedValueOnce(detail(1))
    const store = useMarketStore()
    await store.loadDetail(1)

    const refresh = deferred<MarketListingDetail>()
    vi.mocked(getMarketListingDetail).mockReturnValueOnce(refresh.promise)
    const refreshing = store.loadDetail(1)
    expect(store.state.detail?.listing.id).toBe(1)
    refresh.resolve(detail(1))
    await refreshing

    const next = deferred<MarketListingDetail>()
    vi.mocked(getMarketListingDetail).mockReturnValueOnce(next.promise)
    const switching = store.loadDetail(2)
    expect(store.state.detail).toBeNull()
    next.resolve(detail(2))
    await switching
    expect(store.state.detail?.listing.id).toBe(2)
  })

  it('安装成功返回报告', async () => {
    const result = {
      install: { id: 1, target_agent_id: 5 },
      report: { bound_tool_keys: ['Read'], dropped_tools: [], skills: [{ name: 'csv', action: 'create', skill_id: 8 }] },
    } as unknown as MarketInstallResult
    vi.mocked(installMarketListing).mockResolvedValueOnce(result)
    const store = useMarketStore()

    await expect(store.installListing(1)).resolves.toEqual({ result, error: null })
  })

  it('安装或升级 409 时返回后端的中文说明', async () => {
    vi.mocked(installMarketListing).mockRejectedValueOnce(new ApiError('本工作区已有同名 Agent: 助手', 'HTTP_ERROR', 409))
    vi.mocked(upgradeMarketListing).mockRejectedValueOnce(new ApiError('已是最新版本', 'HTTP_ERROR', 409))
    const store = useMarketStore()

    await expect(store.installListing(1)).resolves.toEqual({ result: null, error: '本工作区已有同名 Agent: 助手' })
    await expect(store.upgradeListing(1)).resolves.toEqual({ result: null, error: '已是最新版本' })
  })

  it('网络异常等非接口错误用兜底文案', async () => {
    vi.mocked(installMarketListing).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const store = useMarketStore()

    await expect(store.installListing(1)).resolves.toEqual({ result: null, error: '安装失败' })
  })
})

describe('market store 上架', () => {
  it('按源对象查条目：没有条目时为 null，不算错误', async () => {
    vi.mocked(getMyMarketListingDetail).mockResolvedValueOnce(null)
    const store = useMarketStore()

    const error = await store.loadListingBySource('agent', 11)

    expect(error).toBeNull()
    expect(getMyMarketListingDetail).toHaveBeenCalledWith({ kind: 'agent', source_id: 11 })
    expect(store.state.listingBySource).toBeNull()
  })

  it('换了源对象先清掉旧条目，同一对象刷新时保留旧内容', async () => {
    vi.mocked(getMyMarketListingDetail).mockResolvedValueOnce(myListing(11))
    const store = useMarketStore()
    await store.loadListingBySource('agent', 11)

    const refresh = deferred<MarketMyListingItem | null>()
    vi.mocked(getMyMarketListingDetail).mockReturnValueOnce(refresh.promise)
    const refreshing = store.loadListingBySource('agent', 11)
    expect(store.state.listingBySource?.listing.source_agent_id).toBe(11)
    refresh.resolve(myListing(11))
    await refreshing

    const next = deferred<MarketMyListingItem | null>()
    vi.mocked(getMyMarketListingDetail).mockReturnValueOnce(next.promise)
    const switching = store.loadListingBySource('skill', 11)
    expect(store.state.listingBySource).toBeNull()
    next.resolve(null)
    await switching
    expect(store.state.listingBySource).toBeNull()
  })

  it('按源对象查条目失败时清空并返回后端说明', async () => {
    vi.mocked(getMyMarketListingDetail).mockRejectedValueOnce(new ApiError('仅工作区所有者或管理员可以操作', 'HTTP_ERROR', 403))
    const store = useMarketStore()

    await expect(store.loadListingBySource('agent', 11)).resolves.toBe('仅工作区所有者或管理员可以操作')
    expect(store.state.listingBySource).toBeNull()
  })

  it('提交成功后重新查这个源对象的条目，不再拉整个「我的上架」', async () => {
    vi.mocked(createMarketSubmission).mockResolvedValueOnce(version(3))
    vi.mocked(getMyMarketListingDetail).mockResolvedValueOnce(myListing(11))
    const store = useMarketStore()

    const outcome = await store.submitListing({ kind: 'agent', source_id: 11, category: 'data', release_note: null })

    expect(outcome).toEqual({ version: version(3), error: null })
    expect(getMyMarketListingDetail).toHaveBeenCalledWith({ kind: 'agent', source_id: 11 })
    expect(store.state.listingBySource?.listing.source_agent_id).toBe(11)
    expect(getMyMarketListingList).not.toHaveBeenCalled()
  })

  it('提交失败返回后端说明，不重新查询', async () => {
    vi.mocked(createMarketSubmission).mockRejectedValueOnce(new ApiError('内容与当前上架版本相同', 'HTTP_ERROR', 409))
    const store = useMarketStore()

    const outcome = await store.submitListing({ kind: 'agent', source_id: 11, category: 'data' })

    expect(outcome).toEqual({ version: null, error: '内容与当前上架版本相同' })
    expect(getMyMarketListingDetail).not.toHaveBeenCalled()
  })

  it('从市场装来的内容提交时返回后端的 409 说明', async () => {
    vi.mocked(createMarketSubmission).mockRejectedValueOnce(new ApiError('从市场安装的内容不能上架', 'HTTP_ERROR', 409))
    const store = useMarketStore()

    const outcome = await store.submitListing({ kind: 'skill', source_id: 8, category: 'data' })

    expect(outcome).toEqual({ version: null, error: '从市场安装的内容不能上架' })
  })

  it('撤回成功后刷新，失败时返回错误且不刷新', async () => {
    vi.mocked(withdrawMarketVersion).mockResolvedValueOnce(version(3))
    vi.mocked(getMyMarketListingList).mockResolvedValueOnce([])
    const store = useMarketStore()

    await expect(store.withdrawVersion(3)).resolves.toBeNull()
    expect(getMyMarketListingList).toHaveBeenCalledTimes(1)

    vi.mocked(withdrawMarketVersion).mockRejectedValueOnce(new ApiError('该版本不是待审核状态', 'HTTP_ERROR', 409))
    await expect(store.withdrawVersion(3)).resolves.toBe('该版本不是待审核状态')
    expect(getMyMarketListingList).toHaveBeenCalledTimes(1)
  })
})

describe('market store 审核', () => {
  it('审核意见只有空白时按未填写处理', async () => {
    vi.mocked(approveMarketVersion).mockResolvedValue(version(3))
    const store = useMarketStore()

    await store.approveVersion(3, '   ')
    await store.approveVersion(3, ' 内容清晰 ')

    expect(approveMarketVersion).toHaveBeenNthCalledWith(1, 3)
    expect(approveMarketVersion).toHaveBeenNthCalledWith(2, 3, { comment: '内容清晰' })
  })

  it('驳回理由去掉首尾空白，失败时返回后端说明', async () => {
    vi.mocked(rejectMarketVersion).mockRejectedValueOnce(new ApiError('该版本不是待审核状态', 'HTTP_ERROR', 409))
    const store = useMarketStore()

    const error = await store.rejectVersion(3, ' 缺少说明 ')

    expect(rejectMarketVersion).toHaveBeenCalledWith(3, { reason: '缺少说明' })
    expect(error).toBe('该版本不是待审核状态')
  })
})

describe('market store 市场来源', () => {
  function installedTarget(overrides: Partial<MarketInstalledTarget> = {}): MarketInstalledTarget {
    return {
      listing_id: 7,
      listing_name: '数据分析助手',
      listing_status: 'listed',
      installed_version_number: 2,
      installed_with_agent: false,
      ...overrides,
    }
  }

  it('不是从市场装来的返回 null，不算错误，查完标记已加载', async () => {
    vi.mocked(getMarketInstallByTarget).mockResolvedValueOnce(null)
    const store = useMarketStore()

    const loading = store.loadInstalledFrom('agent', 11)
    expect(store.state.installedFromLoaded).toBe(false)
    await expect(loading).resolves.toBeNull()

    expect(getMarketInstallByTarget).toHaveBeenCalledWith({ kind: 'agent', target_id: 11 })
    expect(store.state.installedFrom).toBeNull()
    expect(store.state.installedFromLoaded).toBe(true)
  })

  it('命中时写入来源条目', async () => {
    vi.mocked(getMarketInstallByTarget).mockResolvedValueOnce(installedTarget({ installed_with_agent: true }))
    const store = useMarketStore()

    await store.loadInstalledFrom('skill', 8)

    expect(store.state.installedFrom?.listing_id).toBe(7)
    expect(store.state.installedFrom?.installed_with_agent).toBe(true)
  })

  it('换了对象先清空并标记未加载，同一对象刷新时保留旧内容', async () => {
    vi.mocked(getMarketInstallByTarget).mockResolvedValueOnce(installedTarget())
    const store = useMarketStore()
    await store.loadInstalledFrom('skill', 8)

    const refresh = deferred<MarketInstalledTarget | null>()
    vi.mocked(getMarketInstallByTarget).mockReturnValueOnce(refresh.promise)
    const refreshing = store.loadInstalledFrom('skill', 8)
    expect(store.state.installedFrom?.listing_id).toBe(7)
    expect(store.state.installedFromLoaded).toBe(true)
    refresh.resolve(installedTarget())
    await refreshing

    const next = deferred<MarketInstalledTarget | null>()
    vi.mocked(getMarketInstallByTarget).mockReturnValueOnce(next.promise)
    const switching = store.loadInstalledFrom('skill', 9)
    expect(store.state.installedFrom).toBeNull()
    expect(store.state.installedFromLoaded).toBe(false)
    next.resolve(null)
    await switching
    expect(store.state.installedFromLoaded).toBe(true)
  })

  it('先发后到的旧请求不覆盖新对象的结果', async () => {
    const stale = deferred<MarketInstalledTarget | null>()
    vi.mocked(getMarketInstallByTarget).mockReturnValueOnce(stale.promise)
    vi.mocked(getMarketInstallByTarget).mockResolvedValueOnce(null)
    const store = useMarketStore()

    const first = store.loadInstalledFrom('skill', 8)
    await store.loadInstalledFrom('skill', 9)
    stale.resolve(installedTarget())
    await first

    expect(store.state.installedFrom).toBeNull()
  })

  it('查询失败时按「不是从市场装来」处理，返回后端说明', async () => {
    vi.mocked(getMarketInstallByTarget).mockRejectedValueOnce(new ApiError('当前工作区成员资格无效', 'HTTP_ERROR', 403))
    const store = useMarketStore()

    await expect(store.loadInstalledFrom('agent', 11)).resolves.toBe('当前工作区成员资格无效')
    expect(store.state.installedFrom).toBeNull()
    expect(store.state.installedFromLoaded).toBe(true)
  })
})
