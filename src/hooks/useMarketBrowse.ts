import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { MARKET_PAGE_SIZES } from '@/constants/market'
import type { MarketListingKind } from '@/interfaces/market/model'
import { useAuthStore } from '@/stores/auth'
import { useMarketStore } from '@/stores/market'
import { buildListingQuery } from '@/utils/market'
import { useListUrlState } from './useListUrlState'

/** 类型筛选：全部 / Agent / Skill。 */
export type MarketKindFilter = MarketListingKind | 'all'

/**
 * 市场「发现」页：类型、分类、关键词、仅官方、分页都写入 URL（useListUrlState），任一变化都重新拉取。
 * 关键词先写在输入框草稿里，回车或点「查询」才生效，避免每输入一个字就请求一次。
 */
export function useMarketBrowse() {
  const marketStore = useMarketStore()
  const authStore = useAuthStore()

  // 类型、分类、关键词、仅官方、每页条数变化时页码自动回到第 1 页（useListUrlState 的默认行为）。
  const { state, reset } = useListUrlState({
    defaults: {
      kind: 'all' as MarketKindFilter,
      category: 'all',
      keyword: '',
      official: false,
      page: 1,
      pageSize: MARKET_PAGE_SIZES[0],
    },
  })

  const keywordInput = ref(state.keyword)
  const loadError = ref('')
  let loadRequest = 0

  const items = computed(() => marketStore.state.browseItems)
  const total = computed(() => marketStore.state.browseTotal)
  const loading = computed(() => marketStore.state.browseLoading)
  const hasActiveFilter = computed(() => {
    if (state.kind !== 'all') return true
    if (state.category !== 'all') return true
    if (state.official) return true
    return state.keyword !== ''
  })

  async function load() {
    const request = ++loadRequest
    loadError.value = ''
    const error = await marketStore.loadBrowsePage(buildListingQuery(state))
    // 只认最后一次请求的结果，先发后到的旧请求不覆盖错误提示。
    if (request === loadRequest) loadError.value = error ?? ''
  }

  // 首次进入、筛选或翻页、切换工作区（安装状态按工作区区分）都重新拉取。
  watch(
    () => [
      authStore.currentWorkspaceId,
      state.kind,
      state.category,
      state.keyword,
      state.official,
      state.page,
      state.pageSize,
    ],
    () => {
      if (authStore.currentWorkspaceId) void load()
    },
    { immediate: true },
  )

  // 后退、前进改写了 URL 里的关键词时，输入框跟着同步。
  watch(
    () => state.keyword,
    (keyword) => {
      keywordInput.value = keyword
    },
  )

  /** 回车或点「查询」：关键词写入 URL 触发拉取；关键词没变时相当于刷新。 */
  function onSearch() {
    const keyword = keywordInput.value.trim()
    if (keyword === state.keyword) {
      void load()
      return
    }
    state.keyword = keyword
  }

  function onReset() {
    keywordInput.value = ''
    reset()
  }

  onBeforeUnmount(() => {
    loadRequest += 1
  })

  return {
    state,
    keywordInput,
    items,
    total,
    loading,
    loadError,
    hasActiveFilter,
    load,
    onSearch,
    onReset,
  }
}
