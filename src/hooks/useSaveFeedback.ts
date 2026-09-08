import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { useToast } from '@nuxt/ui/composables'

export interface SaveFeedbackOptions {
  listRoute: RouteLocationRaw
  /** 「从详情页进入编辑 → 保存后留在详情」用于 detail 路由名（D：from 分流）。 */
  detailRoute?: RouteLocationRaw
}

/**
 * 保存 / 删除后的反馈闭环（R6）。
 * - afterSave：toast + push 到列表页并带 ?highlight=<id>；
 * - afterSaveToDetail：toast + push 到详情页（from === 'detail' 时保存后留在详情，D）；
 * - afterDelete：toast + 后退一页（无历史栈时回列表）；
 * - useHighlightFromQuery：读 ?highlight 传给 ResourceTable.highlightId，2s 后用 replace 清掉。
 */
export function useSaveFeedback(options: SaveFeedbackOptions) {
  const toast = useToast()
  const router = useRouter()
  const listRoute = options.listRoute
  const detailRoute = options.detailRoute

  /** 保存成功：toast + 回列表并高亮新记录。 */
  async function afterSave(payload: { id: number | string; message?: string }) {
    toast.add({ title: payload.message ?? '保存成功', color: 'success' })
    await router.push({
      ...(listRoute as object),
      query: { highlight: String(payload.id) },
    })
  }

  /** 保存成功且来自详情页：toast + 留在详情页（不带 highlight），由页面层按 route.query.from 决定。 */
  async function afterSaveToDetail(payload: { id: number | string; message?: string }) {
    toast.add({ title: payload.message ?? '保存成功', color: 'success' })
    if (detailRoute) {
      await router.push({
        ...(detailRoute as object),
        params: { id: String(payload.id) },
      })
    }
  }

  /** 删除成功：toast + 后退；无历史栈时回列表路由。 */
  async function afterDelete(payload: { message?: string }) {
    toast.add({ title: payload.message ?? '删除成功', color: 'neutral' })
    const hasHistory = typeof window !== 'undefined' && Boolean((history.state as { back?: unknown } | null)?.back)
    if (hasHistory) {
      await router.back()
    } else {
      await router.push(listRoute)
    }
  }

  return { afterSave, afterSaveToDetail, afterDelete }
}

/**
 * 从 route.query 读取 ?highlight 交给 ResourceTable.highlightId，2s 后 replace 清掉。
 * 组件卸载自动清理定时器。
 */
export function useHighlightFromQuery(): Ref<string | null> {
  const route = useRoute()
  const router = useRouter()
  const highlight = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  function read() {
    const raw = route.query.highlight
    const value = Array.isArray(raw) ? raw[0] : raw
    if (value == null || value === '') return
    highlight.value = String(value)
    clearTimeout(timer)
    timer = setTimeout(() => {
      const current = route.query.highlight
      const curStr = Array.isArray(current) ? current[0] : current
      if (curStr != null && curStr !== '' && String(curStr) === highlight.value) {
        const next = { ...route.query }
        delete next.highlight
        void router.replace({ query: next })
      }
      highlight.value = null
    }, 2000)
  }

  read()
  watch(() => route.query.highlight, read, { immediate: true })

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })

  return highlight
}
