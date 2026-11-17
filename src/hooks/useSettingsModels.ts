import { computed, ref } from 'vue'
import { getActivePinia } from 'pinia'
import { useChatModelsStore } from '@/stores/chat-models'
import { useToast } from '@nuxt/ui/composables'
import {
  assignModelRole,
  deleteModelProvider,
  getDefaultModelPreference,
  getModelProviderList,
  getModelProviderSchemaList,
  getModelRoleList,
  testModelProvider,
  unassignModelRole,
  updateDefaultModelPreference,
} from '@/http/settings/models'
import type {
  ModelProviderItem,
  ModelProviderType,
  ModelRoleAssignment,
  ProviderSchema,
} from '@/interfaces/settings/models/model'

export type ProviderStatus = 'inactive' | 'success' | 'failed' | 'untested'

/** 名称前的状态图标；tone 对应设置页共享样式 .status[data-tone]。 */
export const PROVIDER_STATUS_META: Record<ProviderStatus, { label: string; icon: string; tone: 'success' | 'error' | 'muted' }> = {
  inactive: { label: '停用', icon: 'i-lucide-circle-minus', tone: 'muted' },
  success: { label: '正常', icon: 'i-lucide-circle-check', tone: 'success' },
  failed: { label: '异常', icon: 'i-lucide-circle-alert', tone: 'error' },
  untested: { label: '未测试', icon: 'i-lucide-circle-dashed', tone: 'muted' },
}

/** 状态列：停用优先，其次看最近一次测试结果。 */
export function providerStatus(item: ModelProviderItem): ProviderStatus {
  if (!item.is_active) return 'inactive'
  if (item.last_test_status === 'success') return 'success'
  if (item.last_test_status === 'failed') return 'failed'
  return 'untested'
}

export function providerOptionLabel(item: ModelProviderItem): string {
  return `${item.display_name} (${item.model_name})`
}

/**
 * 角色 / 默认模型可选的供应商：用途匹配且已启用。
 * keepId 为当前已指派的供应商，即使已不合格也保留，否则界面会显示成未分配。
 */
export function selectableProviders(providers: ModelProviderItem[], type: ModelProviderType, keepId?: string | null) {
  return providers
    .filter((item) => (item.provider_type === type && item.is_active) || item.provider_id === keepId)
    .map((item) => ({ value: item.provider_id, label: providerOptionLabel(item) }))
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** 「模型服务」模块：供应商列表、连通性测试、删除、角色指派与默认模型。 */
export function useSettingsModels() {
  const toast = useToast()
  const providers = ref<ModelProviderItem[]>([])
  const roles = ref<ModelRoleAssignment[]>([])
  const schemas = ref<ProviderSchema[]>([])
  const defaultProviderId = ref<string | null>(null)
  const loading = ref(false)
  const loadError = ref('')
  const testingId = ref<string | null>(null)
  const assigningRole = ref<string | null>(null)
  const savingDefault = ref(false)
  const pendingDelete = ref<ModelProviderItem | null>(null)
  const deleting = ref(false)
  const deleteError = ref('')

  const defaultOptions = computed(() => selectableProviders(providers.value, 'chat', defaultProviderId.value))

  function roleOptions(role: ModelRoleAssignment) {
    return selectableProviders(providers.value, role.required_type, role.provider_id)
  }

  async function fetchAll(): Promise<void> {
    const [providerList, roleList, preference, schemaList] = await Promise.all([
      getModelProviderList(),
      getModelRoleList(),
      getDefaultModelPreference(),
      getModelProviderSchemaList(),
    ])
    schemas.value = schemaList
    providers.value = providerList
    roles.value = roleList
    defaultProviderId.value = preference.default_model_provider_id
  }

  /** 首次进入与「刷新」：带加载态，失败时显示可重试的错误。 */
  async function reload(): Promise<void> {
    loading.value = true
    loadError.value = ''
    try {
      await fetchAll()
    } catch (error) {
      loadError.value = `加载模型配置失败：${errorMessage(error, '请稍后重试')}`
    } finally {
      loading.value = false
    }
  }

  async function refreshChatCapabilities(): Promise<void> {
    if (!getActivePinia()) return
    const chatModels = useChatModelsStore()
    if (chatModels.loaded) await chatModels.load()
  }

  /** 写操作后静默重拉，不闪骨架。 */
  async function refresh(): Promise<void> {
    try {
      await fetchAll()
      loadError.value = ''
      await refreshChatCapabilities()
    } catch (error) {
      loadError.value = '加载模型配置失败：' + errorMessage(error, '请稍后重试')
      toast.add({ title: `加载模型配置失败：${errorMessage(error, '请稍后重试')}`, color: 'error' })
    }
  }

  async function load(): Promise<void> {
    await reload()
  }

  async function testProvider(item: ModelProviderItem): Promise<void> {
    if (testingId.value) return
    testingId.value = item.provider_id
    try {
      const result = await testModelProvider(item.provider_id)
      if (result.success) toast.add({ title: `连通性正常（${result.latency_ms}ms）`, color: 'success' })
      else toast.add({ title: `连通性失败：${result.error ?? ''}`, color: 'error' })
      await refresh()
    } catch (error) {
      toast.add({ title: errorMessage(error, '测试失败'), color: 'error' })
    } finally {
      testingId.value = null
    }
  }

  function requestDelete(item: ModelProviderItem): void {
    pendingDelete.value = item
    deleteError.value = ''
  }

  function cancelDelete(): void {
    if (deleting.value) return
    pendingDelete.value = null
    deleteError.value = ''
  }

  /** 删除被拒（如仍被角色引用）时保留确认框并显示原因。 */
  async function confirmDelete(): Promise<boolean> {
    const target = pendingDelete.value
    if (!target || deleting.value) return false
    deleting.value = true
    deleteError.value = ''
    try {
      await deleteModelProvider(target.provider_id)
      pendingDelete.value = null
      toast.add({ title: '已删除', color: 'success' })
      await refresh()
      return true
    } catch (error) {
      deleteError.value = errorMessage(error, '删除失败，请稍后重试')
      return false
    } finally {
      deleting.value = false
    }
  }

  /** 选中即保存；providerId 为空表示取消分配。 */
  async function assignRole(roleKey: string, providerId: string | null | undefined): Promise<void> {
    const role = roles.value.find((item) => item.role_key === roleKey)
    if (!role || (role.provider_id ?? null) === (providerId ?? null)) return
    assigningRole.value = roleKey
    try {
      if (providerId) await assignModelRole(roleKey, { provider_id: providerId })
      else await unassignModelRole(roleKey)
      toast.add({ title: '角色分配已更新', color: 'success' })
      await refresh()
    } catch (error) {
      toast.add({ title: errorMessage(error, '角色分配失败'), color: 'error' })
    } finally {
      assigningRole.value = null
    }
  }

  async function setDefaultProvider(providerId: string | null | undefined): Promise<void> {
    const next = providerId ?? null
    if (next === defaultProviderId.value) return
    savingDefault.value = true
    try {
      const preference = await updateDefaultModelPreference({ preferences: { default_model_provider_id: next } })
      defaultProviderId.value = preference.default_model_provider_id
      toast.add({ title: '默认模型已更新', color: 'success' })
      await refreshChatCapabilities()
    } catch (error) {
      toast.add({ title: errorMessage(error, '默认模型更新失败'), color: 'error' })
    } finally {
      savingDefault.value = false
    }
  }

  return {
    providers,
    roles,
    schemas,
    defaultProviderId,
    defaultOptions,
    loading,
    loadError,
    testingId,
    assigningRole,
    savingDefault,
    pendingDelete,
    deleting,
    deleteError,
    roleOptions,
    load,
    reload,
    refresh,
    testProvider,
    requestDelete,
    cancelDelete,
    confirmDelete,
    assignRole,
    setDefaultProvider,
  }
}
