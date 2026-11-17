import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../index'
import { assignModelRole, deleteModelProvider, detectModelContextLength, detectModelReasoning, getChatModelCapabilities, getModelProviderList, getModelProviderSchemaList, updateDefaultModelPreference, updateModelProvider } from './models'

vi.mock('../index', () => ({ request: vi.fn() }))

beforeEach(() => { vi.resetAllMocks() })

describe('模型服务 HTTP 契约', () => {
  it('列表、协议与能力使用真实 API 路径', async () => {
    await getModelProviderList()
    await getModelProviderSchemaList()
    await getChatModelCapabilities()
    expect(request).toHaveBeenNthCalledWith(1, '/models/providers')
    expect(request).toHaveBeenNthCalledWith(2, '/models/provider-schemas')
    expect(request).toHaveBeenNthCalledWith(3, '/models/capabilities')
  })

  it('供应商和角色标识编码，空密钥更新不加入掩码', async () => {
    await updateModelProvider('id/a', { model_name: 'custom' })
    await deleteModelProvider('id/a')
    await assignModelRole('role/a', { provider_id: 'id/a' })
    expect(request).toHaveBeenNthCalledWith(1, '/models/providers/id%2Fa', { method: 'PUT', body: JSON.stringify({ model_name: 'custom' }) })
    expect(request).toHaveBeenNthCalledWith(2, '/models/providers/id%2Fa', { method: 'DELETE' })
    expect(request).toHaveBeenNthCalledWith(3, '/models/roles/role%2Fa', { method: 'PUT', body: JSON.stringify({ provider_id: 'id/a' }) })
  })

  it('默认模型请求移除旧 mock 的 preferences 包装', async () => {
    await updateDefaultModelPreference({ preferences: { default_model_provider_id: null } })
    expect(request).toHaveBeenCalledWith('/models/preferences', { method: 'PUT', body: JSON.stringify({ default_model_provider_id: null }) })
  })

  it('探测走后端接口并原样发送未保存表单', async () => {
    const payload = { provider: 'openai_compatible', provider_type: 'chat' as const, base_url: 'https://example.com/v1', api_key: '', model_name: 'custom' }
    await detectModelContextLength(payload)
    await detectModelReasoning(payload)
    expect(request).toHaveBeenNthCalledWith(1, '/models/providers/detect-context', { method: 'POST', body: JSON.stringify(payload) })
    expect(request).toHaveBeenNthCalledWith(2, '/models/providers/detect-reasoning', { method: 'POST', body: JSON.stringify(payload) })
  })
})
