import { computed, ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import type { DepartmentCreateRequest, DepartmentUpdateRequest } from '@/interfaces/department/api'
import type { DepartmentResponse } from '@/interfaces/department/model'
import { useAuthStore } from '@/stores/auth'
import { useDepartmentsStore } from '@/stores/departments'

export interface DepartmentSaveOptions {
  /** 保存成功（已 toast）后调用；弹窗在此关闭并让来源页原地刷新。id 为本次保存的部门。 */
  onSaved?: (id: number | null) => void
}

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

/** 新建/编辑/保存：与列表逻辑(useDepartmentManager)分离，供部门表单弹窗实例化；保存后不跳转路由。 */
export function useDepartmentEditor() {
  const toast = useToast()
  const authStore = useAuthStore()
  const departmentsStore = useDepartmentsStore()
  const draft = ref<DepartmentFormModel>(emptyDepartmentForm())
  const loadingDetail = ref(false)
  const saving = ref(false)
  const error = ref('')

  const issues = computed<DepartmentValidationIssue[]>(() => validateDepartment(draft.value))
  const workspaceId = computed<number | null>(() => (
    authStore.currentWorkspaceId ?? authStore.currentWorkspace?.id ?? departmentsStore.state.workspaceId
  ))

  /** 保证 store 已绑定当前工作区并拿到部门列表(供上级部门下拉)。返回错误文案或 null。 */
  async function ensureCatalog(): Promise<string | null> {
    const id = workspaceId.value
    if (!id) return '当前账号没有可用工作区'
    if (departmentsStore.state.workspaceId === id && departmentsStore.state.items.length) return null
    return await departmentsStore.loadDepartments(id)
  }

  async function openCreate(parentId?: number): Promise<void> {
    error.value = ''
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

  async function openEdit(id: number): Promise<boolean> {
    draft.value = emptyDepartmentForm()
    error.value = ''
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

  /**
   * 校验通过后调用 store.saveDepartment（store 内部会重拉目录与详情）。
   * 成功：toast + onSaved(id) 并返回 true；失败写入 error，不回调。不做路由跳转。
   */
  async function saveDraft(options?: DepartmentSaveOptions): Promise<boolean> {
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
      toast.add({ title: `部门「${departmentsStore.state.detail?.name ?? draft.value.name}」已保存`, color: 'success' })
      options?.onSaved?.(savedId)
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
    openCreate,
    openEdit,
    saveDraft,
  }
}
