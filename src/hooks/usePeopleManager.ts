import { computed, onBeforeUnmount, ref } from 'vue'
import { ApiError } from '@/http'
import { deleteUser } from '@/http/user'
import { updateWorkspaceMemberRole } from '@/http/workspace'
import type { UserResponse } from '@/interfaces/user/model'
import type { WorkspaceMemberDetailResponse, WorkspaceMemberRole } from '@/interfaces/workspace/model'
import { useAuthStore } from '@/stores/auth'
import { useDepartmentsStore } from '@/stores/departments'
import { useOrganizationSupport } from './useOrganizationSupport'

/** 人员列表行：用户目录 + 该用户在当前工作区的成员关系(非成员为 null)。 */
export type PersonRow = UserResponse & { membership: WorkspaceMemberDetailResponse | null }

export type PeopleMembershipFilter = 'all' | 'member' | 'admin' | 'non-member'

/** 用户目录单次拉取上限(getUserList limit)；工作区成员接口无分页，本期不做真分页。 */
export const USER_LIST_LIMIT = 200

export const WORKSPACE_ROLE_OPTIONS = [
  { value: 'member', label: '成员' },
  { value: 'admin', label: '管理员' },
]

export function workspaceRoleLabel(value?: string | null) {
  if (!value) return '非成员'
  return WORKSPACE_ROLE_OPTIONS.find((item) => item.value === value)?.label ?? value
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

/**
 * 人员列表页：users + workspaceMembers 合成行、前端搜索/归属筛选、指标、删除(禁止删自己)，
 * 以及详情页共用的跨源归属变更(部门走 departmentsStore，角色走 workspace http)；
 * 不含新建/编辑表单(见 usePeopleEditor)。
 */
export function usePeopleManager() {
  const authStore = useAuthStore()
  const departmentsStore = useDepartmentsStore()
  const support = useOrganizationSupport()
  const search = ref('')
  const membershipFilter = ref<PeopleMembershipFilter>('all')
  const pendingDelete = ref<PersonRow | null>(null)
  const deleting = ref(false)
  const loadingError = ref('')
  const toast = ref('')
  /** 正在变更归属(部门/角色)的用户 id，供详情页下拉显示 loading。 */
  const assigning = ref(false)
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let loadRequest = 0
  /** 当前绑定的工作区，由 loadAll 记录，供归属变更后刷新使用。 */
  let boundWorkspaceId: number | null = null

  const currentUserId = computed(() => authStore.state.user?.id ?? null)
  const users = computed(() => support.users.value)
  const workspaceMembers = computed(() => support.workspaceMembers.value)
  const loading = computed(() => support.loading.value)
  /** 用户目录达到单次拉取上限时，列表页顶部提示仅显示前 N 名。 */
  const userLimitReached = computed(() => users.value.length >= USER_LIST_LIMIT)

  /** 合成行：按 user_id 索引工作区成员，非成员 membership 为 null。 */
  const people = computed<PersonRow[]>(() => {
    const memberships = new Map(workspaceMembers.value.map((item) => [item.user_id, item]))
    return users.value.map((user) => ({ ...user, membership: memberships.get(user.id) ?? null }))
  })
  const filteredPeople = computed(() => {
    const query = search.value.trim().toLowerCase()
    return people.value.filter((item) => {
      const filter = membershipFilter.value
      const membershipMatches = filter === 'all'
        || (filter === 'member' && item.membership != null)
        || (filter === 'admin' && item.membership?.role === 'admin')
        || (filter === 'non-member' && item.membership == null)
      const searchMatches = !query
        || [item.username, item.email, item.full_name, item.phone].some((value) => value?.toLowerCase().includes(query))
      return membershipMatches && searchMatches
    })
  })
  const stats = computed(() => ({
    all: users.value.length,
    members: workspaceMembers.value.length,
    assigned: workspaceMembers.value.filter((item) => item.department_id != null).length,
    admins: workspaceMembers.value.filter((item) => item.role === 'admin').length,
  }))

  function isSelf(userId: number) {
    return currentUserId.value != null && currentUserId.value === userId
  }

  function showToast(message: string) {
    toast.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, 2600)
  }

  /** 部门目录仅用于列名/下拉，已绑定同一工作区时不重复拉取。 */
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
    search.value = ''
    membershipFilter.value = 'all'
    pendingDelete.value = null
    loadingError.value = ''
    toast.value = ''
    assigning.value = false
    if (toastTimer) clearTimeout(toastTimer)
  }

  /** 当前登录用户不可删除自己：requestDelete 直接忽略。 */
  function requestDelete(item: PersonRow) {
    if (isSelf(item.id)) return
    pendingDelete.value = item
  }

  function cancelDelete() {
    pendingDelete.value = null
  }

  /** 删除用户(users 接口，不依赖 workspaceId)，成功后重拉目录；返回是否成功。 */
  async function confirmDelete(): Promise<boolean> {
    if (!pendingDelete.value || deleting.value) return false
    const target = pendingDelete.value
    if (isSelf(target.id)) {
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
    pendingDelete,
    loadingError,
    toast,
    currentUserId,
    userLimitReached,
    people,
    filteredPeople,
    stats,
    departmentOptions: support.departmentOptions,
    departmentName: support.departmentName,
    membershipOf: support.membershipOf,
    isSelf,
    showToast,
    loadAll,
    refresh,
    resetView,
    requestDelete,
    cancelDelete,
    confirmDelete,
    updateDepartment,
    updateRole,
  }
}
