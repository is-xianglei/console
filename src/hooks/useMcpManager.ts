import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useMcpStore } from '@/stores/mcp'
import { useListUrlState } from './useListUrlState'

export type McpEnabledFilter = 'all' | 'enabled' | 'disabled'

/** 卡片网格每页条数：3 列的整数倍。 */
export const MCP_PAGE_SIZES = [12, 24, 48]

/**
 * MCP server 列表：后端一次返回全部可见 server，前端筛选分页；筛选 / 分页状态写入 URL。
 */
export function useMcpManager() {
  const mcpStore = useMcpStore()
  const authStore = useAuthStore()

  const { state, reset } = useListUrlState({
    defaults: {
      keyword: '',
      enabled: 'all' as McpEnabledFilter,
      page: 1,
      pageSize: MCP_PAGE_SIZES[0],
    },
    resetPageOn: ['keyword', 'enabled', 'pageSize'],
  })

  const loadError = ref('')
  let loadRequest = 0

  const servers = computed(() => mcpStore.state.items)
  const loading = computed(() => mcpStore.state.loading)
  const hasActiveFilter = computed(() => state.keyword.trim() !== '' || state.enabled !== 'all')

  /** 关键字匹配名称 / 标识 / 描述 / 地址。 */
  const filteredServers = computed(() => {
    const query = state.keyword.trim().toLowerCase()
    return servers.value.filter((server) => {
      const enabledMatches = state.enabled === 'all'
        || (state.enabled === 'enabled' ? server.is_enabled : !server.is_enabled)
      const keywordMatches = !query
        || [server.name, server.server_key, server.description, server.url].some((value) => value?.toLowerCase().includes(query))
      return enabledMatches && keywordMatches
    })
  })

  const emptyMode = computed<'filtered' | 'none'>(() => (hasActiveFilter.value ? 'filtered' : 'none'))
  const total = computed(() => filteredServers.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, state.pageSize))))
  const clampedPage = computed(() => Math.min(Math.max(1, state.page), pageCount.value))
  const pagedItems = computed(() => {
    const start = (clampedPage.value - 1) * state.pageSize
    return filteredServers.value.slice(start, start + state.pageSize)
  })

  async function load() {
    const request = ++loadRequest
    loadError.value = ''
    const error = await mcpStore.loadServers()
    if (request === loadRequest) loadError.value = error ?? ''
  }

  watch(
    () => authStore.currentWorkspaceId,
    (workspaceId) => {
      if (workspaceId) void load()
    },
    { immediate: true },
  )

  /** 删除后当前页没有数据时退一页。 */
  function stepBackIfPageEmpty() {
    if (state.page > pageCount.value) state.page = pageCount.value
  }

  onBeforeUnmount(() => {
    loadRequest += 1
  })

  return {
    state,
    servers,
    loading,
    loadError,
    emptyMode,
    total,
    clampedPage,
    pagedItems,
    load,
    resetFilters: reset,
    stepBackIfPageEmpty,
  }
}
