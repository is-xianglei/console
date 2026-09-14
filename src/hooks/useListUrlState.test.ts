import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, reactive } from 'vue'
import { useListUrlState, listUrlCodec, type ListUrlState } from './useListUrlState'

// ===== vue-router mock：route.query/params 可控制、router 记录调用 =====

const routeState = reactive({
  name: 'platform-resource',
  params: { module: 'organization', resource: 'groups' },
  query: {} as Record<string, unknown>,
})

const router = {
  push: vi.fn(async (to: { query: Record<string, unknown> }) => {
    routeState.query = { ...to.query }
  }),
  replace: vi.fn(async (to: { query: Record<string, unknown> }) => {
    routeState.query = { ...to.query }
  }),
}

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => router,
}))

interface State {
  keyword: string
  enabled: string
  page: number
  pageSize: number
  [key: string]: unknown
}

let hook: ListUrlState<State> | null = null
let scope: ReturnType<typeof effectScope> | null = null

function createHook() {
  scope = effectScope()
  scope.run(() => {
    hook = useListUrlState<State>({
      defaults: { keyword: '', enabled: 'all', page: 1, pageSize: 20 },
      resetPageOn: ['keyword', 'enabled', 'pageSize'],
    })
  })
  return hook
}

beforeEach(() => {
  vi.clearAllMocks()
  routeState.query = {}
  routeState.name = 'platform-resource'
  routeState.params = { module: 'organization', resource: 'groups' }
  hook = null
  scope?.stop()
  scope = null
})

const lastQuery = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0]?.query as Record<string, unknown>

describe('useListUrlState', () => {
  it('初始化：不从空 query 写任何东西（不制造历史）', () => {
    createHook()
    expect(router.replace).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('默认值不写入 query；非默认值写入', () => {
    createHook()
    hook!.state.keyword = 'abc'
    expect(router.replace).toHaveBeenCalledTimes(1)
    expect(lastQuery(router.replace)).toEqual({ keyword: 'abc' })
  })

  it('空字符串 trim 后为空不写；数字编码为字符串', () => {
    createHook()
    hook!.state.keyword = '   '
    expect(router.replace).not.toHaveBeenCalled()
    hook!.state.page = 5
    expect(lastQuery(router.push)).toEqual({ page: '5' })
  })

  it('布尔与数组编解码往返', () => {
    const boolCodec = listUrlCodec(false as boolean)
    expect(boolCodec.encode(true)).toBe('1')
    expect(boolCodec.encode(false)).toBe('0')
    expect(boolCodec.decode('0')).toBe(false)
    expect(boolCodec.decode('1')).toBe(true)
    // 往返必须稳定：此前 encode 写 'true' 而 decode 只认 '1'，
    // 布尔值写进 URL 后会被回读成默认值（部门页「全部展开/折叠」因此永久失效）。
    expect(boolCodec.decode(boolCodec.encode(true)!)).toBe(true)
    expect(boolCodec.decode(boolCodec.encode(false)!)).toBe(false)
    const arrCodec = listUrlCodec([] as string[])
    expect(arrCodec.encode(['a', 'b'])).toBe('a,b')
    expect(arrCodec.decode('a,b')).toEqual(['a', 'b'])
    expect(arrCodec.isDefault([], [])).toBe(true)
  })

  it('数字读回 Number()，NaN 回退默认', () => {
    routeState.query = { page: 'abc' }
    createHook()
    expect(hook!.state.page).toBe(1) // NaN 回退默认
    routeState.query = { page: '7' }
    // 触发 query watch 重读（sync）
    expect(hook!.state.page).toBe(7)
  })

  it('相同 query 不重复写（切断回环）', () => {
    createHook()
    hook!.state.keyword = 'abc'
    const calls = router.replace.mock.calls.length
    hook!.state.keyword = 'abc'
    expect(router.replace.mock.calls.length).toBe(calls)
  })

  it('page 变化走 push，筛选变化走 replace', () => {
    createHook()
    hook!.state.keyword = 'abc'
    expect(router.replace).toHaveBeenCalledTimes(1)
    expect(router.push).not.toHaveBeenCalled()
    hook!.state.page = 3
    expect(router.push).toHaveBeenCalledTimes(1)
    expect(lastQuery(router.push)).toEqual({ keyword: 'abc', page: '3' })
  })

  it('筛选变化复位 page 到 1（不写默认 page），走 replace', () => {
    createHook()
    hook!.state.page = 5
    hook!.state.keyword = 'xyz'
    expect(lastQuery(router.replace)).toEqual({ keyword: 'xyz' })
    expect(hook!.state.page).toBe(1)
  })

  it('reset() 清空托管字段并回到默认', () => {
    createHook()
    hook!.state.keyword = 'abc'
    hook!.state.page = 2
    hook!.reset()
    expect(hook!.state.keyword).toBe('')
    expect(hook!.state.page).toBe(1)
    expect(hook!.isDefault.value).toBe(true)
  })

  it('非本路由（params 变化）的 query 变化被忽略，重新同步到新资源', () => {
    createHook()
    hook!.state.keyword = 'a'
    // 切换到另一个资源页：name/params 变化，同时 query 变化。
    routeState.name = 'platform-resource'
    routeState.params = { module: 'build', resource: 'agents' }
    routeState.query = { keyword: 'other' }
    // params 变化应重绑：state 读入新资源 query。
    expect(hook!.state.keyword).toBe('other')
  })
})
