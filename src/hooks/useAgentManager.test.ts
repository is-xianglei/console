import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { AgentResponse } from '@/interfaces/agent/api'
import { useAgentsStore } from '@/stores/agents'
import { useAgentManager } from './useAgentManager'

const routeState = reactive({
  name: 'platform-resource',
  params: { module: 'build', resource: 'agents' },
  query: {} as Record<string, unknown>,
})
const router = {
  push: vi.fn(async (to: { query: Record<string, unknown> }) => { routeState.query = { ...to.query } }),
  replace: vi.fn(async (to: { query: Record<string, unknown> }) => { routeState.query = { ...to.query } }),
}

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => router,
}))

function agent(id: number, name: string, isEnabled = true): AgentResponse {
  return {
    id,
    workspace_id: 3,
    name,
    description: `${name} 描述`,
    system_prompt: '依据证据分析。',
    model_name: null,
    is_enabled: isEnabled,
    created_by_user_id: 2,
    tool_ids: [11],
    skill_ids: [21],
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  }
}

describe('useAgentManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.query = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    setActivePinia(createPinia())
  })

  it('单行启停只翻转 isEnabled 并原样回传 skill/tool 绑定', async () => {
    const agentsStore = useAgentsStore()
    const source = agent(5, '故障诊断', true)
    agentsStore.state.items = [source]
    // 注入替身：saveAgent 直接返回翻转后的对象，避免真实请求。
    agentsStore.saveAgent = vi.fn().mockImplementation(async (input) => ({
      item: { ...source, is_enabled: input.isEnabled },
      error: null,
    }))

    const manager = useAgentManager()
    expect(await manager.toggleEnabled(source)).toBe(true)
    expect(agentsStore.saveAgent).toHaveBeenCalledWith({
      id: 5,
      name: '故障诊断',
      description: '故障诊断 描述',
      systemPrompt: '依据证据分析。',
      modelName: '',
      isEnabled: false,
      toolIds: [11],
      skillIds: [21],
    })
    expect(manager.toast.value).toContain('已停用')
  })
})
