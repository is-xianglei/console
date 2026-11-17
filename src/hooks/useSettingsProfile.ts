import { computed, ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import { PROFILE_FULL_NAME_MAX, PROFILE_PHONE_MAX } from '@/constants/settings/profile'
import { getProfile, updateProfile } from '@/http/settings/profile'
import type { ProfileEditableField, ProfileResponse } from '@/interfaces/settings/profile/model'

const FIELD_LABELS: Record<ProfileEditableField, string> = {
  full_name: '姓名',
  phone: '手机号',
}

/** 手机号脱敏：超过 7 位显示为「前 3 位****后 4 位」，更短的保留首尾各 1 位。 */
export function maskPhone(phone: string | null | undefined): string {
  const value = phone?.trim() ?? ''
  if (value.length > 7) return `${value.slice(0, 3)}****${value.slice(-4)}`
  if (value.length <= 2) return value
  return `${value[0]}${'*'.repeat(value.length - 2)}${value.at(-1)}`
}

/** 校验原位编辑的字段，返回错误文案；通过返回空串。 */
export function validateProfileField(field: ProfileEditableField, value: string): string {
  const trimmed = value.trim()
  if (field === 'full_name') {
    if (!trimmed) return '请输入姓名'
    if (trimmed.length > PROFILE_FULL_NAME_MAX) return `姓名不能超过 ${PROFILE_FULL_NAME_MAX} 个字符`
    return ''
  }
  if (trimmed.length > PROFILE_PHONE_MAX) return `手机号不能超过 ${PROFILE_PHONE_MAX} 个字符`
  return ''
}

/** 头像 URL 校验：只接受 http(s) 地址或站内绝对路径。 */
export function validateAvatarUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return '请输入头像 URL'
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return ''
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'http:' || url.protocol === 'https:') return ''
  } catch {
    // 落到下方统一提示
  }
  return '请输入以 http:// 或 https:// 开头的地址'
}

/** 设置页「个人信息」模块的状态：加载、姓名/手机号原位编辑、头像更换。 */
export function useSettingsProfile() {
  const toast = useToast()
  const profile = ref<ProfileResponse | null>(null)
  const loading = ref(false)
  const loadError = ref('')
  const editingField = ref<ProfileEditableField | null>(null)
  const draft = ref('')
  const fieldError = ref('')
  const savingField = ref(false)
  const savingAvatar = ref(false)

  const displayName = computed(() => profile.value?.full_name?.trim() || profile.value?.username || '')

  async function load() {
    loading.value = true
    loadError.value = ''
    try {
      profile.value = await getProfile()
    } catch (cause) {
      loadError.value = cause instanceof Error ? cause.message : '加载个人信息失败'
    } finally {
      loading.value = false
    }
  }

  function startEdit(field: ProfileEditableField) {
    if (savingField.value || !profile.value) return
    editingField.value = field
    draft.value = profile.value[field] ?? ''
    fieldError.value = ''
  }

  function cancelEdit() {
    if (savingField.value) return
    editingField.value = null
    draft.value = ''
    fieldError.value = ''
  }

  /** 提交当前编辑字段；值没变直接退出编辑。 */
  async function commitEdit() {
    const field = editingField.value
    if (!field || !profile.value || savingField.value) return
    const error = validateProfileField(field, draft.value)
    if (error) {
      fieldError.value = error
      return
    }
    const next = draft.value.trim()
    const current = profile.value[field]?.trim() ?? ''
    if (next === current) {
      cancelEdit()
      return
    }
    savingField.value = true
    try {
      profile.value = await updateProfile({ [field]: next || null })
      savingField.value = false
      cancelEdit()
      toast.add({ title: `${FIELD_LABELS[field]}已更新`, color: 'success' })
    } catch (cause) {
      savingField.value = false
      toast.add({
        title: `${FIELD_LABELS[field]}更新失败`,
        description: cause instanceof Error ? cause.message : undefined,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      })
    }
  }

  /** 保存头像；成功（或与当前一致）返回 true。 */
  async function saveAvatar(url: string): Promise<boolean> {
    if (!profile.value || savingAvatar.value) return false
    const next = url.trim()
    if (next === (profile.value.avatar_url ?? '')) return true
    savingAvatar.value = true
    try {
      profile.value = await updateProfile({ avatar_url: next })
      toast.add({ title: '头像已更新', color: 'success' })
      return true
    } catch (cause) {
      toast.add({
        title: '头像更新失败',
        description: cause instanceof Error ? cause.message : undefined,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      })
      return false
    } finally {
      savingAvatar.value = false
    }
  }

  return {
    profile,
    loading,
    loadError,
    displayName,
    editingField,
    draft,
    fieldError,
    savingField,
    savingAvatar,
    load,
    startEdit,
    cancelEdit,
    commitEdit,
    saveAvatar,
  }
}
