import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useMarketStore } from '@/stores/market'
import { useMarketBrowse } from './useMarketBrowse'

// ===== vue-router mock：route.query 可控制、router 记录调用 =====
const routeState = reactive({
  name: 'apps',
  params: { section: 'discover' },
  query: {} as Record<string, unknown>,
})
const router = {
  push: vi.fn(async (to: { query: Record<string, unknown> }) => { routeState.query = { ...to.query } }),
  replace: vi.fn(async (to: { query: Record<string, unknown> }) => { routeState.query = { ...to.query } }),
}

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => router,
}))

/** 构造带 workspace_id 的假 JWT，auth store 从 payload 里解析当前工作区。 */
function tokenFor(workspaceId: number): string {
  return `header.${btoa(JSON.stringify({ workspace_id: workspaceId }))}.signature`
}

type LoadBrowsePage = ReturnType<typeof useMarketStore>['loadBrowsePage']

let loadBrowsePage: Mock<LoadBrowsePage>
let scope: ReturnType<typeof effectScope> | null = null

function createHook() {
  scope = effectScope()
  return scope.run(() => useMarketBrowse())!
}

/** 等 watch 回调和 store 调用都执行完。 */
async function flush() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  vi.clearAllMocks()
  scope?.stop()
  scope = null
  routeState.query = {}
  setActivePinia(createPinia())
  useAuthStore().state.accessToken = tokenFor(3)
  loadBrowsePage = vi.fn<LoadBrowsePage>().mockResolvedValue(null)
  useMarketStore().loadBrowsePage = loadBrowsePage
})

describe('useMarketBrowse', () => {
  it('首次进入按默认条件拉第一页', async () => {
    createHook()
    await flush()

    expect(loadBrowsePage).toHaveBeenCalledTimes(1)
    expect(loadBrowsePage).toHaveBeenCalledWith({ limit: 12, offset: 0 })
  })

  it('从 URL 还原类型和页码', async () => {
    routeState.query = { kind: 'agent', page: '2' }
    createHook()
    await flush()

    expect(loadBrowsePage).toHaveBeenCalledWith({ limit: 12, offset: 12, kind: 'agent' })
  })

  it('没有当前工作区时不请求', async () => {
    useAuthStore().state.accessToken = null
    createHook()
    await flush()

    expect(loadBrowsePage).not.toHaveBeenCalled()
  })

  it('切换分类时回到第 1 页并重新拉取', async () => {
    routeState.query = { page: '3' }
    const hook = createHook()
    await flush()

    hook.state.category = 'coding'
    await flush()

    expect(loadBrowsePage).toHaveBeenLastCalledWith({ limit: 12, offset: 0, category: 'coding' })
    expect(routeState.query).toEqual({ category: 'coding' })
  })

  it('勾选仅官方时带 is_official，并写入 URL', async () => {
    routeState.query = { page: '2' }
    const hook = createHook()
    await flush()

    hook.state.official = true
    await flush()

    expect(loadBrowsePage).toHaveBeenLastCalledWith({ limit: 12, offset: 0, is_official: true })
    expect(routeState.query).toEqual({ official: '1' })
    expect(hook.hasActiveFilter.value).toBe(true)
  })

  it('关键词回车或点查询才生效，去掉首尾空白', async () => {
    const hook = createHook()
    await flush()

    hook.keywordInput.value = ' 数据 '
    await flush()
    expect(loadBrowsePage).toHaveBeenCalledTimes(1)

    hook.onSearch()
    await flush()
    expect(loadBrowsePage).toHaveBeenLastCalledWith({ limit: 12, offset: 0, keyword: '数据' })
    expect(hook.hasActiveFilter.value).toBe(true)
  })

  it('关键词没变时点查询相当于刷新', async () => {
    const hook = createHook()
    await flush()

    hook.onSearch()
    await flush()

    expect(loadBrowsePage).toHaveBeenCalledTimes(2)
  })

  it('重置清空关键词输入和全部筛选', async () => {
    routeState.query = { kind: 'skill', keyword: '爬虫' }
    const hook = createHook()
    await flush()
    expect(hook.keywordInput.value).toBe('爬虫')

    hook.onReset()
    await flush()

    expect(hook.keywordInput.value).toBe('')
    expect(hook.state.kind).toBe('all')
    expect(hook.hasActiveFilter.value).toBe(false)
  })

  it('加载失败时暴露后端的中文说明', async () => {
    loadBrowsePage.mockResolvedValueOnce('当前工作区成员资格无效')
    const hook = createHook()
    await flush()

    expect(hook.loadError.value).toBe('当前工作区成员资格无效')
  })
})
