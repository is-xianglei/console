import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { GroupResponse } from '@/interfaces/group/model'
import { useGroupsStore } from '@/stores/groups'

export type GroupEnabledFilter = 'all' | 'enabled' | 'disabled'

const SEARCH_DEBOUNCE_MS = 300

/**
 * 群组列表页：加载、服务端搜索(300ms 防抖)+ 前端过滤、指标、删除、加入/退出；
 * 不含编辑/保存(见 useGroupEditor)。
 */
export function useGroupManager() {
  const groupsStore = useGroupsStore()
  const search = ref('')
  const enabledFilter = ref<GroupEnabledFilter>('all')
  const pendingDelete = ref<GroupResponse | null>(null)
  const deleting = ref(false)
  const loadingError = ref('')
  const toast = ref('')
  /** 正在加入/退出的群组 id，供行按钮与详情 header 显示独立 loading。 */
  const membershipBusyId = ref<number | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let loadRequest = 0
  /** 当前绑定的工作区，由 loadAll 记录，供搜索防抖回调使用。 */
  let boundWorkspaceId: number | null = null
  /** 最近一次已发送给后端的搜索词，避免 resetView 清空搜索等场景重复请求。 */
  let loadedSearch = ''

  const groups = computed(() => groupsStore.state.items)
  const loading = computed(() => groupsStore.state.loading)
  const myGroupIds = computed(() => new Set(groupsStore.state.myGroups.map((group) => group.id)))
  /** 前端再过滤一次：服务端搜索结果回来前也能即时收窄，且叠加启用状态筛选。 */
  const filteredGroups = computed(() => {
    const query = search.value.trim().toLowerCase()
    return groups.value.filter((item) => {
      const enabledMatches = enabledFilter.value === 'all'
        || (enabledFilter.value === 'enabled' ? item.is_active : !item.is_active)
      const searchMatches = !query
        || [item.name, item.slug, item.description, item.group_type].some((value) => value?.toLowerCase().includes(query))
      return enabledMatches && searchMatches
    })
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
    boundWorkspaceId = workspaceId
    if (!workspaceId) {
      loadingError.value = '当前账号没有可用工作区'
      return
    }
    const keyword = search.value.trim()
    loadedSearch = keyword
    const error = await groupsStore.loadGroups(workspaceId, keyword || undefined)
    if (request === loadRequest) loadingError.value = error ?? ''
  }

  /**
   * 服务端搜索：关键词变化后 300ms 防抖，调用 loadGroups(workspaceId, search)。
   * 后端按 search 过滤群组目录，前端 filteredGroups 再叠加一次即时过滤。
   */
  watch(search, (value) => {
    clearSearchTimer()
    if (!boundWorkspaceId) return
    const workspaceId = boundWorkspaceId
    const keyword = value.trim()
    if (keyword === loadedSearch) return
    searchTimer = setTimeout(() => {
      searchTimer = undefined
      if (keyword === loadedSearch) return
      loadedSearch = keyword
      const request = ++loadRequest
      void groupsStore.loadGroups(workspaceId, keyword || undefined).then((error) => {
        if (request === loadRequest) loadingError.value = error ?? ''
      })
    }, SEARCH_DEBOUNCE_MS)
  })

  function resetView() {
    loadRequest += 1
    clearSearchTimer()
    search.value = ''
    enabledFilter.value = 'all'
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

  async function confirmDelete() {
    if (!pendingDelete.value || deleting.value) return
    const target = pendingDelete.value
    deleting.value = true
    try {
      const error = await groupsStore.removeGroup(target.id)
      if (error) {
        loadingError.value = error
        return
      }
      pendingDelete.value = null
      loadingError.value = ''
      showToast(`${target.name} 已删除`)
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
    groups,
    loading,
    deleting,
    search,
    enabledFilter,
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
