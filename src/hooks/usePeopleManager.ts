import { computed, onBeforeUnmount, ref } from 'vue'
import { ApiError } from '@/http'
import { deleteUser } from '@/http/user'
import { updateWorkspaceMemberRole } from '@/http/workspace'
import type { UserResponse } from '@/interfaces/user/model'
import type { WorkspaceMemberDetailResponse, WorkspaceMemberRole } from '@/interfaces/workspace/model'
import type { DepartmentTreeResponse } from '@/interfaces/department/model'
import { useAuthStore } from '@/stores/auth'
import { useDepartmentsStore } from '@/stores/departments'
import { useListUrlState } from './useListUrlState'
import { useOrganizationSupport } from './useOrganizationSupport'
import { usePermissions } from './usePermissions'

/** 人员列表行：用户目录 + 该用户在当前工作区的成员关系(非成员为 null)。 */
export type PersonRow = UserResponse & { membership: WorkspaceMemberDetailResponse | null }

export type PeopleMembershipFilter = 'all' | 'member' | 'admin' | 'non-member'

/** 用户目录单次拉取上限(getUserList limit)。后端仅支持 limit/offset，无 total、无 keyword，
 * 故 people 真分页不可行：仍一次拉全量 + 前端过滤分页（A5，待后端补齐）。 */
export const USER_LIST_LIMIT = 200

export const WORKSPACE_ROLE_OPTIONS = [
  { value: 'member', label: '成员' },
  { value: 'admin', label: '管理员' },
]

/** 左树本地搜索的过滤结果：命中节点保留祖先链（与部门搜索一致的交互）。 */
export function filterPeopleTree(nodes: DepartmentTreeResponse[], predicate: (node: DepartmentTreeResponse) => boolean): DepartmentTreeResponse[] {
  const out: DepartmentTreeResponse[] = []
  for (const node of nodes) {
    const children = filterPeopleTree(node.children ?? [], predicate)
    if (!predicate(node) && children.length === 0) continue
    out.push({ ...node, children })
  }
  return out
}

/** 统计命中总数（用于树面板「命中 N 个」提示）。 */
export function countPeopleTree(nodes: DepartmentTreeResponse[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.children?.length) count += countPeopleTree(node.children)
  }
  return count + nodes.length
}

export function workspaceRoleLabel(value?: string | null) {
  if (!value) return '非成员'
  return WORKSPACE_ROLE_OPTIONS.find((item) => item.value === value)?.label ?? value
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

/**
 * 人员列表页：users + workspaceMembers 合成行、左部门树范围导航、前端搜索/归属/部门过滤、
 * 前端分页(后端无 total)、行级权限(can 删除自己不可)、批量删除(剔除自己)；
 * 以及详情页共用的跨源归属变更(部门走 departmentsStore，角色走 workspace http)。
 * 不含新建/编辑表单(见 usePeopleEditor)。
 */
export function usePeopleManager() {
  const authStore = useAuthStore()
  const departmentsStore = useDepartmentsStore()
  const support = useOrganizationSupport()
  const { can } = usePermissions()

  const { state, apply, reset, isDefault } = useListUrlState({
    defaults: {
      departmentId: '',
      keyword: '',
      membership: 'all' as PeopleMembershipFilter,
      page: 1,
      pageSize: 20,
    },
    resetPageOn: ['departmentId', 'keyword', 'membership', 'pageSize'],
  })

  const pendingDelete = ref<PersonRow | null>(null)
  const deleting = ref(false)
  const loadingError = ref('')
  const toast = ref('')
  /** 正在变更归属(部门/角色)的用户 id，供详情页下拉显示 loading。 */
  const assigning = ref(false)
  /** 勾选行 id 集合(v-model:selected)。 */
  const selectedIds = ref<string[]>([])
  /** 左树本地搜索词与折叠态：只做树内过滤/记忆，不写 URL 也不触发列表请求（A1/A7）。 */
  const treeSearch = ref('')
  const treeCollapsed = ref(false)
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let loadRequest = 0
  /** 当前绑定的工作区，由 loadAll 记录，供归属变更后刷新使用。 */
  let boundWorkspaceId: number | null = null

  // 兼容模板既有绑定名（v-model="search" / membershipFilter），实际读写 state。
  const search = computed({
    get: () => state.keyword,
    set: (v) => { state.keyword = v },
  })
  const membershipFilter = computed({
    get: () => state.membership,
    set: (v) => { state.membership = v },
  })
  const page = computed({ get: () => state.page, set: (v) => { state.page = v } })
  const pageSize = computed({ get: () => state.pageSize, set: (v) => { state.pageSize = v } })
  const departmentId = computed({ get: () => state.departmentId, set: (v) => { state.departmentId = v } })

  const currentUserId = computed(() => authStore.state.user?.id ?? null)
  const users = computed(() => support.users.value)
  const workspaceMembers = computed(() => support.workspaceMembers.value)
  const loading = computed(() => support.loading.value)
  /** 用户目录达到单次拉取上限时弱化提示（A5，后端无 total 时不阻塞）。 */
  const userLimitReached = computed(() => users.value.length >= USER_LIST_LIMIT)

  /** 操作发起者（当前登录用户）在当前工作区的角色：非管理员不能操作管理员（A6）。 */
  const operatorRole = computed<string | undefined>(() => {
    const id = currentUserId.value
    if (id == null) return undefined
    return workspaceMembers.value.find((item) => item.user_id === id)?.role
  })

  /** 合成行：按 user_id 索引工作区成员，非成员 membership 为 null。 */
  const people = computed<PersonRow[]>(() => {
    const memberships = new Map(workspaceMembers.value.map((item) => [item.user_id, item]))
    return users.value.map((user) => ({ ...user, membership: memberships.get(user.id) ?? null }))
  })

  /**
   * 前端过滤：后端不支持 department_id / keyword / 分页 total（A5），这里仅能做
   * 当前成员集合内的过滤（待后端补齐接口参数后迁移服务端）。
   * 部门范围 = 左树选中部门及其子孙（由 workspaceMembers.department_id 比对）。
   */
  const filteredPeople = computed(() => {
    const query = state.keyword.trim().toLowerCase()
    const deptIds = new Set<string>()
    if (state.departmentId) {
      deptIds.add(state.departmentId)
      collectDescendantIds(departmentsStore.state.tree, state.departmentId, deptIds)
    }
    const hasDeptFilter = deptIds.size > 0
    return people.value.filter((item) => {
      const filter = state.membership
      const membershipMatches = filter === 'all'
        || (filter === 'member' && item.membership != null)
        || (filter === 'admin' && item.membership?.role === 'admin')
        || (filter === 'non-member' && item.membership == null)
      const searchMatches = !query
        || [item.username, item.email, item.full_name, item.phone].some((value) => value?.toLowerCase().includes(query))
      const deptMatches = !hasDeptFilter
        || (item.membership?.department_id != null && deptIds.has(String(item.membership.department_id)))
      return membershipMatches && searchMatches && deptMatches
    })
  })

  const total = computed(() => filteredPeople.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, state.pageSize))))
  const clampedPage = computed(() => Math.min(Math.max(1, state.page), pageCount.value))
  /** 当前页切片（后端无 total，前端分页；A5 待后端补齐）。 */
  const pagedItems = computed(() => {
    const start = (clampedPage.value - 1) * state.pageSize
    return filteredPeople.value.slice(start, start + state.pageSize)
  })

  /** 勾选集合剔除当前登录用户与不满足行级规则的记录（A6：批量集合自动剔除）。 */
  const safeSelectedIds = computed(() =>
    selectedIds.value.filter((id) => {
      const row = people.value.find((item) => String(item.id) === id)
      return row ? canDeletePerson(row) : false
    }),
  )
  const selectedTotal = computed(() => safeSelectedIds.value.length)

  /** 左部门树数据源：getDepartmentTree(store.state.tree) + 树内本地搜索。 */
  const departmentTree = computed(() => {
    const query = treeSearch.value.trim().toLowerCase()
    if (!query) return departmentsStore.state.tree
    return filterPeopleTree(departmentsStore.state.tree, (node) =>
      node.name.toLowerCase().includes(query))
  })

  function isSelf(userId: number) {
    return currentUserId.value != null && currentUserId.value === userId
  }

  function showToast(message: string) {
    toast.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, 2600)
  }

  /** 部门目录仅用于列名/下拉与左树，已绑定同一工作区时不重复拉取。 */
  async function ensureDepartments(workspaceId: number): Promise<string | null> {
    if (departmentsStore.state.workspaceId === workspaceId && departmentsStore.state.items.length) return null
    return await departmentsStore.loadDepartments(workspaceId)
  }

  /**
   * 拉取用户目录 + 工作区成员(复用 useOrganizationSupport.loadSupportData，一次请求)与部门目录。
   * loadSupportData 内部吞掉异常并清空数据，这里据此给出加载失败提示。
   */
  async function loadAll(workspaceId: number | null) {
    const request = ++loadRequest
    boundWorkspaceId = workspaceId
    if (!workspaceId) {
      loadingError.value = '当前账号没有可用工作区'
      return
    }
    const [supportError, departmentError] = await Promise.all([
      support.loadSupportData(workspaceId),
      ensureDepartments(workspaceId),
    ])
    if (request !== loadRequest) return
    loadingError.value = supportError ?? departmentError ?? ''
  }

  /** 归属变更/删除后的刷新：只重拉 users + workspaceMembers。 */
  async function refresh() {
    if (!boundWorkspaceId) return
    await support.loadSupportData(boundWorkspaceId)
  }

  function resetView() {
    loadRequest += 1
    reset()
    pendingDelete.value = null
    loadingError.value = ''
    toast.value = ''
    assigning.value = false
    selectedIds.value = []
    if (toastTimer) clearTimeout(toastTimer)
  }

  /** 点左树节点：写 departmentId 且 page 归 1（A2）。空字符串表示清除部门范围。 */
  function selectDepartment(departmentIdValue: string) {
    state.departmentId = departmentIdValue
  }

  /** 重置：清空表单与树选中（A2），调用 useEffect 的 reset() 已清 departmentId。 */
  function clearFilters() {
    reset()
    selectedIds.value = []
  }

  /** 行级操作规则集中走 usePermissions().can（A6）：不能删自己、非管理员不能操作管理员。 */
  function canDeletePerson(row: PersonRow) {
    return can('delete', 'person', {
      id: row.id,
      role: row.membership?.role,
      operatorRole: operatorRole.value,
    }).allowed
  }

  /** 行级停用/启用规则集中走 can（A6）：不能停用自己、非管理员不能操作管理员。 */
  function canTogglePerson(row: PersonRow) {
    return can('toggle', 'person', {
      id: row.id,
      role: row.membership?.role,
      operatorRole: operatorRole.value,
    }).allowed
  }

  /** 行级删除规则：不满足时忽略 requestDelete。 */
  function requestDelete(item: PersonRow) {
    if (!canDeletePerson(item)) return
    pendingDelete.value = item
  }

  function cancelDelete() {
    pendingDelete.value = null
  }

  /** 删除用户(users 接口，不依赖 workspaceId)，成功后重拉目录；返回是否成功。 */
  async function confirmDelete(): Promise<boolean> {
    if (!pendingDelete.value || deleting.value) return false
    const target = pendingDelete.value
    if (!canDeletePerson(target)) {
      loadingError.value = '不能删除当前登录用户'
      pendingDelete.value = null
      return false
    }
    deleting.value = true
    try {
      await deleteUser(target.id)
      pendingDelete.value = null
      loadingError.value = ''
      await refresh()
      showToast(`${target.full_name || target.username} 已删除`)
      return true
    } catch (error) {
      loadingError.value = errorMessage(error, '用户删除失败')
      return false
    } finally {
      deleting.value = false
    }
  }

  /** 依赖勾选的集合统一从这里取（已自动剔除当前登录用户）。 */
  function selectedPeople(): PersonRow[] {
    return safeSelectedIds.value
      .map((id) => people.value.find((item) => String(item.id) === id))
      .filter((item): item is PersonRow => Boolean(item))
  }

  /**
   * 批量删除：后端无批量接口，逐条调 deleteUser 汇总 toast（A3，待后端补齐）。
   * 调用方先弹确认弹窗；这里执行并返回合并后的错误文案（null 表示全部成功）。
   */
  async function deleteSelected(): Promise<string | null> {
    const targets = selectedPeople()
    if (!targets.length) return null
    deleting.value = true
    const failures: string[] = []
    try {
      for (const row of targets) {
        try {
          await deleteUser(row.id)
        } catch (error) {
          failures.push(`${row.full_name || row.username}: ${errorMessage(error, '删除失败')}`)
        }
      }
      selectedIds.value = []
      await refresh()
      const ok = targets.length - failures.length
      const summary = ok > 0 ? `已删除 ${ok} 位用户` : `未删除任何用户`
      if (failures.length) {
        loadingError.value = `${summary}；${failures.slice(0, 3).join('；')}`
        return loadingError.value
      }
      showToast(summary)
      return null
    } finally {
      deleting.value = false
    }
  }

  /**
   * 变更工作区归属·部门：走 departmentsStore.setMemberDepartment(依赖 store 已绑定工作区)，
   * 保留原岗位；成功后重拉 workspaceMembers 刷新归属。返回错误文案或 null。
   */
  async function updateDepartment(userId: number, departmentId: string): Promise<string | null> {
    if (assigning.value) return null
    if (!boundWorkspaceId) return '当前账号没有可用工作区'
    assigning.value = true
    try {
      const catalogError = await ensureDepartments(boundWorkspaceId)
      if (catalogError) return catalogError
      const membership = support.membershipOf(userId)
      const error = await departmentsStore.setMemberDepartment(userId, {
        department_id: departmentId ? Number(departmentId) : null,
        job_title: membership?.job_title ?? null,
      })
      if (error) return error
      await refresh()
      return null
    } finally {
      assigning.value = false
    }
  }

  /**
   * 变更工作区归属·角色：走 workspace http updateWorkspaceMemberRole(依赖 workspaceId)；
   * 禁止把当前登录用户自己从管理员降级，成功后重拉 workspaceMembers。返回错误文案或 null。
   */
  async function updateRole(userId: number, role: string): Promise<string | null> {
    if (assigning.value) return null
    if (!boundWorkspaceId) return '当前账号没有可用工作区'
    if (isSelf(userId) && role !== 'admin') return '不能取消自己的管理员角色'
    assigning.value = true
    try {
      await updateWorkspaceMemberRole(boundWorkspaceId, userId, { role: role as WorkspaceMemberRole })
      await refresh()
      return null
    } catch (error) {
      return errorMessage(error, '角色更新失败')
    } finally {
      assigning.value = false
    }
  }

  onBeforeUnmount(() => { if (toastTimer) clearTimeout(toastTimer) })

  return {
    users,
    workspaceMembers,
    loading,
    deleting,
    assigning,
    search,
    membershipFilter,
    page,
    pageSize,
    departmentId,
    state,
    apply,
    reset,
    isDefault,
    pendingDelete,
    loadingError,
    toast,
    currentUserId,
    userLimitReached,
    people,
    filteredPeople,
    total,
    pageCount,
    clampedPage,
    pagedItems,
    selectedIds,
    safeSelectedIds,
    selectedTotal,
    selectedPeople,
    departmentTree,
    treeSearch,
    treeCollapsed,
    departmentOptions: support.departmentOptions,
    departmentName: support.departmentName,
    membershipOf: support.membershipOf,
    isSelf,
    canDeletePerson,
    canTogglePerson,
    showToast,
    loadAll,
    refresh,
    resetView,
    selectDepartment,
    clearFilters,
    requestDelete,
    cancelDelete,
    confirmDelete,
    deleteSelected,
    updateDepartment,
    updateRole,
  }
}

/** 深度优先把选中部门的全部子孙 id 收集进 set，供人员范围过滤。 */
function collectDescendantIds(tree: DepartmentTreeResponse[], targetId: string, out: Set<string>) {
  for (const node of tree) {
    if (String(node.id) !== targetId) {
      if (node.children?.length) collectDescendantIds(node.children, targetId, out)
      continue
    }
    const stack = [...(node.children ?? [])]
    while (stack.length) {
      const current = stack.pop()!
      if (current.id != null) out.add(String(current.id))
      if (current.children?.length) stack.push(...current.children)
    }
  }
}
