import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './index'
import {
  approveMarketVersion,
  createMarketSubmission,
  getMarketInstallByTarget,
  getMarketListingDetail,
  getMarketListingList,
  getMarketReviewList,
  getMyMarketListingDetail,
  getMyMarketListingList,
  installMarketListing,
  rejectMarketVersion,
  removeMarketListing,
  upgradeMarketListing,
  withdrawMarketVersion,
} from './market'

function makeResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data, error: null, request_id: 'test-request' }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function makeErrorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ data: null, error: { message, details: {} }, request_id: 'test-request' }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** 取第 n 次 fetch 调用的 URL 和 init。 */
function fetchCall(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const call = fetchMock.mock.calls[index] as [string, RequestInit]
  return { url: call[0], init: call[1] }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => 'test-token' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('市场浏览接口', () => {
  it('列表只带已填写的筛选参数', async () => {
    const page = { items: [], total: 0, limit: 12, offset: 12 }
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse(page)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getMarketListingList({ kind: 'agent', keyword: '数据', limit: 12, offset: 12 })).resolves.toEqual(page)
    const { url, init } = fetchCall(fetchMock)
    expect(url).toBe('/api/market/listings?kind=agent&keyword=%E6%95%B0%E6%8D%AE&limit=12&offset=12')
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer test-token' }))
  })

  it('安装状态和官方筛选以 true / false 传给后端', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse({ items: [], total: 0, limit: 12, offset: 0 })))
    vi.stubGlobal('fetch', fetchMock)

    await getMarketListingList({ installed: true, limit: 12, offset: 0 })
    await getMarketListingList({ has_update: true, is_official: false, limit: 12, offset: 24 })
    expect(fetchCall(fetchMock, 0).url).toBe('/api/market/listings?installed=true&limit=12&offset=0')
    expect(fetchCall(fetchMock, 1).url).toBe('/api/market/listings?has_update=true&is_official=false&limit=12&offset=24')
  })

  it('没有参数时不拼 query string', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse({ items: [], total: 0, limit: 20, offset: 0 })))
    vi.stubGlobal('fetch', fetchMock)

    await getMarketListingList()
    expect(fetchCall(fetchMock).url).toBe('/api/market/listings')
  })

  it('详情 404 时抛出带后端中文 message 的 ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(makeErrorResponse('市场条目不存在', 404))))

    const error = await getMarketListingDetail(9).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).message).toBe('市场条目不存在')
  })
})

describe('市场安装与上架接口', () => {
  it('安装和升级都是不带请求体的 POST', async () => {
    const result = { install: { id: 1 }, report: { bound_tool_keys: [], dropped_tools: [], skills: [] } }
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse(result)))
    vi.stubGlobal('fetch', fetchMock)

    await installMarketListing(5)
    await upgradeMarketListing(5)
    expect(fetchCall(fetchMock, 0).url).toBe('/api/market/listings/5/install')
    expect(fetchCall(fetchMock, 0).init.method).toBe('POST')
    expect(fetchCall(fetchMock, 1).url).toBe('/api/market/listings/5/upgrade')
    expect(fetchCall(fetchMock, 1).init.method).toBe('POST')
  })

  it('安装 409 冲突时把后端的中文说明带出来', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(makeErrorResponse('已安装，请使用升级', 409))))

    await expect(installMarketListing(5)).rejects.toMatchObject({ status: 409, message: '已安装，请使用升级' })
  })

  it('提交上架发送 kind、source_id、category 和版本说明', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse({ id: 3, version_number: 1 })))
    vi.stubGlobal('fetch', fetchMock)

    const payload = { kind: 'skill' as const, source_id: 8, category: 'data', release_note: '首个版本' }
    await createMarketSubmission(payload)
    const { url, init } = fetchCall(fetchMock)
    expect(url).toBe('/api/market/submissions')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify(payload))
  })

  it('我的上架和撤回走对应路径', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse([])))
    vi.stubGlobal('fetch', fetchMock)

    await getMyMarketListingList()
    await withdrawMarketVersion(12)
    expect(fetchCall(fetchMock, 0).url).toBe('/api/market/mine')
    expect(fetchCall(fetchMock, 1).url).toBe('/api/market/versions/12/withdraw')
    expect(fetchCall(fetchMock, 1).init.method).toBe('POST')
  })

  it('按源对象查条目带 kind 和 source_id，没有条目时返回 null', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse(null)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getMyMarketListingDetail({ kind: 'skill', source_id: 8 })).resolves.toBeNull()
    expect(fetchCall(fetchMock).url).toBe('/api/market/mine/by-source?kind=skill&source_id=8')
  })

  it('按安装出来的对象查市场来源带 kind 和 target_id，命中时返回来源条目', async () => {
    const target = { listing_id: 7, listing_name: '数据分析助手', listing_status: 'removed', installed_version_number: 2, installed_with_agent: true }
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse(target)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getMarketInstallByTarget({ kind: 'skill', target_id: 8 })).resolves.toEqual(target)
    expect(fetchCall(fetchMock).url).toBe('/api/market/installs/by-target?kind=skill&target_id=8')
  })

  it('不是从市场装来的对象返回 null', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(makeResponse(null))))

    await expect(getMarketInstallByTarget({ kind: 'agent', target_id: 3 })).resolves.toBeNull()
  })

  it('从市场装来的内容提交上架时抛出 409 和后端说明', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(makeErrorResponse('从市场安装的内容不能上架', 409))))

    await expect(createMarketSubmission({ kind: 'skill', source_id: 8, category: 'data' })).rejects.toMatchObject({
      status: 409,
      message: '从市场安装的内容不能上架',
    })
  })

  it('按源对象查条目无权限时抛 403', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(makeErrorResponse('仅工作区所有者或管理员可以操作', 403))))

    await expect(getMyMarketListingDetail({ kind: 'agent', source_id: 8 })).rejects.toMatchObject({ status: 403 })
  })
})

describe('平台管理员审核接口', () => {
  it('待审列表带状态和分页参数', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse({ items: [], total: 0, limit: 10, offset: 0 })))
    vi.stubGlobal('fetch', fetchMock)

    await getMarketReviewList({ status: 'pending', limit: 10, offset: 0 })
    expect(fetchCall(fetchMock).url).toBe('/api/market/admin/versions?status=pending&limit=10&offset=0')
  })

  it('审核通过不填意见时发送空对象', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse({ id: 3 })))
    vi.stubGlobal('fetch', fetchMock)

    await approveMarketVersion(3)
    await approveMarketVersion(3, { comment: '内容清晰' })
    expect(fetchCall(fetchMock, 0).init.body).toBe('{}')
    expect(fetchCall(fetchMock, 1).init.body).toBe(JSON.stringify({ comment: '内容清晰' }))
  })

  it('驳回和强制下架都带 reason', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makeResponse({ id: 3 })))
    vi.stubGlobal('fetch', fetchMock)

    await rejectMarketVersion(3, { reason: '缺少说明' })
    await removeMarketListing(7, { reason: '违规内容' })
    expect(fetchCall(fetchMock, 0).url).toBe('/api/market/admin/versions/3/reject')
    expect(fetchCall(fetchMock, 0).init.body).toBe(JSON.stringify({ reason: '缺少说明' }))
    expect(fetchCall(fetchMock, 1).url).toBe('/api/market/admin/listings/7/remove')
    expect(fetchCall(fetchMock, 1).init.body).toBe(JSON.stringify({ reason: '违规内容' }))
  })

  it('非平台管理员调用审核接口时抛 403', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(makeErrorResponse('需要平台管理员权限', 403))))

    await expect(getMarketReviewList()).rejects.toMatchObject({ status: 403, message: '需要平台管理员权限' })
  })
})
