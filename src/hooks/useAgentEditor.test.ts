import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AgentResponse } from '@/interfaces/agent/api'
import { useAgentsStore } from '@/stores/agents'
import { useAgentEditor } from './useAgentEditor'

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}))
const toastAdd = vi.fn()
vi.mock('@nuxt/ui/composables', () => ({
  useToast: () => ({ add: toastAdd }),
}))

function agent(): AgentResponse {
  return {
    id: 5,
    workspace_id: 3,
    name: '设备诊断',
    description: '分析设备信号',
    system_prompt: '依据证据分析。',
    model_name: 'Qwen3-32B',
    is_enabled: true,
    created_by_user_id: 2,
    tool_ids: [1],
    skill_ids: [2],
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  }
}

describe('useAgentEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    // routerPush / toastAdd 是模块级 mock，逐例清空调用记录，避免断言串到上一个用例。
    vi.clearAllMocks()
    setActivePinia(createPinia())
    const agentsStore = useAgentsStore()
    agentsStore.loadAgentDetail = vi.fn()
    agentsStore.saveAgent = vi.fn()
  })

  it('openCreate(空) 建立空草稿', async () => {
    const editor = useAgentEditor()
    await editor.openCreate()
    expect(editor.draft.value.id).toBeNull()
    expect(editor.draft.value.name).toBe('')
  })

  it('openCreate(sourceId) 复制为副本草稿', async () => {
    const agentsStore = useAgentsStore()
    ;(agentsStore.loadAgentDetail as ReturnType<typeof vi.fn>).mockResolvedValue(agent())
    const editor = useAgentEditor()
    await editor.openCreate(5)
    expect(editor.draft.value.id).toBeNull()
    expect(editor.draft.value.name).toBe('设备诊断 副本')
    expect(editor.draft.value.toolIds).toEqual([1])
  })

  it('openEdit(id) 拉详情转表单模型', async () => {
    const agentsStore = useAgentsStore()
    ;(agentsStore.loadAgentDetail as ReturnType<typeof vi.fn>).mockResolvedValue(agent())
    const editor = useAgentEditor()
    const ok = await editor.openEdit(5)
    expect(ok).toBe(true)
    expect(editor.draft.value.id).toBe(5)
    expect(editor.draft.value.modelName).toBe('Qwen3-32B')
  })

  it('openEdit 详情缺失时返回 false 并设置 notFound', async () => {
    const agentsStore = useAgentsStore()
    ;(agentsStore.loadAgentDetail as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const editor = useAgentEditor()
    const ok = await editor.openEdit(5)
    expect(ok).toBe(false)
    expect(editor.notFound.value).toBe(true)
  })

  it('saveDraft 名称或提示词为空不提交', async () => {
    const agentsStore = useAgentsStore()
    const saveMock = (agentsStore.saveAgent as ReturnType<typeof vi.fn>)
    const editor = useAgentEditor()
    await editor.openCreate()
    editor.draft.value.name = '  '
    const ok = await editor.saveDraft()
    expect(ok).toBe(false)
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('saveDraft 成功后 toast 并回列表带 highlight', async () => {
    const agentsStore = useAgentsStore()
    const saveMock = (agentsStore.saveAgent as ReturnType<typeof vi.fn>)
    saveMock.mockResolvedValue({ item: agent(), error: null })
    const editor = useAgentEditor()
    await editor.openCreate()
    editor.draft.value.name = '设备诊断'
    editor.draft.value.systemPrompt = '依据证据分析。'
    const ok = await editor.saveDraft()
    expect(ok).toBe(true)
    expect(routerPush).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'platform-resource', query: { highlight: '5' } }),
    )
  })

  // 回归：保存成功后页面要先重置脏检查快照（onSaved），再跳回列表；顺序反了会被离开守卫拦下误弹确认。
  describe.each(['saveDraft', 'publish'] as const)('%s 的 onSaved 时序', (method) => {
    async function validEditor() {
      const editor = useAgentEditor()
      await editor.openCreate()
      editor.draft.value.name = '设备诊断'
      editor.draft.value.systemPrompt = '依据证据分析。'
      return editor
    }

    it('保存成功：先 onSaved，再 router.push', async () => {
      ;(useAgentsStore().saveAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ item: agent(), error: null })
      const onSaved = vi.fn()
      const editor = await validEditor()
      const ok = await editor[method]({ onSaved })
      expect(ok).toBe(true)
      expect(onSaved).toHaveBeenCalledTimes(1)
      expect(routerPush).toHaveBeenCalledTimes(1)
      expect(onSaved.mock.invocationCallOrder[0]!).toBeLessThan(routerPush.mock.invocationCallOrder[0]!)
    })

    it('保存失败：不调 onSaved，也不跳转', async () => {
      ;(useAgentsStore().saveAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ item: null, error: '后端返回 500' })
      const onSaved = vi.fn()
      const editor = await validEditor()
      const ok = await editor[method]({ onSaved })
      expect(ok).toBe(false)
      expect(editor.error.value).toBe('后端返回 500')
      expect(onSaved).not.toHaveBeenCalled()
      expect(routerPush).not.toHaveBeenCalled()
    })
  })
})
