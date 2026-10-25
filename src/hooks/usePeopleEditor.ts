import { computed, ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import { ApiError } from '@/http'
import { createUser, getUserDetail, updateUser } from '@/http/user'
import { inviteWorkspaceMember } from '@/http/workspace'
import type { UserCreateRequest, UserUpdateRequest } from '@/interfaces/user/api'
import type { UserResponse } from '@/interfaces/user/model'
import { useAuthStore } from '@/stores/auth'

export interface PersonSaveOptions {
  /** 保存成功（已 toast）后调用；弹窗在此关闭并让来源页原地刷新。id 为本次保存的用户。 */
  onSaved?: (id: number) => void
}

/**
 * 人员表单模型：新建 = 姓名/用户名/邮箱/初始密码/邀请开关；
 * 编辑 = 姓名/头像 URL/手机号(用户名/邮箱只读展示)。id 为 null 表示新建。
 */
export interface PersonFormModel {
  id: number | null
  fullName: string
  username: string
  email: string
  password: string
  avatarUrl: string
  phone: string
  /** 仅新建：创建成功后是否同步邀请加入当前工作区。 */
  inviteToWorkspace: boolean
}

export interface PersonValidationIssue {
  field: keyof PersonFormModel
  message: string
}

export function emptyPersonForm(): PersonFormModel {
  return {
    id: null,
    fullName: '',
    username: '',
    email: '',
    password: '',
    avatarUrl: '',
    phone: '',
    inviteToWorkspace: true,
  }
}

export function personToForm(item: UserResponse): PersonFormModel {
  return {
    id: item.id,
    fullName: item.full_name ?? '',
    username: item.username,
    email: item.email,
    password: '',
    avatarUrl: item.avatar_url ?? '',
    phone: item.phone ?? '',
    inviteToWorkspace: false,
  }
}

/** 新建校验 姓名/用户名/邮箱/密码(≥8 位)；编辑仅校验姓名。 */
export function validatePerson(form: PersonFormModel): PersonValidationIssue[] {
  const issues: PersonValidationIssue[] = []
  if (!form.fullName.trim()) issues.push({ field: 'fullName', message: '请输入姓名' })
  if (form.id == null) {
    if (!form.username.trim()) issues.push({ field: 'username', message: '请输入用户名' })
    if (!form.email.trim()) issues.push({ field: 'email', message: '请输入邮箱' })
    if (form.password.length < 8) issues.push({ field: 'password', message: '密码至少 8 位' })
  }
  return issues
}

/** 新建 → UserCreateRequest(不含头像/手机)；编辑 → UserUpdateRequest(用户名/邮箱不可改)。 */
export function personFormToPayload(form: PersonFormModel): UserCreateRequest | UserUpdateRequest {
  if (form.id == null) {
    return {
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      full_name: form.fullName.trim(),
    } satisfies UserCreateRequest
  }
  return {
    full_name: form.fullName.trim(),
    avatar_url: form.avatarUrl.trim() || null,
    phone: form.phone.trim() || null,
  } satisfies UserUpdateRequest
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

/** 新建/编辑/保存：与列表逻辑(usePeopleManager)分离，供人员表单弹窗实例化；保存后不跳转路由。 */
export function usePeopleEditor() {
  const toast = useToast()
  const authStore = useAuthStore()
  const draft = ref<PersonFormModel>(emptyPersonForm())
  const loadingDetail = ref(false)
  const saving = ref(false)
  const error = ref('')
  /**
   * 两步创建(createUser → inviteWorkspaceMember)中第一步已成功的用户；
   * 第二步失败时保留，再次 saveDraft 只重发邀请而不重复创建。
   */
  const createdUser = ref<UserResponse | null>(null)

  const issues = computed<PersonValidationIssue[]>(() => validatePerson(draft.value))
  const workspaceId = computed<number | null>(() => (
    authStore.currentWorkspaceId ?? authStore.currentWorkspace?.id ?? null
  ))
  const createdUserId = computed(() => createdUser.value?.id ?? null)

  function openCreate(): void {
    error.value = ''
    createdUser.value = null
    draft.value = emptyPersonForm()
  }

  /** getUserDetail 填充 draft；失败返回 false 并写入 error。 */
  async function openEdit(id: number): Promise<boolean> {
    draft.value = emptyPersonForm()
    error.value = ''
    createdUser.value = null
    loadingDetail.value = true
    try {
      const detail = await getUserDetail(id)
      if (detail.id !== id) {
        error.value = '用户详情加载失败，未进入编辑模式。请刷新后重试。'
        return false
      }
      draft.value = personToForm(detail)
      return true
    } catch (caught) {
      error.value = errorMessage(caught, '用户详情加载失败，未进入编辑模式。请刷新后重试。')
      return false
    } finally {
      loadingDetail.value = false
    }
  }

  /**
   * 新建：createUser → (开关开启时) inviteWorkspaceMember，两步不是一个事务：
   * 第一步失败 → 「用户创建失败」；第二步失败 → 「用户已创建但邀请失败」，保留 createdUser，
   * 再次保存只重发邀请，弹窗也可以放弃邀请(skipInvite)。全部成功后 toast + onSaved。
   */
  async function saveCreate(options?: PersonSaveOptions): Promise<boolean> {
    let user = createdUser.value
    if (!user) {
      try {
        user = await createUser(personFormToPayload(draft.value) as UserCreateRequest)
      } catch (caught) {
        error.value = errorMessage(caught, '用户创建失败')
        return false
      }
      createdUser.value = user
    }
    if (draft.value.inviteToWorkspace) {
      const id = workspaceId.value
      if (!id) {
        error.value = '用户已创建但邀请失败：当前账号没有可用工作区'
        return false
      }
      try {
        await inviteWorkspaceMember(id, { email: user.email, role: 'member' })
      } catch (caught) {
        error.value = `用户已创建但邀请失败：${errorMessage(caught, '工作区邀请发送失败')}`
        return false
      }
    }
    error.value = ''
    createdUser.value = null
    toast.add({ title: `人员「${user.full_name || user.username}」已创建`, color: 'success' })
    options?.onSaved?.(user.id)
    return true
  }

  /** 编辑：updateUser(用户名/邮箱不可改)；成功 toast + onSaved，失败写入 error。 */
  async function saveEdit(id: number, options?: PersonSaveOptions): Promise<boolean> {
    let updated: UserResponse
    try {
      updated = await updateUser(id, personFormToPayload(draft.value) as UserUpdateRequest)
    } catch (caught) {
      error.value = errorMessage(caught, '用户更新失败')
      return false
    }
    draft.value = personToForm(updated)
    error.value = ''
    toast.add({ title: `人员「${updated.full_name || updated.username}」已保存`, color: 'success' })
    options?.onSaved?.(updated.id)
    return true
  }

  /** 校验通过后按 draft.id 分流新建/编辑；成功返回 true 并调用 onSaved，不做路由跳转。 */
  async function saveDraft(options?: PersonSaveOptions): Promise<boolean> {
    if (saving.value) return false
    if (validatePerson(draft.value).length) return false
    saving.value = true
    try {
      return draft.value.id == null ? await saveCreate(options) : await saveEdit(draft.value.id, options)
    } finally {
      saving.value = false
    }
  }

  /**
   * 创建成功但邀请失败后放弃重试：清掉 error 与 createdUser，返回已创建用户的 id
   * （弹窗据此关闭并刷新列表，或前往详情）；没有待处理的已创建用户时返回 null。
   */
  function skipInvite(): number | null {
    const user = createdUser.value
    if (!user) return null
    error.value = ''
    createdUser.value = null
    return user.id
  }

  return {
    draft,
    issues,
    loadingDetail,
    saving,
    error,
    workspaceId,
    createdUserId,
    openCreate,
    openEdit,
    saveDraft,
    skipInvite,
  }
}
