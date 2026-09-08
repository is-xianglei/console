import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, reactive } from 'vue'
import { useSaveFeedback, useHighlightFromQuery } from './useSaveFeedback'

const routeState = reactive({
  query: {} as Record<string, string | string[] | undefined>,
})
const router = {
  push: vi.fn(async (to: unknown) => to),
  back: vi.fn(async () => undefined),
  replace: vi.fn(async (to: unknown) => to),
}
const toastAdd = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => router,
}))

vi.mock('@nuxt/ui/composables', () => ({
  useToast: () => ({ add: toastAdd }),
}))

const listRoute = { name: 'platform-resource', params: { module: 'organization', resource: 'groups' } }

function feedback() {
  const scope = effectScope()
  let api!: ReturnType<typeof useSaveFeedback>
  scope.run(() => { api = useSaveFeedback({ listRoute }) })
  return { api, scope }
}

beforeEach(() => {
  vi.clearAllMocks()
  routeState.query = {}
})

describe('useSaveFeedback', () => {
  it('afterSave 推送到列表并带 highlight', async () => {
    const { api, scope } = feedback()
    await api.afterSave({ id: 7, message: '群组已创建' })
    expect(toastAdd).toHaveBeenCalledWith({ title: '群组已创建', color: 'success' })
    expect(router.push).toHaveBeenCalledWith({ ...listRoute, query: { highlight: '7' } })
    scope.stop()
  })

  it('afterDelete 无历史栈时回列表路由', async () => {
    const { api, scope } = feedback()
    // node 环境 history.state 为空 → 走推列表。
    await api.afterDelete({ message: '已删除' })
    expect(toastAdd).toHaveBeenCalledWith({ title: '已删除', color: 'neutral' })
    expect(router.push).toHaveBeenCalledWith(listRoute)
    scope.stop()
  })
})

describe('useHighlightFromQuery', () => {
  it('读 highlight 并在 2s 后 replace 清除', async () => {
    routeState.query = { highlight: '9' }
    const scope = effectScope()
    let highlight!: ReturnType<typeof useHighlightFromQuery>
    scope.run(() => { highlight = useHighlightFromQuery() })

    expect(highlight.value).toBe('9')

    await new Promise((resolve) => setTimeout(resolve, 2100))
    expect(highlight.value).toBeNull()
    expect(router.replace).toHaveBeenCalledWith({ query: {} })
    scope.stop()
  })
})
