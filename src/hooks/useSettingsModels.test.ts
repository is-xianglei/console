import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assignModelRole, deleteModelProvider, getDefaultModelPreference, getModelProviderList, getModelProviderSchemaList, getModelRoleList, testModelProvider, unassignModelRole, updateDefaultModelPreference } from '@/http/settings/models'
import type { ModelProviderItem } from '@/interfaces/settings/models/model'
import { providerStatus, selectableProviders, useSettingsModels } from './useSettingsModels'

const toastAdd = vi.fn()
vi.mock('@nuxt/ui/composables', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@/http/settings/models', () => ({
  assignModelRole: vi.fn(), deleteModelProvider: vi.fn(), getDefaultModelPreference: vi.fn(),
  getModelProviderList: vi.fn(), getModelProviderSchemaList: vi.fn(), getModelRoleList: vi.fn(),
  testModelProvider: vi.fn(), unassignModelRole: vi.fn(), updateDefaultModelPreference: vi.fn(),
}))

function item(id: string, overrides: Partial<ModelProviderItem> = {}): ModelProviderItem {
  return {
    provider_id: id,
    display_name: id,
    provider_type: 'chat',
    provider: 'openai_compatible',
    base_url: '',
    api_key: '',
    model_name: `${id}-model`,
    extra_config: {},
    is_active: true,
    ...overrides,
  }
}

describe('selectableProviders', () => {
  const list = [
    item('chat-on'),
    item('chat-off', { is_active: false }),
    item('embed', { provider_type: 'embedding' }),
  ]

  it('只列启用的同用途供应商，选项为「名称 (模型名)」', () => {
    expect(selectableProviders(list, 'chat')).toEqual([{ value: 'chat-on', label: 'chat-on (chat-on-model)' }])
  })

  it('已指派的供应商即使不合格也保留', () => {
    expect(selectableProviders(list, 'chat', 'chat-off').map((option) => option.value)).toEqual(['chat-on', 'chat-off'])
    expect(selectableProviders(list, 'chat', 'embed').map((option) => option.value)).toEqual(['chat-on', 'embed'])
  })
})

describe('providerStatus', () => {
  it('停用优先，其次看测试结果', () => {
    expect(providerStatus(item('a', { is_active: false, last_test_status: 'success' }))).toBe('inactive')
    expect(providerStatus(item('a', { last_test_status: 'success' }))).toBe('success')
    expect(providerStatus(item('a', { last_test_status: 'failed' }))).toBe('failed')
    expect(providerStatus(item('a'))).toBe('untested')
  })
})

describe('模型服务状态', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getModelProviderList).mockResolvedValue([item('chat'), item('free')])
    vi.mocked(getModelRoleList).mockResolvedValue([{ role_key: 'agent', label: '主智能体', required_type: 'chat', provider_id: 'chat' }])
    vi.mocked(getDefaultModelPreference).mockResolvedValue({ default_model_provider_id: 'chat' })
    vi.mocked(getModelProviderSchemaList).mockResolvedValue([])
  })

  it('协议加载失败可见，重试后恢复', async () => {
    vi.mocked(getModelProviderSchemaList).mockRejectedValueOnce(new Error('协议暂不可用'))
    const models = useSettingsModels()
    await models.load()
    expect(models.loadError.value).toContain('协议暂不可用')
    expect(models.providers.value).toEqual([])
    await models.reload()
    expect(models.loadError.value).toBe('')
    expect(models.providers.value).toHaveLength(2)
  })

  it('删除被拒时确认框保留并显示后端原因', async () => {
    vi.mocked(deleteModelProvider).mockRejectedValue(new Error('主智能体仍引用此模型'))
    const models = useSettingsModels()
    await models.load()
    models.requestDelete(models.providers.value[0]!)
    expect(await models.confirmDelete()).toBe(false)
    expect(models.pendingDelete.value?.provider_id).toBe('chat')
    expect(models.deleteError.value).toContain('主智能体')
    expect(deleteModelProvider).toHaveBeenCalledWith('chat')
  })

  it('删除成功刷新列表并关闭确认框', async () => {
    const models = useSettingsModels()
    await models.load()
    models.requestDelete(models.providers.value[1]!)
    vi.mocked(getModelProviderList).mockResolvedValue([item('chat')])
    expect(await models.confirmDelete()).toBe(true)
    expect(models.pendingDelete.value).toBeNull()
    expect(models.providers.value.map((p) => p.provider_id)).toEqual(['chat'])
  })

  it('取消与设置角色分配均使用真实接口，成功后重拉', async () => {
    const models = useSettingsModels()
    await models.load()
    await models.assignRole('agent', null)
    expect(unassignModelRole).toHaveBeenCalledWith('agent')
    await models.assignRole('agent', 'free')
    expect(assignModelRole).toHaveBeenCalledWith('agent', { provider_id: 'free' })
    expect(getModelRoleList).toHaveBeenCalledTimes(3)
  })

  it('默认模型失败时保持原选择，成功才更新', async () => {
    const models = useSettingsModels()
    await models.load()
    vi.mocked(updateDefaultModelPreference).mockRejectedValueOnce(new Error('没有权限'))
    await models.setDefaultProvider('free')
    expect(models.defaultProviderId.value).toBe('chat')
    vi.mocked(updateDefaultModelPreference).mockResolvedValue({ default_model_provider_id: 'free' })
    await models.setDefaultProvider('free')
    expect(models.defaultProviderId.value).toBe('free')
    expect(updateDefaultModelPreference).toHaveBeenLastCalledWith({ preferences: { default_model_provider_id: 'free' } })
  })

  it('连通性测试展示后端错误并刷新状态', async () => {
    vi.mocked(testModelProvider).mockResolvedValue({ success: false, latency_ms: 5, error: '密钥无效' })
    const models = useSettingsModels()
    await models.testProvider(item('chat'))
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: '连通性失败：密钥无效', color: 'error' }))
    expect(models.testingId.value).toBeNull()
  })
})
