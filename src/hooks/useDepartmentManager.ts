import { computed, onBeforeUnmount, ref } from 'vue'
import type { DepartmentResponse } from '@/interfaces/department/model'
import { useDepartmentsStore } from '@/stores/departments'

export type DepartmentEnabledFilter = 'all' | 'enabled' | 'disabled'

/** 部门列表页：加载、前端过滤、指标、删除；不含编辑/保存(见 useDepartmentEditor)。 */
export function useDepartmentManager() {
  const departmentsStore = useDepartmentsStore()
  const search = ref('')
  const enabledFilter = ref<DepartmentEnabledFilter>('all')
  const pendingDelete = ref<DepartmentResponse | null>(null)
  const deleting = ref(false)
  const loadingError = ref('')
  const toast = ref('')
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let loadRequest = 0

  const departments = computed(() => departmentsStore.state.items)
  const loading = computed(() => departmentsStore.state.loading)
  const filteredDepartments = computed(() => {
    const query = search.value.trim().toLowerCase()
    return departments.value.filter((item) => {
      const enabledMatches = enabledFilter.value === 'all'
        || (enabledFilter.value === 'enabled' ? item.is_active : !item.is_active)
      const searchMatches = !query
        || [item.name, item.code, item.description].some((value) => value?.toLowerCase().includes(query))
      return enabledMatches && searchMatches
    })
  })
  const stats = computed(() => ({
    all: departments.value.length,
    topLevel: departments.value.filter((item) => item.parent_id == null).length,
    enabled: departments.value.filter((item) => item.is_active).length,
    roots: departmentsStore.state.tree.length,
  }))

  function showToast(message: string) {
    toast.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, 2600)
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
    search.value = ''
    enabledFilter.value = 'all'
    pendingDelete.value = null
    loadingError.value = ''
    toast.value = ''
    if (toastTimer) clearTimeout(toastTimer)
  }

  function requestDelete(item: DepartmentResponse) {
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
      const error = await departmentsStore.removeDepartment(target.id)
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

  onBeforeUnmount(() => { if (toastTimer) clearTimeout(toastTimer) })

  return {
    departments,
    loading,
    deleting,
    search,
    enabledFilter,
    pendingDelete,
    loadingError,
    toast,
    filteredDepartments,
    stats,
    showToast,
    loadAll,
    resetView,
    requestDelete,
    cancelDelete,
    confirmDelete,
  }
}
