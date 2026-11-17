import { computed, ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import {
  INTERNET_SEARCH_ENGINE_KEY,
  INTERNET_SEARCH_ENGINES,
  SECRET_MASK,
  SERVICE_CONFIG_BOOLEAN_KEYS,
  SERVICE_CONFIG_ENUM_OPTIONS,
  type SelectOption,
} from '@/constants/settings/services'
import { getServiceConfigs, testServiceConfig, updateServiceConfigs } from '@/http/settings/services'
import type { ServiceConfigUpdateItem } from '@/interfaces/settings/services/api'
import type { ServiceConfigGroup, ServiceConfigItem } from '@/interfaces/settings/services/model'

export type ServiceConfigControl = 'boolean' | 'enum' | 'secret' | 'text'

/** 控件类型：布尔 → 开关；枚举 → 下拉；密钥 → 密码框；其余 → 输入框。按后端原值判断。 */
export function getServiceConfigControl(item: ServiceConfigItem): ServiceConfigControl {
  const value = (item.config_value ?? '').trim().toLowerCase()
  if (SERVICE_CONFIG_BOOLEAN_KEYS.has(item.config_key) || value === 'true' || value === 'false') return 'boolean'
  if (SERVICE_CONFIG_ENUM_OPTIONS[item.config_key]) return 'enum'
  if (item.is_secret) return 'secret'
  return 'text'
}

/** 枚举项的下拉选项；其他控件返回空数组。 */
export function getServiceConfigOptions(item: ServiceConfigItem): SelectOption[] {
  return getServiceConfigControl(item) === 'enum' ? SERVICE_CONFIG_ENUM_OPTIONS[item.config_key] ?? [] : []
}

/** 布尔项的开关状态：只有 'true'（不区分大小写）算开启。 */
export function isServiceConfigEnabled(value: string | null | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true'
}

export function isMaskedSecret(value: string | null | undefined): boolean {
  return Boolean(value?.includes(SECRET_MASK))
}

/** 当前值：有编辑取编辑值，否则取后端值。 */
export function resolveServiceConfigValue(item: ServiceConfigItem, edited: Record<string, string>): string {
  return edited[item.config_key] ?? item.config_value ?? ''
}

/** 可见项：互联网搜索只显示所选引擎对应的 API Key，其他分组全部显示。 */
export function getVisibleServiceConfigItems(group: ServiceConfigGroup, edited: Record<string, string>): ServiceConfigItem[] {
  if (group.group_key !== 'internet_search') return group.items
  const engineItem = group.items.find((item) => item.config_key === INTERNET_SEARCH_ENGINE_KEY)
  const engineValue = (engineItem ? resolveServiceConfigValue(engineItem, edited) : '').trim().toLowerCase()
  const engine = INTERNET_SEARCH_ENGINES.find((entry) => entry.value === engineValue) ?? INTERNET_SEARCH_ENGINES[0]
  const apiKeys = new Set<string>(INTERNET_SEARCH_ENGINES.map((entry) => entry.apiKeyConfigKey))
  return group.items.filter((item) => !apiKeys.has(item.config_key) || item.config_key === engine.apiKeyConfigKey)
}

/** 编辑值是否等于后端原值；布尔项按开关状态比较，'TRUE' 关了再开不算改动。 */
function isUnchanged(item: ServiceConfigItem, value: string): boolean {
  if (getServiceConfigControl(item) === 'boolean') return isServiceConfigEnabled(value) === isServiceConfigEnabled(item.config_value)
  return value === (item.config_value ?? '')
}

/** 所有分组合并后的提交项：只含可见、改过且与原值不同的项；仍是掩码的密钥不提交。 */
export function buildServiceConfigUpdates(groups: ServiceConfigGroup[], edited: Record<string, string>): ServiceConfigUpdateItem[] {
  return groups
    .flatMap((group) => getVisibleServiceConfigItems(group, edited))
    .filter((item) => {
      if (!(item.config_key in edited)) return false
      const value = edited[item.config_key]
      if (isUnchanged(item, value)) return false
      return !(item.is_secret && isMaskedSecret(value))
    })
    .map((item) => ({ key: item.config_key, value: edited[item.config_key] }))
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** 设置 → 服务配置：分组加载、全部改动统一保存 / 放弃、分组连通性测试。 */
export function useSettingsServices() {
  const toast = useToast()
  const groups = ref<ServiceConfigGroup[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  /** config_key → 编辑中的值；只记录用户动过的项。 */
  const edited = ref<Record<string, string>>({})
  const saving = ref(false)
  const testingGroup = ref<string | null>(null)
  /** 保存时要提交的项；条数即「N 项改动未保存」。 */
  const pendingUpdates = computed(() => buildServiceConfigUpdates(groups.value, edited.value))

  async function load(): Promise<boolean> {
    loading.value = true
    try {
      groups.value = await getServiceConfigs()
      loaded.value = true
      return true
    } catch (cause) {
      toast.add({ title: '加载服务配置失败', description: errorMessage(cause), color: 'error', icon: 'i-lucide-circle-alert' })
      return false
    } finally {
      loading.value = false
    }
  }

  function valueOf(item: ServiceConfigItem): string {
    return resolveServiceConfigValue(item, edited.value)
  }

  function setValue(item: ServiceConfigItem, value: string) {
    edited.value = { ...edited.value, [item.config_key]: value }
  }

  function visibleItems(group: ServiceConfigGroup): ServiceConfigItem[] {
    return getVisibleServiceConfigItems(group, edited.value)
  }

  /** 放弃：丢掉全部编辑，回到最近一次加载的值。 */
  function discard() {
    edited.value = {}
  }

  /** 一次提交所有分组的改动；成功后重新加载，加载成功再清空编辑，避免旧值闪回。 */
  async function save() {
    const items = pendingUpdates.value
    if (!items.length || saving.value) return
    saving.value = true
    try {
      await updateServiceConfigs({ items })
      toast.add({ title: '配置已保存（约 30 秒内生效）', color: 'success' })
      if (await load()) edited.value = {}
    } catch (cause) {
      toast.add({ title: '保存失败', description: errorMessage(cause), color: 'error', icon: 'i-lucide-circle-alert' })
    } finally {
      saving.value = false
    }
  }

  async function test(group: ServiceConfigGroup) {
    testingGroup.value = group.group_key
    try {
      const result = await testServiceConfig(group.group_key)
      if (result.success) {
        toast.add({ title: `${group.label} 连通性正常（${result.latency_ms}ms）`, color: 'success' })
      } else {
        toast.add({ title: `${group.label} 连通性失败：${result.error ?? ''}`, color: 'error', icon: 'i-lucide-circle-alert' })
      }
    } catch (cause) {
      toast.add({ title: `${group.label} 连通性失败：${errorMessage(cause)}`, color: 'error', icon: 'i-lucide-circle-alert' })
    } finally {
      testingGroup.value = null
    }
  }

  return { groups, loading, loaded, edited, saving, testingGroup, pendingUpdates, load, valueOf, setValue, visibleItems, discard, save, test }
}
