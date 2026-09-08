import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { GroupResponse } from '@/interfaces/group/model'
import { useGroupsStore } from '@/stores/groups'
import { useListUrlState } from './useListUrlState'

export type GroupEnabledFilter = 'all' | 'enabled' | 'disabled'

const SEARCH_DEBOUNCE_MS = 300
const DEFAULT_PAGE_SIZE = 20

/**
 * 群组列表页：筛选/分页状态写入 URL（useListUrlState）、服务端搜索(300ms 防抖) + 前端过滤、
 * 指标、删除、加入/退出；不含编辑/保存(见 useGroupEditor)。
 *
 * p0：作为 p1/p2/p3 的照抄模板——接入 useListUrlState（keyword/enabledFilter 进 URL）、
 * 真分页（ResourcePagination）、删除走 useSaveFeedback（afterDelete 由页面层调用）。
 */
export function useGroupManager() {
  const groupsStore = useGroupsStore()

  const { state, apply, reset, isDefault } = useListUrlState({
    defaults: {
      keyword: '',
      enabledFilter: 'all' as GroupEnabledFilter,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    },
    resetPageOn: ['keyword', 'enabledFilter', 'pageSize'],
  })

  const pendingDelete = ref<GroupResponse | null>(null)
  const deleting = ref(false)
  const loadingError = ref('')
  const toast = ref('')
  /** 正在加入/退出的群组 id，供行按钮与详情 header 显示独立 loading。 */
  const membershipBusyId = ref<number | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let loadRequest = 0

  // 兼容模板既有绑定名（v-model="search" / enabledFilter），实际读写 state。
  const search = computed({
    get: () => state.keyword,
    set: (v) => { state.keyword = v },
  })
  const enabledFilter = computed({
    get: () => state.enabledFilter,
    set: (v) => { state.enabledFilter = v },
  })
  const page = computed({ get: () => state.page, set: (v) => { state.page = v } })
  const pageSize = computed({ get: () => state.pageSize, set: (v) => { state.pageSize = v } })

  const groups = computed(() => groupsStore.state.items)
  const loading = computed(() => groupsStore.state.loading)
  const myGroupIds = computed(() => new Set(groupsStore.state.myGroups.map((group) => group.id)))
  /** 前端再过滤一次：服务端搜索结果回来前也能即时收窄，且叠加启用状态筛选。 */
  const filteredGroups = computed(() => {
    const query = state.keyword.trim().toLowerCase()
    return groups.value.filter((item) => {
      const enabledMatches = state.enabledFilter === 'all'
        || (state.enabledFilter === 'enabled' ? item.is_active : !item.is_active)
      const searchMatches = !query
        || [item.name, item.slug, item.description, item.group_type].some((value) => value?.toLowerCase().includes(query))
      return enabledMatches && searchMatches
    })
  })

  const total = computed(() => filteredGroups.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, state.pageSize))))
  const clampedPage = computed(() => Math.min(Math.max(1, state.page), pageCount.value))
  /** 当前页切片（供 ResourceTable.data）。 */
  const pagedItems = computed(() => {
    const start = (clampedPage.value - 1) * state.pageSize
    return filteredGroups.value.slice(start, start + state.pageSize)
  })

  const stats = computed(() => ({
    all: groups.value.length,
    mine: groupsStore.state.myGroups.length,
    open: groups.value.filter((item) => item.join_mode === 'open').length,
    enabled: groups.value.filter((item) => item.is_active).length,
  }))

  function isMine(groupId: number) {
    return myGroupIds.value.has(groupId)
  }

  function showToast(message: string) {
    toast.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, 2600)
  }

  function clearSearchTimer() {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = undefined
  }

  async function loadAll(workspaceId: number | null) {
    const request = ++loadRequest
    if (!workspaceId) {
      loadingError.value = '当前账号没有可用工作区'
      return
    }
    const keyword = state.keyword.trim()
    const error = await groupsStore.loadPage({
      workspaceId,
      keyword: keyword || undefined,
      page: clampedPage.value,
      pageSize: state.pageSize,
    })
    if (request === loadRequest) loadingError.value = error ?? ''
  }

  /**
   * 搜索/筛选/分页变化时重新加载。URL 双向绑定下筛选变化会由 useListUrlState 复位 page，
   * 这里统一监听 state（deep），300ms 防抖后拉取。
   */
  watch(
    state,
    () => {
      clearSearchTimer()
      const workspaceId = groupsStore.state.workspaceId
      if (!workspaceId) return
      searchTimer = setTimeout(() => {
        searchTimer = undefined
        void loadAll(workspaceId)
      }, SEARCH_DEBOUNCE_MS)
    },
    { deep: true },
  )

  // 首次进入 / 工作区切换由页面层 watch(workspaceId) → resetView / loadAll 处理；
  // 这里不重复绑定 store.workspaceId（切换时可从 URL state 复位后由 state watch 触发重拉）。

  function resetView() {
    loadRequest += 1
    clearSearchTimer()
    reset()
    pendingDelete.value = null
    loadingError.value = ''
    toast.value = ''
    membershipBusyId.value = null
    if (toastTimer) clearTimeout(toastTimer)
  }

  function requestDelete(item: GroupResponse) {
    pendingDelete.value = item
  }

  function cancelDelete() {
    pendingDelete.value = null
  }

  async function confirmDelete(): Promise<boolean> {
    if (!pendingDelete.value || deleting.value) return false
    const target = pendingDelete.value
    deleting.value = true
    try {
      const error = await groupsStore.removeGroup(target.id)
      if (error) {
        loadingError.value = error
        return false
      }
      pendingDelete.value = null
      loadingError.value = ''
      showToast(`${target.name} 已删除`)
      return true
    } finally {
      deleting.value = false
    }
  }

  /** 加入/退出共用：同一时刻只允许一个群组处理中，成功后 store 已自动刷新目录与 myGroups。 */
  async function runMembership(
    groupId: number,
    action: (id: number) => Promise<string | null>,
    success: string,
  ): Promise<boolean> {
    if (membershipBusyId.value != null) return false
    membershipBusyId.value = groupId
    try {
      const error = await action(groupId)
      if (error) {
        loadingError.value = error
        return false
      }
      loadingError.value = ''
      showToast(success)
      return true
    } finally {
      membershipBusyId.value = null
    }
  }

  function joinGroup(groupId: number) {
    return runMembership(groupId, groupsStore.joinGroup, '加入请求已提交')
  }

  function leaveGroup(groupId: number) {
    return runMembership(groupId, groupsStore.leaveGroup, '已退出群组')
  }

  onBeforeUnmount(() => {
    if (toastTimer) clearTimeout(toastTimer)
    clearSearchTimer()
  })

  return {
    state,
    apply,
    reset,
    isDefault,
    search,
    enabledFilter,
    page,
    pageSize,
    total,
    pageCount,
    clampedPage,
    pagedItems,
    groups,
    loading,
    deleting,
    pendingDelete,
    loadingError,
    toast,
    membershipBusyId,
    myGroupIds,
    filteredGroups,
    stats,
    isMine,
    showToast,
    loadAll,
    resetView,
    requestDelete,
    cancelDelete,
    confirmDelete,
    joinGroup,
    leaveGroup,
  }
}
