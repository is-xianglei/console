import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { getChatModelCapabilities } from '@/http/settings/models'
import type { ChatModelCapabilities } from '@/interfaces/settings/models/model'
import { useChatModelsStore } from './chat-models'

vi.mock('@/http/settings/models', () => ({ getChatModelCapabilities: vi.fn() }))
const capabilities: ChatModelCapabilities = {
  main_provider_id: null, allow_model_switch: true, models: [], modes: [],
  supports_reasoning_effort: false, reasoning_effort_levels: [], default_reasoning_effort: 'medium', reasoning_effort_configured: false,
}

beforeEach(() => { setActivePinia(createPinia()); vi.resetAllMocks() })

describe('聊天模型能力缓存', () => {
  it('成功更新缓存，失败时保留上次能力并可重试', async () => {
    const store = useChatModelsStore()
    vi.mocked(getChatModelCapabilities).mockResolvedValueOnce(capabilities)
    await store.load()
    expect(store.capabilities).toEqual(capabilities)
    expect(store.revision).toBe(1)
    vi.mocked(getChatModelCapabilities).mockRejectedValueOnce(new Error('暂不可用'))
    await store.load()
    expect(store.capabilities).toEqual(capabilities)
    expect(store.error).toBe('暂不可用')
    expect(store.revision).toBe(1)
    vi.mocked(getChatModelCapabilities).mockResolvedValueOnce({ ...capabilities, main_provider_id: 'new' })
    await store.load()
    expect(store.error).toBe('')
    expect(store.capabilities?.main_provider_id).toBe('new')
    expect(store.revision).toBe(2)
  })

  it('相同能力成功重载也递增版本，允许后续重试归一保存', async () => {
    const store = useChatModelsStore()
    vi.mocked(getChatModelCapabilities).mockResolvedValue(capabilities)
    await store.load()
    const first = store.revision
    await store.load()
    expect(store.revision).toBe(first + 1)
    expect(store.capabilities).toEqual(capabilities)
  })

  it('身份切换 reset 后旧响应不回填', async () => {
    const store = useChatModelsStore()
    let finish!: (value: ChatModelCapabilities) => void
    vi.mocked(getChatModelCapabilities).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const pending = store.load()
    store.reset()
    finish(capabilities)
    await pending
    expect(store.capabilities).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.revision).toBe(0)
  })
})
