import { afterEach, describe, expect, it } from 'vitest'
import { createApp, effectScope, type App, type EffectScope } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { useListUrlState, type ListUrlState, type ListUrlStateOptions } from './useListUrlState'

/**
 * 用真实 vue-router（内存历史）验证 URL 同步的时序问题。
 * 与 useListUrlState.test.ts 的 mock 不同，这里的 push / replace 是异步落地的，
 * 后发的导航会取消先发的，后退会整体替换 query，和浏览器里的行为一致。
 */

const EmptyPage = { render: () => null }

/** 市场「发现」页的写法：不传 resetPageOn，走默认规则。 */
const MARKET_OPTIONS = {
  defaults: { keyword: '', page: 1, pageSize: 12 },
}

let scopes: EffectScope[] = []

afterEach(() => {
  for (const scope of scopes) scope.stop()
  scopes = []
})

/** 每个用例一个独立的 router，并先导航到初始地址。 */
async function setupRouter(initialUrl: string): Promise<{ app: App, router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/apps/:section', name: 'apps', component: EmptyPage },
      { path: '/agents', name: 'agents', component: EmptyPage },
    ],
  })
  const app = createApp(EmptyPage)
  app.use(router)
  await router.push(initialUrl)
  return { app, router }
}

/** 在 app 上下文里创建 hook（useRoute / useRouter 依赖 app 级 provide），用例结束时统一停止。 */
function mountHook<T extends Record<string, unknown>>(app: App, options: ListUrlStateOptions<T>): ListUrlState<T> {
  const scope = effectScope()
  scopes.push(scope)
  return app.runWithContext(() => scope.run(() => useListUrlState(options))!)
}

/** 等所有挂起的导航落地（导航只走微任务，一个宏任务后必然结束）。 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('useListUrlState（真实路由）', () => {
  it('只改页码：写入 URL，并新增一条历史记录', async () => {
    const { app, router } = await setupRouter('/apps/discover')
    const hook = mountHook(app, MARKET_OPTIONS)

    hook.state.page = 3
    await settle()
    expect(router.currentRoute.value.query).toEqual({ page: '3' })

    // 翻页用 push，后退能回到上一页。
    router.back()
    await settle()
    expect(router.currentRoute.value.query).toEqual({})
    expect(hook.state.page).toBe(1)
  })

  it('只改每页条数：页码回到第 1 页，URL 只留每页条数', async () => {
    const { app, router } = await setupRouter('/apps/discover?page=3')
    const hook = mountHook(app, MARKET_OPTIONS)
    expect(hook.state.page).toBe(3)

    hook.state.pageSize = 24
    // 页码同步复位，调用方的加载 watcher 不会先拿「第 3 页 + 新条数」请求一次。
    expect(hook.state.page).toBe(1)
    await settle()

    expect(router.currentRoute.value.query).toEqual({ pageSize: '24' })
    expect(hook.state.pageSize).toBe(24)
  })

  it('resetPageOn 显式列出 pageSize 时同样复位页码', async () => {
    const { app, router } = await setupRouter('/agents?page=3')
    const hook = mountHook(app, {
      defaults: { keyword: '', page: 1, pageSize: 12 },
      resetPageOn: ['keyword', 'pageSize'],
    })

    hook.state.pageSize = 24
    await settle()

    expect(hook.state.page).toBe(1)
    expect(router.currentRoute.value.query).toEqual({ pageSize: '24' })
  })

  it('同一个 tick 里先改每页条数再改页码（分页组件的发事件顺序）', async () => {
    const { app, router } = await setupRouter('/apps/discover?page=3')
    const hook = mountHook(app, MARKET_OPTIONS)

    hook.state.pageSize = 24
    hook.state.page = 1
    await settle()

    expect(router.currentRoute.value.query).toEqual({ pageSize: '24' })
    expect(hook.state.page).toBe(1)
    expect(hook.state.pageSize).toBe(24)
  })

  it('同一个 tick 里改了又改回原值：URL 不残留中间值', async () => {
    const { app, router } = await setupRouter('/apps/discover')
    const hook = mountHook(app, MARKET_OPTIONS)

    // 第一次写入的导航还没落地时 route.query 仍是旧值，第二次不能拿旧值判断「无需写入」。
    hook.state.pageSize = 24
    hook.state.pageSize = 12
    await settle()

    expect(router.currentRoute.value.query).toEqual({})
    expect(hook.state.pageSize).toBe(12)
  })

  it('后退时 URL 里页码和每页条数同时变化：两者都按 URL 还原，不被写回旧值', async () => {
    const { app, router } = await setupRouter('/apps/discover?page=2&pageSize=24')
    const hook = mountHook(app, MARKET_OPTIONS)

    // 外部导航（如侧栏链接）清空 query：state 回到默认值，也不能把旧的每页条数写回去。
    await router.push('/apps/discover')
    await settle()
    expect(router.currentRoute.value.query).toEqual({})
    expect(hook.state.page).toBe(1)
    expect(hook.state.pageSize).toBe(12)

    router.back()
    await settle()
    expect(router.currentRoute.value.query).toEqual({ page: '2', pageSize: '24' })
    expect(hook.state.page).toBe(2)
    expect(hook.state.pageSize).toBe(24)
  })

  it('切换到同一路由的另一个模块后，每页条数不会被带过去', async () => {
    const { app, router } = await setupRouter('/apps/discover')
    const discover = mountHook(app, MARKET_OPTIONS)
    discover.state.pageSize = 24
    discover.state.page = 3
    await settle()
    expect(router.currentRoute.value.query).toEqual({ page: '3', pageSize: '24' })

    // 旧模块在淡出动画结束前还没卸载，它的 hook 仍在监听路由。
    await router.push({ name: 'apps', params: { section: 'installed' } })
    await settle()
    expect(router.currentRoute.value.query).toEqual({})

    const installed = mountHook(app, { defaults: { page: 1, pageSize: 12 } })
    await settle()
    expect(installed.state.page).toBe(1)
    expect(installed.state.pageSize).toBe(12)
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('切换到另一个路由后，每页条数不会被带过去', async () => {
    const { app, router } = await setupRouter('/apps/discover')
    const discover = mountHook(app, MARKET_OPTIONS)
    discover.state.pageSize = 24
    discover.state.page = 3
    await settle()

    await router.push({ name: 'agents' })
    await settle()
    expect(router.currentRoute.value.query).toEqual({})

    const agents = mountHook(app, {
      defaults: { keyword: '', page: 1, pageSize: 12 },
      resetPageOn: ['keyword', 'pageSize'],
    })
    await settle()
    expect(agents.state.page).toBe(1)
    expect(agents.state.pageSize).toBe(12)
    expect(router.currentRoute.value.query).toEqual({})
  })
})
