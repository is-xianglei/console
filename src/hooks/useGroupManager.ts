import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ApiError } from '@/http'
import { getGroupMemberList } from '@/http/group'
import type { GroupResponse } from '@/interfaces/group/model'
import { useGroupsStore } from '@/stores/groups'
import { useListUrlState } from './useListUrlState'

export type GroupEnabledFilter = 'all' | 'enabled' | 'disabled'

const SEARCH_DEBOUNCE_MS = 300
const DEFAULT_PAGE_SIZE = 20

/** 删除前置阻断信息。 */
export interface GroupDeleteBlockers {
  /** 成员数（含待审批/已邀请）。 */
  memberCount: number
  /** 后端返回的拦截原因（原样展示）。 */
  reason?: string
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

/**
 * 群组列表页：筛选/分页状态写入 URL（useListUrlState）、服务端搜索(300ms 防抖) + 前端过滤、
 * 真分页(前端切片，后端无分页)、删除前置阻断判断、加入/退出；不含编辑/保存(见 useGroupEditor)。
 *
 * p0：作为 p1/p2/p3 的照抄模板——接入 useListUrlState（keyword/enabledFilter 进 URL）、
 * 真分页（ResourcePagination）、删除走 useSaveFeedback（afterDelete 由页面层调用）。
 * p1(C)：新增 groupType/dateRange 进 URL；删除前用 getGroupMemberList 取成员数做程序拦截。
 */
export function useGroupManager() {
  const groupsStore = useGroupsStore()

  const { state, apply, reset, isDefault } = useListUrlState({
    defaults: {
      keyword: '',
      groupType: 'all' as string,
      dateRange: [] as string[],
      enabledFilter: 'all' as GroupEnabledFilter,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    },
    resetPageOn: ['keyword', 'groupType', 'dateRange', 'enabledFilter', 'pageSize'],
  })

  const pendingDelete = ref<GroupResponse | null>(null)
  const deleting = ref(false)
  /** 删除前置阻断信息；requestDelete 时按需请求成员数。 */
  const deleteBlockers = ref<GroupDeleteBlockers | null>(null)
  /** 正在请求删除阻断的群组 id。 */
  const blockerBusyId = ref<number | null>(null)
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
  /**
   * 前端再过滤一次：服务端搜索结果回来前也能即时收窄，叠加启用状态/类型/创建时间筛选。
   * 类型走后端 group_type（C1），启用/时间在当前页内过滤（待后端补齐）。
   */
  const filteredGroups = computed(() => {
    const query = state.keyword.trim().toLowerCase()
    const [start, end] = state.dateRange
    return groups.value.filter((item) => {
      const enabledMatches = state.enabledFilter === 'all'
        || (state.enabledFilter === 'enabled' ? item.is_active : !item.is_active)
      const typeMatches = state.groupType === 'all' || item.group_type === state.groupType
      const searchMatches = !query
        || [item.name, item.slug, item.description, item.group_type].some((value) => value?.toLowerCase().includes(query))
      const dateMatches = !start || !end || inDateRange(item.created_at, start, end)
      return enabledMatches && typeMatches && searchMatches && dateMatches
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
      groupType: state.groupType === 'all' ? undefined : state.groupType,
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
    deleteBlockers.value = null
    loadingError.value = ''
    toast.value = ''
    membershipBusyId.value = null
    blockerBusyId.value = null
    if (toastTimer) clearTimeout(toastTimer)
  }

  /**
   * 点删除时先取成员数（C2）。有成员 → 弹窗禁用确认并列出人数；无成员才允许确认。
   */
  async function requestDelete(item: GroupResponse) {
    pendingDelete.value = item
    deleteBlockers.value = null
    blockerBusyId.value = item.id
    const workspaceId = groupsStore.state.workspaceId
    let memberCount = 0
    let reason: string | undefined
    if (workspaceId) {
      try {
        const members = await getGroupMemberList(workspaceId, item.id, { include_pending: true })
        memberCount = members.length
      } catch (error) {
        reason = errorMessage(error, '群组成员数查询失败')
      }
    }
    blockerBusyId.value = null
    if (memberCount === 0 && !reason) return
    deleteBlockers.value = { memberCount, reason }
  }

  function cancelDelete() {
    pendingDelete.value = null
    deleteBlockers.value = null
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
      deleteBlockers.value = null
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
    deleteBlockers,
    blockerBusyId,
    loadingError,
    toast,
    membershipBusyId,
    myGroupIds,
    filteredGroups,
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

/** created_at(ISO) 是否落在 [start, end] 两个日期字符串范围内（同天视为命中）。 */
function inDateRange(iso: string, start: string, end: string): boolean {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return false
  const [s, e] = [Date.parse(start), Date.parse(end)]
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false
  return at >= s && at <= e + 86_399_000
}
