import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { DepartmentCreateRequest, DepartmentUpdateRequest } from '@/interfaces/department/api'
import type { DepartmentResponse } from '@/interfaces/department/model'
import { useAuthStore } from '@/stores/auth'
import { useDepartmentsStore } from '@/stores/departments'
import { useSaveFeedback } from './useSaveFeedback'

/** 部门表单模型：下拉值统一用字符串('' 表示未选择)，与 USelect 对齐。 */
export interface DepartmentFormModel {
  id: number | null
  name: string
  code: string
  description: string
  parentId: string
  managerId: string
  sortOrder: number
  isActive: boolean
}

export interface DepartmentValidationIssue {
  field: keyof DepartmentFormModel
  message: string
}

export function emptyDepartmentForm(): DepartmentFormModel {
  return {
    id: null,
    name: '',
    code: '',
    description: '',
    parentId: '',
    managerId: '',
    sortOrder: 0,
    isActive: true,
  }
}

export function departmentToForm(item: DepartmentResponse): DepartmentFormModel {
  return {
    id: item.id,
    name: item.name,
    code: item.code ?? '',
    description: item.description ?? '',
    parentId: item.parent_id == null ? '' : String(item.parent_id),
    managerId: item.manager_id == null ? '' : String(item.manager_id),
    sortOrder: item.sort_order ?? 0,
    isActive: item.is_active ?? true,
  }
}

export function validateDepartment(form: DepartmentFormModel): DepartmentValidationIssue[] {
  const issues: DepartmentValidationIssue[] = []
  if (!form.name.trim()) issues.push({ field: 'name', message: '请输入部门名称' })
  if (form.id != null && form.parentId && Number(form.parentId) === form.id) {
    issues.push({ field: 'parentId', message: '上级部门不能是自身' })
  }
  return issues
}

export function departmentFormToPayload(form: DepartmentFormModel): DepartmentCreateRequest | DepartmentUpdateRequest {
  return {
    name: form.name.trim(),
    code: form.code.trim() || null,
    description: form.description.trim() || null,
    parent_id: form.parentId ? Number(form.parentId) : null,
    manager_id: form.managerId ? Number(form.managerId) : null,
    sort_order: form.sortOrder,
    is_active: form.isActive,
  }
}

/** 新建/编辑/保存：与列表逻辑(useDepartmentManager)分离，供 create/edit 路由页实例化。 */
export function useDepartmentEditor() {
  const router = useRouter()
  const authStore = useAuthStore()
  const departmentsStore = useDepartmentsStore()
  const feedback = useSaveFeedback({
    listRoute: { name: 'platform-resource', params: { module: 'organization', resource: 'departments' } },
    detailRoute: { name: 'department-detail' },
  })
  const draft = ref<DepartmentFormModel>(emptyDepartmentForm())
  const loadingDetail = ref(false)
  const saving = ref(false)
  const error = ref('')
  /** 编辑来源（D）：'detail' 表示从详情页进入，保存后留在详情而非回列表。 */
  const from = ref<string | undefined>(undefined)

  const issues = computed<DepartmentValidationIssue[]>(() => validateDepartment(draft.value))
  const workspaceId = computed<number | null>(() => (
    authStore.currentWorkspaceId ?? authStore.currentWorkspace?.id ?? departmentsStore.state.workspaceId
  ))

  function goToList() {
    void router.push({ name: 'platform-resource', params: { module: 'organization', resource: 'departments' } })
  }

  function goToDetail(id: number) {
    void router.push({ name: 'department-detail', params: { id: String(id) } })
  }

  /** 保证 store 已绑定当前工作区并拿到部门列表(供上级部门下拉)。返回错误文案或 null。 */
  async function ensureCatalog(): Promise<string | null> {
    const id = workspaceId.value
    if (!id) return '当前账号没有可用工作区'
    if (departmentsStore.state.workspaceId === id && departmentsStore.state.items.length) return null
    return await departmentsStore.loadDepartments(id)
  }

  async function openCreate(parentId?: number): Promise<void> {
    error.value = ''
    from.value = undefined
    draft.value = emptyDepartmentForm()
    if (parentId != null) draft.value.parentId = String(parentId)
    loadingDetail.value = true
    try {
      const catalogError = await ensureCatalog()
      if (catalogError) error.value = catalogError
    } finally {
      loadingDetail.value = false
    }
  }

  async function openEdit(id: number, source?: string): Promise<boolean> {
    draft.value = emptyDepartmentForm()
    error.value = ''
    from.value = source
    loadingDetail.value = true
    try {
      const catalogError = await ensureCatalog()
      if (catalogError) {
        error.value = catalogError
        return false
      }
      const detailError = await departmentsStore.selectDepartment(id)
      const detail = departmentsStore.state.detail
      if (detailError || !detail || detail.id !== id) {
        error.value = detailError ?? '部门详情加载失败，未进入编辑模式。请刷新后重试。'
        return false
      }
      draft.value = departmentToForm(detail)
      return true
    } finally {
      loadingDetail.value = false
    }
  }

  /** 校验通过后调用 store.saveDepartment；成功跳转详情页并返回 true。 */
  async function saveDraft(): Promise<boolean> {
    if (saving.value) return false
    if (validateDepartment(draft.value).length) return false
    saving.value = true
    try {
      const catalogError = await ensureCatalog()
      if (catalogError) {
        error.value = catalogError
        return false
      }
      const targetId = draft.value.id ?? undefined
      const saveError = await departmentsStore.saveDepartment(departmentFormToPayload(draft.value), targetId)
      if (saveError) {
        error.value = saveError
        return false
      }
      error.value = ''
      const savedId = departmentsStore.state.selectedId ?? targetId ?? null
      if (departmentsStore.state.detail) draft.value = departmentToForm(departmentsStore.state.detail)
      // 保存成功 → toast + 按来源分流（D）：从详情进入编辑则留在详情，否则回列表并带 ?highlight=<id>。
      const message = `部门「${departmentsStore.state.detail?.name ?? draft.value.name}」已保存`
      if (savedId != null && from.value === 'detail') {
        await feedback.afterSaveToDetail({ id: savedId, message })
      } else if (savedId != null) {
        await feedback.afterSave({ id: savedId, message })
      } else {
        goToList()
      }
      return true
    } finally {
      saving.value = false
    }
  }

  return {
    draft,
    issues,
    loadingDetail,
    saving,
    error,
    workspaceId,
    from,
    openCreate,
    openEdit,
    saveDraft,
    goToList,
    goToDetail,
  }
}
