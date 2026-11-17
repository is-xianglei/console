import {
  getServiceConfigMockGroups,
  INTERNET_SEARCH_ENGINE_KEY,
  INTERNET_SEARCH_ENGINES,
  SECRET_MASK,
  SERVICE_CONFIG_MOCK_DELAY,
} from '@/constants/settings/services'
import type { ServiceConfigUpdateRequest, ServiceConfigUpdateResult } from '@/interfaces/settings/services/api'
import type { ServiceConfigGroup, ServiceConfigItem, ServiceConfigTestResult } from '@/interfaces/settings/services/model'
import { ApiError } from '../index'

// 当前为模拟实现：读写 src/constants/settings/services.ts 的内存数据。
// 后端就绪后改为 request('/v1/me/system/service-configs', ...)，函数签名不变。

function wait(ms = SERVICE_CONFIG_MOCK_DELAY): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 与后端 mask_secret 一致：≤8 位整体打码，否则保留首尾各 4 位。 */
function maskSecret(value: string | null): string | null {
  if (!value) return null
  return value.length <= 8 ? SECRET_MASK : `${value.slice(0, 4)}${SECRET_MASK}${value.slice(-4)}`
}

function findItem(key: string): ServiceConfigItem | undefined {
  for (const group of getServiceConfigMockGroups()) {
    const item = group.items.find((entry) => entry.config_key === key)
    if (item) return item
  }
  return undefined
}

function readValue(key: string): string {
  return (findItem(key)?.config_value ?? '').trim()
}

/** GET /v1/me/system/service-configs — 白名单分组下的服务配置，密钥已脱敏。 */
export async function getServiceConfigs(): Promise<ServiceConfigGroup[]> {
  await wait()
  return getServiceConfigMockGroups().map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      config_value: item.is_secret ? maskSecret(item.config_value) : item.config_value,
    })),
  }))
}

/** PUT /v1/me/system/service-configs — 按 key 批量写入；带掩码的值跳过，不覆盖真实密钥。 */
export async function updateServiceConfigs(payload: ServiceConfigUpdateRequest): Promise<ServiceConfigUpdateResult> {
  await wait()
  if (!payload.items.length) throw new ApiError('items cannot be empty', 'bad_request', 400)
  const targets = payload.items.map((entry) => {
    const item = findItem(entry.key.trim())
    if (!item) throw new ApiError(`配置项 ${entry.key} 不在个人可配置范围内`, 'bad_request', 400)
    return { item, value: entry.value }
  })
  const now = new Date().toISOString()
  for (const { item, value } of targets) {
    if (value?.includes(SECRET_MASK)) continue
    item.config_value = value === null || value === '' ? null : value
    item.updated_at = now
    item.updated_by = 'me_system'
  }
  return { updated: payload.items.length }
}

/** POST /v1/me/system/service-configs/test/{group_key} — 测试分组连通性。 */
export async function testServiceConfig(groupKey: string): Promise<ServiceConfigTestResult> {
  await wait(500)
  const group = getServiceConfigMockGroups().find((entry) => entry.group_key === groupKey)
  if (!group) throw new ApiError(`Unknown group: ${groupKey}`, 'not_found', 404)
  if (!group.testable) throw new ApiError('该分组无可测试的外部服务', 'bad_request', 400)

  const latency = 80 + Math.floor(Math.random() * 320)
  if (groupKey === 'file_parser' && !readValue('file_parser.api_url')) {
    return { success: false, latency_ms: 0, error: 'URL 未配置' }
  }
  if (groupKey === 'internet_search') {
    const engine = INTERNET_SEARCH_ENGINES.find((entry) => entry.value === readValue(INTERNET_SEARCH_ENGINE_KEY).toLowerCase())
      ?? INTERNET_SEARCH_ENGINES[0]
    if (!readValue(engine.apiKeyConfigKey)) {
      return { success: false, latency_ms: 0, error: `${engine.label} API Key 未配置` }
    }
  }
  return { success: true, latency_ms: latency, error: null }
}
