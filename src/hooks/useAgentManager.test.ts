import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { AgentResponse } from '@/interfaces/agent/api'
import { useAgentsStore } from '@/stores/agents'
import { useAgentManager, validateAgent, emptyAgentForm } from './useAgentManager'

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

function agent(id: number, name: string, isEnabled = true, modelName: string | null = null): AgentResponse {
  return {
    id,
    workspace_id: 3,
    name,
    description: `${name} 描述`,
    system_prompt: '依据证据分析。',
    model_name: modelName,
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
    useAgentsStore().loadAgents = vi.fn().mockResolvedValue(null)
  })

  it('默认每页 12 条', () => {
    const manager = useAgentManager()
    expect(manager.state.pageSize).toBe(12)
  })

  it('关键字匹配名称、描述与模型名', () => {
    useAgentsStore().state.items = [agent(1, '数据分析师', true, 'deepseek-chat'), agent(2, '客服助手')]
    const manager = useAgentManager()

    manager.state.keyword = 'deepseek'
    expect(manager.filteredAgents.value.map((item) => item.id)).toEqual([1])
    manager.state.keyword = '客服'
    expect(manager.filteredAgents.value.map((item) => item.id)).toEqual([2])
  })

  it('状态筛选按 is_enabled 过滤', () => {
    useAgentsStore().state.items = [agent(1, '甲', true), agent(2, '乙', false)]
    const manager = useAgentManager()

    manager.state.enabled = 'disabled'
    expect(manager.filteredAgents.value.map((item) => item.id)).toEqual([2])
  })

  it('空态分型：无筛选为 none，有筛选且无结果为 filtered；清除筛选后恢复', async () => {
    useAgentsStore().state.items = []
    const manager = useAgentManager()
    expect(manager.emptyMode.value).toBe('none')

    useAgentsStore().state.items = [agent(1, '甲')]
    manager.state.keyword = '不存在'
    expect(manager.pagedItems.value).toEqual([])
    expect(manager.emptyMode.value).toBe('filtered')

    manager.resetFilters()
    await nextTick()
    expect(manager.emptyMode.value).toBe('none')
    expect(manager.pagedItems.value).toHaveLength(1)
  })

  it('删除后当前页为空时退一页', () => {
    useAgentsStore().state.items = Array.from({ length: 13 }, (_, index) => agent(index + 1, `A${index + 1}`))
    const manager = useAgentManager()
    manager.state.page = 2
    expect(manager.pagedItems.value).toHaveLength(1)

    useAgentsStore().state.items = useAgentsStore().state.items.slice(0, 12)
    manager.stepBackIfPageEmpty()
    expect(manager.state.page).toBe(1)
    expect(manager.pagedItems.value).toHaveLength(12)
  })
})

describe('validateAgent', () => {
  it('名称与系统提示词必填，错误按字段返回', () => {
    const form = emptyAgentForm()
    form.name = '  '
    expect(validateAgent(form)).toEqual([
      { field: 'name', message: '请输入名称' },
      { field: 'systemPrompt', message: '请输入系统提示词' },
    ])

    form.name = '数据分析师'
    form.systemPrompt = '你是一名数据分析师。'
    expect(validateAgent(form)).toEqual([])
  })
})
