import { computed, onBeforeUnmount, ref } from 'vue'
import type { MemoryType } from '@/interfaces/memory/model'
import { useMemoriesStore } from '@/stores/memories'
import { useListUrlState } from './useListUrlState'

/**
 * memories 列表页：筛选/分页状态写入 URL（useListUrlState），驱动 store 的真分页拉取。
 *
 * - keyword / memoryType / page / pageSize 全部进 route.query，刷新与后退可还原（A-2）；
 * - 筛选/分页变化由面板显式调用 load()，store 的 loadMemories 保持真分页语义；
 * - hasActiveFilter 供空态分型（总数为 0 且无筛选 →「从未创建」，否则「筛选无结果」）判定。
 */
export function useMemoryListManager() {
  const memoriesStore = useMemoriesStore()

  const { state, apply, reset, isDefault } = useListUrlState({
    defaults: {
      keyword: '',
      memoryType: 'all' as MemoryType | 'all',
      page: 1,
      pageSize: 50,
    },
    resetPageOn: ['keyword', 'memoryType', 'pageSize'],
  })

  const loadError = ref('')
  let loadRequest = 0

  // 兼容面板既有绑定名（v-model="search" / memoryType / page / pageSize），实际读写 URL state。
  const search = computed({
    get: () => state.keyword,
    set: (v: string) => { state.keyword = v },
  })
  const memoryType = computed({
    get: () => state.memoryType,
    set: (v: MemoryType | 'all') => { state.memoryType = v },
  })
  const page = computed({ get: () => state.page, set: (v: number) => { state.page = v } })
  const pageSize = computed({ get: () => state.pageSize, set: (v: number) => { state.pageSize = v } })

  const items = computed(() => memoriesStore.state.items)
  const total = computed(() => memoriesStore.state.total)
  const loading = computed(() => memoriesStore.state.loading)
  const selectedId = computed({
    get: () => memoriesStore.state.selectedId,
    set: (id: number | null) => { memoriesStore.state.selectedId = id },
  })
  const hasActiveFilter = computed(
    () => state.keyword.trim() !== '' || state.memoryType !== 'all',
  )

  async function load() {
    const request = ++loadRequest
    loadError.value = ''
    const error = await memoriesStore.loadMemories({
      query: state.keyword.trim(),
      memoryType: state.memoryType,
      page: state.page,
      pageSize: state.pageSize,
    })
    if (request === loadRequest) loadError.value = error ?? ''
  }

  // 首帧进入：从 URL 读入后立即拉取。此后筛选/分页由面板显式调用 load()。
  void load()

  function applyFilters(patch: Partial<typeof state>) {
    apply(patch)
  }

  function resetFilters() {
    reset()
  }

  function onRetry() {
    void load()
  }

  onBeforeUnmount(() => {
    // 使未完成请求失效，避免卸载后改写状态。
    loadRequest += 1
  })

  return {
    state,
    apply,
    reset,
    isDefault,
    search,
    memoryType,
    page,
    pageSize,
    items,
    total,
    loading,
    selectedId,
    hasActiveFilter,
    loadError,
    load,
    applyFilters,
    resetFilters,
    onRetry,
  }
}
