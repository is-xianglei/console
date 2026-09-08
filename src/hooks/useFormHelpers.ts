import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

/**
 * 定位表单首个错误字段（R8 / focusFirstError）。
 *
 * Nuxt UI 的 UFormField 在字段出错时会给输入标记 aria-invalid="true"；
 * 兼容自定义的 `[data-error]`。命中后 scrollIntoView({ block: 'center' }) + focus()。
 * 返回是否命中。
 */
export function focusFirstError(root: HTMLElement): boolean {
  const selector = '[aria-invalid="true"], [data-error]'
  let target: HTMLElement | null = null

  const candidates = root.querySelectorAll<HTMLElement>(selector)
  for (const node of candidates) {
    // 优先定位可聚焦的输入本身；若命中容器则向下找第一个可聚焦元素。
    target = toFocusable(node)
    if (target) break
  }

  if (!target) return false
  target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  target.focus({ preventScroll: true })
  return true
}

function toFocusable(node: HTMLElement): HTMLElement | null {
  const focusableSelector = 'input, textarea, select, [tabindex]:not([tabindex="-1"]), [role="combobox"], [contenteditable="true"]'
  const fallback = node.matches(focusableSelector) ? node : node.querySelector<HTMLElement>(focusableSelector)
  if (fallback) return fallback
  // 容器本身无法聚焦时，尝试直接落到控件（Nuxt UI 的输入通常带可聚焦子元素）。
  return node
}

export interface UnsavedGuardReturn {
  pending: ComputedRef<boolean>
  /** 用户确认离开：放行。 */
  confirmLeave(): void
  /** 用户取消：留在当前页。 */
  cancelLeave(): void
}

/**
 * 未保存离开守护（R8 / useUnsavedGuard）。
 * dirty 为真时拦截路由离开（onBeforeRouteLeave）并注册 beforeunload，返回
 * pending / confirmLeave / cancelLeave 供页面渲染统一的 UModal；卸载自动解除。
 */
export function useUnsavedGuard(dirty: Ref<boolean> | ComputedRef<boolean>): UnsavedGuardReturn {
  // 「试图离开」瞬时态：onBeforeRouteLeave 拦截时置真，渲染确认弹窗。
  const pendingTrigger = ref(false)
  const pending = computed(() => dirty.value && pendingTrigger.value)

  function confirmLeave() {
    pendingTrigger.value = false
    // 清除 beforeunload，避免确认后关闭页签仍被拦截。
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }

  function cancelLeave() {
    pendingTrigger.value = false
  }

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!dirty.value) return
    event.preventDefault()
    event.returnValue = ''
  }

  onBeforeRouteLeave(() => {
    if (!dirty.value) return true
    pendingTrigger.value = true
    return false
  })

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', onBeforeUnload)
  }
  onScopeDispose(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  })

  return { pending, confirmLeave, cancelLeave }
}

export interface SnapshotDirtyReturn {
  dirty: ComputedRef<boolean>
  /** 仅在显式调用时重置快照（保存成功 / 详情加载完成）。 */
  reset(): void
}

/**
 * 基于 JSON.stringify 的快照脏检查（R8 / useSnapshotDirty）。
 * 仅在显式 reset() 时重置，避免快照随 props 引用变化被重置的问题（plan-builder:165-167）。
 */
export function useSnapshotDirty(source: () => unknown, opts?: { resetOn?: () => boolean }): SnapshotDirtyReturn {
  let initializedValue = false
  // snapshot 放在 ref 里：reset() 写回时使 dirty 计算属性失效。
  const snapshot = ref('')

  function capture(): string {
    try {
      return JSON.stringify(source())
    } catch {
      return ''
    }
  }

  // 建立对 source 的响应式依赖：每次 dirty 重算先读一遍 source，再比较快照。
  const dirty = computed(() => {
    const current = capture()
    // 首次读取：总是建立基准快照（此后 resetOn 只影响是否计脏）。
    if (!initializedValue) {
      initializedValue = true
      snapshot.value = current
      return false
    }
    // resetOn 为真（详情未就绪等）时不算脏。
    if (opts?.resetOn?.()) return false
    return current !== snapshot.value
  })

  function reset() {
    initializedValue = true
    snapshot.value = capture()
  }

  return { dirty, reset }
}
