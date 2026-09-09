import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AgentResponse } from '@/interfaces/agent/api'
import type { PlanResponse } from '@/interfaces/orchestration-plan/api'
import { useAgentsStore } from '@/stores/agents'
import { useOrchestrationPlansStore } from '@/stores/orchestrationPlans'
import { usePlanEditor } from './usePlanEditor'

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}))
const toastAdd = vi.fn()
vi.mock('@nuxt/ui/composables', () => ({
  useToast: () => ({ add: toastAdd }),
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
    tool_ids: [],
    skill_ids: [],
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  }
}

function plan(): PlanResponse {
  return {
    id: 5,
    workspace_id: 3,
    name: '故障诊断',
    description: null,
    mode: 'sequential',
    config: {},
    is_enabled: true,
    created_by_user_id: 2,
    members: [
      { id: 11, agent_id: 7, agent_name: '设备诊断', position: 0, role_config: {}, is_available: true },
      { id: 12, agent_id: 8, agent_name: '日志分析', position: 1, role_config: {}, is_available: true },
    ],
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-02T00:00:00Z',
  }
}

describe('usePlanEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    setActivePinia(createPinia())
    // 编辑页需要 Agent 目录，但测试不真发请求；预填充 items 让 ensureAgents 跳过加载。
    useAgentsStore().state.items = [agent(7, '设备诊断'), agent(8, '日志分析')]
    const plansStore = useOrchestrationPlansStore()
    plansStore.loadPlanDetail = vi.fn()
    plansStore.savePlan = vi.fn()
  })

  it('openCreate(空) 建立空草稿并加载 Agent', async () => {
    const editor = usePlanEditor()
    await editor.openCreate()
    expect(editor.draft.value.id).toBeNull()
    expect(editor.draft.value.name).toBe('')
    expect(editor.agents.value.length).toBeGreaterThan(0)
  })

  it('openCreate(sourceId) 复制源方案为副本草稿', async () => {
    const plansStore = useOrchestrationPlansStore()
    ;(plansStore.loadPlanDetail as ReturnType<typeof vi.fn>).mockResolvedValue(plan())
    const editor = usePlanEditor()
    await editor.openCreate(5)
    expect(editor.draft.value.id).toBeNull()
    expect(editor.draft.value.name).toBe('故障诊断 副本')
    expect(editor.draft.value.isEnabled).toBe(false)
    expect(editor.draft.value.members.map((m) => m.agentId)).toEqual([7, 8])
  })

  it('openEdit(id) 拉详情转表单模型', async () => {
    const plansStore = useOrchestrationPlansStore()
    ;(plansStore.loadPlanDetail as ReturnType<typeof vi.fn>).mockResolvedValue(plan())
    const editor = usePlanEditor()
    const ok = await editor.openEdit(5)
    expect(ok).toBe(true)
    expect(editor.draft.value.id).toBe(5)
    expect(editor.draft.value.mode).toBe('sequential')
  })

  it('openEdit 详情缺失时返回 false 并设置 notFound', async () => {
    const plansStore = useOrchestrationPlansStore()
    ;(plansStore.loadPlanDetail as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const editor = usePlanEditor()
    const ok = await editor.openEdit(5)
    expect(ok).toBe(false)
    expect(editor.notFound.value).toBe(true)
  })

  it('saveDraft 校验失败不提交', async () => {
    const plansStore = useOrchestrationPlansStore()
    const saveMock = (plansStore.savePlan as ReturnType<typeof vi.fn>)
    const editor = usePlanEditor()
    await editor.openCreate()
    editor.draft.value.name = '   '
    const ok = await editor.saveDraft()
    expect(ok).toBe(false)
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('saveDraft 成功后 toast 并回列表带 highlight', async () => {
    const plansStore = useOrchestrationPlansStore()
    const saveMock = (plansStore.savePlan as ReturnType<typeof vi.fn>)
    saveMock.mockResolvedValue({ item: plan(), error: null })
    const editor = usePlanEditor()
    await editor.openCreate()
    editor.draft.value.name = '故障诊断'
    editor.draft.value.members = [
      { agentId: 7, agentName: '设备诊断', routeKey: '', when: '', isAvailable: true },
      { agentId: 8, agentName: '日志分析', routeKey: '', when: '', isAvailable: true },
    ]
    const ok = await editor.saveDraft()
    expect(ok).toBe(true)
    expect(routerPush).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'platform-resource', query: { highlight: '5' } }),
    )
  })

  it('publish 以启用态提交并 toast 回列表带 highlight', async () => {
    const plansStore = useOrchestrationPlansStore()
    const saveMock = (plansStore.savePlan as ReturnType<typeof vi.fn>)
    saveMock.mockResolvedValue({ item: plan(), error: null })
    const editor = usePlanEditor()
    await editor.openCreate()
    editor.draft.value.name = '故障诊断'
    editor.draft.value.isEnabled = false
    editor.draft.value.members = [
      { agentId: 7, agentName: '设备诊断', routeKey: '', when: '', isAvailable: true },
      { agentId: 8, agentName: '日志分析', routeKey: '', when: '', isAvailable: true },
    ]
    const ok = await editor.publish()
    expect(ok).toBe(true)
    const payload = saveMock.mock.calls[0]![0]
    expect(payload.isEnabled).toBe(true)
    expect(routerPush).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'platform-resource', query: { highlight: '5' } }),
    )
  })
})
