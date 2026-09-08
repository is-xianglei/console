import { computed, onBeforeUnmount, ref } from 'vue'
import { ApiError } from '@/http'
import { getDepartmentMemberList } from '@/http/department'
import type {
  DepartmentMemberResponse,
  DepartmentTreeResponse,
} from '@/interfaces/department/model'
import { useDepartmentsStore } from '@/stores/departments'
import { useListUrlState } from './useListUrlState'

export type DepartmentEnabledFilter = 'all' | 'enabled' | 'disabled'

/** 树行：原节点 + 搜索命中态（命中节点高亮、祖先弱化）。 */
export interface DepartmentTreeRow extends DepartmentTreeResponse {
  /** 自身命中搜索词。 */
  match: boolean
  /** 自身未命中但任一后代命中（作为祖先保留，界面弱化显示）。 */
  ancestorOfMatch: boolean
  /** 自身或其祖先为停用部门：位于停用节点子树内，界面弱化（B4）。由 flattenDepartmentTree 填充，filterDepartmentTree 阶段可为空。 */
  subtreeInactive?: boolean
}

/** 删除前置阻断信息。 */
export interface DepartmentDeleteBlockers {
  /** 下级部门数（由树节点 children 直接得出，无需请求）。 */
  childrenCount: number
  /** 直属成员数（需请求 getDepartmentMemberList）。 */
  memberCount: number
  /** 后端返回的拦截原因（原样展示，如根节点不可删）。 */
  reason?: string
}

/**
 * 递归过滤部门树：父节点保留条件为「自身命中 或 任一子孙命中」，
 * 保证命中节点带着完整祖先链返回（B6）。node.missAncestor 标记祖先弱化。
 */
export function filterDepartmentTree(nodes: DepartmentTreeResponse[], predicate: (node: DepartmentTreeResponse) => boolean): DepartmentTreeRow[] {
  const out: DepartmentTreeRow[] = []
  for (const node of nodes) {
    const children = filterDepartmentTree(node.children ?? [], predicate)
    const match = predicate(node)
    if (!match && children.length === 0) continue
    out.push({
      ...node,
      children,
      match,
      ancestorOfMatch: !match && children.length > 0,
    } as DepartmentTreeRow)
  }
  return out
}

/** 把树平铺为表格行数组；子孙沿 children 引用保留，供 getSubRows 展开。
 * flattenDepartmentTree 额外自上而下传播「停用子树」标记：父节点停用或自身停用，
 * 则本行与其全部子孙均标 subtreeInactive=true（B4 停用节点子树弱化）。 */
export function flattenDepartmentTree(nodes: DepartmentTreeRow[]): DepartmentTreeRow[] {
  const rows: DepartmentTreeRow[] = []
  const walk = (list: DepartmentTreeRow[], parentInactive: boolean) => {
    for (const node of list) {
      const subtreeInactive = parentInactive || !node.is_active
      rows.push({ ...node, subtreeInactive } as DepartmentTreeRow)
      const children = node.children as DepartmentTreeRow[] | undefined
      if (children?.length) walk(children, subtreeInactive)
    }
  }
  walk(nodes, false)
  return rows
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

/**
 * 部门列表页：树形表格、递归搜索(保留祖先链)、删除前置阻断判断、展开/折叠；
 * 搜索词与展开状态进 URL(useListUrlState)。不含编辑/保存(见 useDepartmentEditor)。
 */
export function useDepartmentManager() {
  const departmentsStore = useDepartmentsStore()

  const { state, apply, reset, isDefault } = useListUrlState({
    defaults: {
      keyword: '',
      enabledFilter: 'all' as DepartmentEnabledFilter,
      collapsed: false,
    },
    resetPageOn: ['keyword', 'enabledFilter', 'collapsed'],
  })

  const pendingDelete = ref<DepartmentTreeRow | null>(null)
  const deleting = ref(false)
  /** 删除前置阻断信息；打开弹窗时按需请求。 */
  const deleteBlockers = ref<DepartmentDeleteBlockers | null>(null)
  /** 正在请求删除阻断信息（成员数）的部门 id。 */
  const blockerBusyId = ref<number | null>(null)
  const loadingError = ref('')
  const toast = ref('')
  let toastTimer: ReturnType<typeof setTimeout> | undefined
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

  const departments = computed(() => departmentsStore.state.items)
  const tree = computed(() => departmentsStore.state.tree)
  const loading = computed(() => departmentsStore.state.loading)

  /** 递归过滤后的树（祖先链保留）。 */
  const filteredTree = computed<DepartmentTreeRow[]>(() => {
    const query = state.keyword.trim().toLowerCase()
    return filterDepartmentTree(tree.value, (item) => {
      const enabledMatches = state.enabledFilter === 'all'
        || (state.enabledFilter === 'enabled' ? item.is_active : !item.is_active)
      const searchMatches = !query
        || [item.name, item.code, item.description].some((value) => value?.toLowerCase().includes(query))
      return enabledMatches && searchMatches
    })
  })

  /** 平铺后的表格行（供 ResourceTable.data）。 */
  const rows = computed<DepartmentTreeRow[]>(() => flattenDepartmentTree(filteredTree.value))
  const allCount = computed(() => departments.value.length)
  const stats = computed(() => ({
    all: departments.value.length,
    topLevel: departments.value.filter((item) => item.parent_id == null).length,
    enabled: departments.value.filter((item) => item.is_active).length,
    roots: tree.value.length,
  }))

  function showToast(message: string) {
    toast.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, 2600)
  }

  function toggleCollapsed() {
    state.collapsed = !state.collapsed
  }

  async function loadAll(workspaceId: number | null) {
    const request = ++loadRequest
    if (!workspaceId) {
      loadingError.value = '当前账号没有可用工作区'
      return
    }
    const error = await departmentsStore.loadDepartments(workspaceId)
    if (request === loadRequest) loadingError.value = error ?? ''
  }

  function resetView() {
    loadRequest += 1
    reset()
    pendingDelete.value = null
    deleteBlockers.value = null
    loadingError.value = ''
    toast.value = ''
    blockerBusyId.value = null
    if (toastTimer) clearTimeout(toastTimer)
  }

  /**
   * 点删除时先判断前置阻断（B7）：树节点有 children 即有下级；直属成员数请求成员接口。
   * 有依赖 → 弹窗禁用确认并列出原因；无依赖才允许确认。
   */
  async function requestDelete(item: DepartmentTreeRow) {
    pendingDelete.value = item
    deleteBlockers.value = null
    blockerBusyId.value = item.id
    const workspaceId = departmentsStore.state.workspaceId
    const childrenCount = item.children?.length ?? 0
    let memberCount = 0
    let reason: string | undefined
    if (workspaceId) {
      try {
        const members: DepartmentMemberResponse[] = await getDepartmentMemberList(workspaceId, item.id, { include_descendants: false })
        memberCount = members.length
      } catch (error) {
        reason = errorMessage(error, '部门成员数查询失败')
      }
    }
    blockerBusyId.value = null
    if (childrenCount === 0 && memberCount === 0 && !reason) return
    deleteBlockers.value = { childrenCount, memberCount, reason }
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
      const error = await departmentsStore.removeDepartment(target.id)
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

  onBeforeUnmount(() => { if (toastTimer) clearTimeout(toastTimer) })

  return {
    departments,
    tree,
    loading,
    deleting,
    search,
    enabledFilter,
    state,
    apply,
    reset,
    isDefault,
    pendingDelete,
    deleteBlockers,
    blockerBusyId,
    loadingError,
    toast,
    rows,
    filteredTree,
    allCount,
    stats,
    showToast,
    toggleCollapsed,
    loadAll,
    resetView,
    requestDelete,
    cancelDelete,
    confirmDelete,
  }
}
