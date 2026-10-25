import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AgentResponse } from '@/interfaces/agent/api'
import type { WorkflowResponse } from '@/interfaces/workflow/api'
import { useAgentsStore } from '@/stores/agents'
import { useWorkflowsStore } from '@/stores/workflows'
import { groupIssuesByStep } from './useBuilderSteps'
import { useWorkflowEditor } from './useWorkflowEditor'

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

function workflow(): WorkflowResponse {
  return {
    id: 5,
    workspace_id: 3,
    name: '故障诊断',
    description: null,
    mode: 'parallel',
    is_enabled: true,
    created_by_user_id: 2,
    agents: [{ agent_id: 7, agent_name: '设备诊断', sort_order: 0 }],
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-02T00:00:00Z',
  }
}

describe('useWorkflowEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    // routerPush / toastAdd 是模块级 mock，逐例清空调用记录，避免断言串到上一个用例。
    vi.clearAllMocks()
    setActivePinia(createPinia())
    // 编辑页需要 Agent 目录，但测试不真发请求；预填充 items 让 ensureAgents 跳过加载。
    useAgentsStore().state.items = [agent(7, '设备诊断')]
    const workflowsStore = useWorkflowsStore()
    workflowsStore.loadWorkflowDetail = vi.fn()
    workflowsStore.saveWorkflow = vi.fn()
  })

  it('openCreate(空) 建立空草稿并加载 Agent', async () => {
    const editor = useWorkflowEditor()
    await editor.openCreate()
    expect(editor.draft.value.id).toBeNull()
    expect(editor.draft.value.name).toBe('')
    expect(editor.agents.value.length).toBeGreaterThan(0)
  })

  it('openCreate(sourceId) 复制源 Workflow 为副本草稿', async () => {
    const workflowsStore = useWorkflowsStore()
    ;(workflowsStore.loadWorkflowDetail as ReturnType<typeof vi.fn>).mockResolvedValue(workflow())
    const editor = useWorkflowEditor()
    await editor.openCreate(5)
    expect(editor.draft.value.id).toBeNull()
    expect(editor.draft.value.name).toBe('故障诊断 副本')
    expect(editor.draft.value.members.map((m) => m.agentId)).toEqual([7])
  })

  it('openEdit(id) 拉详情转表单模型', async () => {
    const workflowsStore = useWorkflowsStore()
    ;(workflowsStore.loadWorkflowDetail as ReturnType<typeof vi.fn>).mockResolvedValue(workflow())
    const editor = useWorkflowEditor()
    const ok = await editor.openEdit(5)
    expect(ok).toBe(true)
    expect(editor.draft.value.id).toBe(5)
    expect(editor.draft.value.mode).toBe('parallel')
  })

  // Builder 用 issue.step 按步骤分组：成员不可用的提示要落在「成员配置」，数量不足落在「选择成员」。
  it('openEdit 后不可用成员的 issue 归到 config 步骤', async () => {
    useAgentsStore().state.items = [agent(7, '设备诊断', false)]
    const workflowsStore = useWorkflowsStore()
    ;(workflowsStore.loadWorkflowDetail as ReturnType<typeof vi.fn>).mockResolvedValue(workflow())
    const editor = useWorkflowEditor()
    await editor.openEdit(5)
    const byStep = groupIssuesByStep(editor.issues.value, (issue) => issue.step)
    expect(byStep.config).toEqual(['设备诊断 已停用或已删除，请移除后再保存。'])
    // workflow() 是并行模式且只有 1 个成员：数量不足归到 members。
    expect(byStep.members).toEqual([expect.stringContaining('至少需要 2 个成员')])
    expect(byStep.basic).toBeUndefined()
    expect(byStep).not.toHaveProperty('mode')
  })

  it('openEdit 详情缺失时返回 false 并设置 notFound', async () => {
    const workflowsStore = useWorkflowsStore()
    ;(workflowsStore.loadWorkflowDetail as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const editor = useWorkflowEditor()
    const ok = await editor.openEdit(5)
    expect(ok).toBe(false)
    expect(editor.notFound.value).toBe(true)
  })

  it('saveDraft 校验失败不提交', async () => {
    const workflowsStore = useWorkflowsStore()
    const saveMock = (workflowsStore.saveWorkflow as ReturnType<typeof vi.fn>)
    const editor = useWorkflowEditor()
    await editor.openCreate()
    editor.draft.value.name = '   '
    const ok = await editor.saveDraft()
    expect(ok).toBe(false)
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('saveDraft 成功后 toast 并回列表带 highlight', async () => {
    const workflowsStore = useWorkflowsStore()
    const saveMock = (workflowsStore.saveWorkflow as ReturnType<typeof vi.fn>)
    saveMock.mockResolvedValue({ item: workflow(), error: null })
    const editor = useWorkflowEditor()
    await editor.openCreate()
    editor.draft.value.name = '故障诊断'
    editor.draft.value.members = [{ agentId: 7, agentName: '设备诊断', isAvailable: true }]
    const ok = await editor.saveDraft()
    expect(ok).toBe(true)
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'success' }),
    )
    expect(routerPush).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'platform-resource', query: { highlight: '5' } }),
    )
  })

  // 回归：保存成功后页面要先重置脏检查快照（onSaved），再跳回列表；顺序反了会被离开守卫拦下误弹确认。
  // Workflow 只有 saveDraft 一条保存路径（Builder 只 emit save）。
  describe('saveDraft 的 onSaved 时序', () => {
    async function validEditor() {
      const editor = useWorkflowEditor()
      await editor.openCreate()
      editor.draft.value.name = '故障诊断'
      editor.draft.value.members = [{ agentId: 7, agentName: '设备诊断', isAvailable: true }]
      return editor
    }

    it('保存成功：先 onSaved，再 router.push', async () => {
      ;(useWorkflowsStore().saveWorkflow as ReturnType<typeof vi.fn>).mockResolvedValue({ item: workflow(), error: null })
      const onSaved = vi.fn()
      const editor = await validEditor()
      const ok = await editor.saveDraft({ onSaved })
      expect(ok).toBe(true)
      expect(onSaved).toHaveBeenCalledTimes(1)
      expect(routerPush).toHaveBeenCalledTimes(1)
      expect(onSaved.mock.invocationCallOrder[0]!).toBeLessThan(routerPush.mock.invocationCallOrder[0]!)
    })

    it('保存失败：不调 onSaved，也不跳转', async () => {
      ;(useWorkflowsStore().saveWorkflow as ReturnType<typeof vi.fn>).mockResolvedValue({ item: null, error: '后端返回 500' })
      const onSaved = vi.fn()
      const editor = await validEditor()
      const ok = await editor.saveDraft({ onSaved })
      expect(ok).toBe(false)
      expect(editor.error.value).toBe('后端返回 500')
      expect(onSaved).not.toHaveBeenCalled()
      expect(routerPush).not.toHaveBeenCalled()
    })
  })
})
