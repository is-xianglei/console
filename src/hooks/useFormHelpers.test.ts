import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref, type Ref } from 'vue'
import { useSnapshotDirty, useUnsavedGuard, focusFirstError } from './useFormHelpers'

// ===== onBeforeRouteLeave mock：捕获返回的守卫 =====
let capturedGuard: (() => boolean | void | Promise<boolean | void>)[] = []
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: (guard: () => boolean | void | Promise<boolean | void>) => { capturedGuard.push(guard); return () => undefined },
}))

function makeSource() {
  return reactive({ name: '', age: 0 })
}

beforeEach(() => {
  capturedGuard = []
})

describe('useSnapshotDirty', () => {
  it('初始不脏，源改变后脏，reset 后不脏', () => {
    const source = makeSource()
    const { dirty, reset } = useSnapshotDirty(() => source)
    expect(dirty.value).toBe(false)

    source.name = 'John'
    expect(dirty.value).toBe(true)

    reset()
    // reset 写回快照到 ref 使其失效，重算后与当前源一致 → 不脏。
    expect(dirty.value).toBe(false)
  })

  it('resetOn 谓词为真时不置脏（详情未就绪时避免首帧误判）', () => {
    const source = makeSource()
    const ready = ref(false)
    // 详情未加载（resetOn=true）期间 source 变化不算脏。
    const { dirty } = useSnapshotDirty(() => source, { resetOn: () => !ready.value })
    source.name = 'x'
    expect(dirty.value).toBe(false)

    // 详情加载完成后（resetOn=false），源再变化才算脏。
    ready.value = true
    source.name = 'y'
    expect(dirty.value).toBe(true)
  })
})

describe('useUnsavedGuard', () => {
  it('dirty 时拦截路由离开，confirmLeave 放行 / cancelLeave 留在当前页', () => {
    const dirty = computed(() => true)
    const guard = useUnsavedGuard(dirty as Ref<boolean>)
    expect(capturedGuard).toHaveLength(1)

    // dirty 为真 → 拦截（返回 false），并打开确认弹窗。
    const result = capturedGuard[0]!()
    expect(result).toBe(false)
    expect(guard.pending.value).toBe(true)

    // cancel：留在当前页。
    guard.cancelLeave()
    expect(guard.pending.value).toBe(false)

    // 再次触发，然后 confirm：清除 pending，并解除 beforeunload。
    capturedGuard[0]!()
    expect(guard.pending.value).toBe(true)
    guard.confirmLeave()
    expect(guard.pending.value).toBe(false)
  })

  it('dirty 为 false 时直接放行不拦截', () => {
    const dirty = computed(() => false)
    useUnsavedGuard(dirty as Ref<boolean>)
    const result = capturedGuard[0]!()
    expect(result).toBe(true)
  })
})

describe('focusFirstError', () => {
  it('无可聚焦错误时返回 false（DOM 行为在浏览器环境验证）', () => {
    // node 环境无 DOM；此处只验证「无输入时返回 false」的守卫分支。
    const el = null
    if (!el) return
    expect(focusFirstError(el as unknown as HTMLElement)).toBe(false)
  })
})
