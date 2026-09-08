import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { GroupCreateRequest, GroupUpdateRequest } from '@/interfaces/group/api'
import type { GroupJoinMode, GroupResponse, GroupType, GroupVisibility } from '@/interfaces/group/model'
import { useAuthStore } from '@/stores/auth'
import { useGroupsStore } from '@/stores/groups'

/** 群组表单模型：下拉值统一用字符串，与 USelect 对齐；isActive 仅编辑模式使用。 */
export interface GroupFormModel {
  id: number | null
  name: string
  slug: string
  description: string
  groupType: string
  visibility: string
  joinMode: string
  isActive: boolean
}

export interface GroupValidationIssue {
  field: keyof GroupFormModel
  message: string
}

export const GROUP_TYPE_OPTIONS = [
  { value: 'team', label: '团队' },
  { value: 'community', label: '社区' },
  { value: 'region', label: '区域' },
  { value: 'custom', label: '自定义' },
]
export const GROUP_VISIBILITY_OPTIONS = [
  { value: 'workspace', label: '工作区' },
  { value: 'private', label: '私有' },
  { value: 'public', label: '公开' },
]
export const GROUP_JOIN_MODE_OPTIONS = [
  { value: 'invite', label: '仅邀请' },
  { value: 'open', label: '开放加入' },
  { value: 'approval', label: '申请审批' },
]

export function groupTypeLabel(value: string) {
  return GROUP_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? value
}

export function groupVisibilityLabel(value: string) {
  return GROUP_VISIBILITY_OPTIONS.find((item) => item.value === value)?.label ?? value
}

export function groupJoinModeLabel(value: string) {
  return GROUP_JOIN_MODE_OPTIONS.find((item) => item.value === value)?.label ?? value
}

export function emptyGroupForm(): GroupFormModel {
  return {
    id: null,
    name: '',
    slug: '',
    description: '',
    groupType: 'team',
    visibility: 'workspace',
    joinMode: 'invite',
    isActive: true,
  }
}

export function groupToForm(item: GroupResponse): GroupFormModel {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    description: item.description ?? '',
    groupType: item.group_type || 'team',
    visibility: item.visibility || 'workspace',
    joinMode: item.join_mode || 'invite',
    isActive: item.is_active ?? true,
  }
}

export function validateGroup(form: GroupFormModel): GroupValidationIssue[] {
  const issues: GroupValidationIssue[] = []
  if (!form.name.trim()) issues.push({ field: 'name', message: '请输入群组名称' })
  if (!/^[a-z0-9-]+$/.test(form.slug.trim())) {
    issues.push({ field: 'slug', message: '仅支持小写字母、数字和连字符' })
  }
  return issues
}

/** 新建时不带 is_active(后端创建契约无此字段)，编辑时才附带启用状态。 */
export function groupFormToPayload(form: GroupFormModel): GroupCreateRequest | GroupUpdateRequest {
  const base = {
    name: form.name.trim(),
    slug: form.slug.trim(),
    description: form.description.trim() || null,
    group_type: form.groupType as GroupType,
    visibility: form.visibility as GroupVisibility,
    join_mode: form.joinMode as GroupJoinMode,
  }
  if (form.id == null) return base satisfies GroupCreateRequest
  return { ...base, is_active: form.isActive } satisfies GroupUpdateRequest
}

/** 新建/编辑/保存：与列表逻辑(useGroupManager)分离，供 create/edit 路由页实例化。 */
export function useGroupEditor() {
  const router = useRouter()
  const authStore = useAuthStore()
  const groupsStore = useGroupsStore()
  const draft = ref<GroupFormModel>(emptyGroupForm())
  const loadingDetail = ref(false)
  const saving = ref(false)
  const error = ref('')

  const issues = computed<GroupValidationIssue[]>(() => validateGroup(draft.value))
  const workspaceId = computed<number | null>(() => (
    authStore.currentWorkspaceId ?? authStore.currentWorkspace?.id ?? groupsStore.state.workspaceId
  ))

  function goToList() {
    void router.push({ name: 'platform-resource', params: { module: 'organization', resource: 'groups' } })
  }

  function goToDetail(id: number) {
    void router.push({ name: 'group-detail', params: { id: String(id) } })
  }

  /** 保证 store 已绑定当前工作区并拿到群组列表。返回错误文案或 null。 */
  async function ensureCatalog(): Promise<string | null> {
    const id = workspaceId.value
    if (!id) return '当前账号没有可用工作区'
    if (groupsStore.state.workspaceId === id && groupsStore.state.items.length) return null
    return await groupsStore.loadGroups(id)
  }

  async function openCreate(): Promise<void> {
    error.value = ''
    draft.value = emptyGroupForm()
    loadingDetail.value = true
    try {
      const catalogError = await ensureCatalog()
      if (catalogError) error.value = catalogError
    } finally {
      loadingDetail.value = false
    }
  }

  async function openEdit(id: number): Promise<boolean> {
    draft.value = emptyGroupForm()
    error.value = ''
    loadingDetail.value = true
    try {
      const catalogError = await ensureCatalog()
      if (catalogError) {
        error.value = catalogError
        return false
      }
      const detailError = await groupsStore.selectGroup(id)
      const detail = groupsStore.state.detail
      if (detailError || !detail || detail.id !== id) {
        error.value = detailError ?? '群组详情加载失败，未进入编辑模式。请刷新后重试。'
        return false
      }
      draft.value = groupToForm(detail)
      return true
    } finally {
      loadingDetail.value = false
    }
  }

  /** 校验通过后调用 store.saveGroup；成功跳转详情页并返回 true。 */
  async function saveDraft(): Promise<boolean> {
    if (saving.value) return false
    if (validateGroup(draft.value).length) return false
    saving.value = true
    try {
      const catalogError = await ensureCatalog()
      if (catalogError) {
        error.value = catalogError
        return false
      }
      const targetId = draft.value.id ?? undefined
      const saveError = await groupsStore.saveGroup(groupFormToPayload(draft.value), targetId)
      if (saveError) {
        error.value = saveError
        return false
      }
      error.value = ''
      const savedId = groupsStore.state.selectedId ?? targetId ?? null
      if (groupsStore.state.detail) draft.value = groupToForm(groupsStore.state.detail)
      if (savedId != null) goToDetail(savedId)
      else goToList()
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
    goToList,
    goToDetail,
  }
}
