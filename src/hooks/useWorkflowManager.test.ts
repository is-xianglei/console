import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AgentResponse } from '@/interfaces/agent/api'
import type { WorkflowResponse } from '@/interfaces/workflow/api'
import type { WorkflowFormModel } from '@/interfaces/workflow/model'
import { useAgentsStore } from '@/stores/agents'
import { useWorkflowsStore } from '@/stores/workflows'
import {
  DELETED_AGENT_LABEL,
  useWorkflowManager,
  validateWorkflow,
  workflowResponseToForm,
} from './useWorkflowManager'

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

function workflow(agents: WorkflowResponse['agents']): WorkflowResponse {
  return {
    id: 5,
    workspace_id: 3,
    name: '故障诊断',
    description: null,
    mode: 'parallel',
    is_enabled: true,
    created_by_user_id: 2,
    agents,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-02T00:00:00Z',
  }
}

function form(overrides: Partial<WorkflowFormModel> = {}): WorkflowFormModel {
  return {
    id: null,
    name: '故障诊断',
    description: '',
    mode: 'sequential',
    isEnabled: true,
    members: [
      { agentId: 7, agentName: '设备诊断', isAvailable: true },
    ],
    ...overrides,
  }
}

describe('workflowResponseToForm', () => {
  it('成员按 sort_order 排序', () => {
    const source = workflow([
      { agent_id: 7, agent_name: '设备诊断', sort_order: 2 },
      { agent_id: 12, agent_name: '质量分析', sort_order: 0 },
      { agent_id: 9, agent_name: '排程优化', sort_order: 1 },
    ])

    const result = workflowResponseToForm(
      source,
      [agent(7, '设备诊断'), agent(12, '质量分析'), agent(9, '排程优化')],
    )

    expect(result.members.map((member) => member.agentId)).toEqual([12, 9, 7])
    expect(result.mode).toBe('parallel')
    expect(result.description).toBe('')
  })

  it('agent_name 为 null 时显示已删除占位名，停用的 Agent 标记不可用', () => {
    const source = workflow([
      { agent_id: 7, agent_name: '设备诊断', sort_order: 0 },
      { agent_id: 12, agent_name: null, sort_order: 1 },
      { agent_id: 9, agent_name: '排程优化', sort_order: 2 },
    ])

    const result = workflowResponseToForm(source, [agent(7, '设备诊断', false)])

    expect(result.members[0]).toMatchObject({ agentName: '设备诊断', isAvailable: false })
    expect(result.members[1]).toMatchObject({ agentName: DELETED_AGENT_LABEL, isAvailable: false })
    expect(result.members[2]).toMatchObject({ agentName: '排程优化', isAvailable: false })
  })
})

describe('validateWorkflow', () => {
  it('名称去空格后不能为空', () => {
    expect(validateWorkflow(form({ name: '   ' }))).toContainEqual({
      section: 'basic',
      message: '名称不能为空。',
    })
  })

  it('名称超过 128 个字符给出提示', () => {
    const issues = validateWorkflow(form({ name: 'a'.repeat(129) }))
    expect(issues.some((issue) => issue.section === 'basic' && issue.message.includes('128'))).toBe(true)
  })

  it('成员数量低于模式最小值时给出提示', () => {
    const issues = validateWorkflow(form({
      mode: 'parallel',
      members: [{ agentId: 7, agentName: '设备诊断', isAvailable: true }],
    }))
    expect(issues).toContainEqual({
      section: 'members',
      message: expect.stringContaining('至少需要 2 个成员'),
    })
  })

  it('存在重复成员时给出提示', () => {
    const issues = validateWorkflow(form({
      members: [
        { agentId: 7, agentName: '设备诊断', isAvailable: true },
        { agentId: 7, agentName: '设备诊断', isAvailable: true },
      ],
    }))
    expect(issues.some((issue) => issue.section === 'members' && issue.message.includes('重复加入'))).toBe(true)
  })

  it('存在不可用成员时阻止保存', () => {
    const issues = validateWorkflow(form({
      members: [
        { agentId: 7, agentName: '设备诊断', isAvailable: false },
      ],
    }))
    expect(issues.some((issue) => issue.section === 'members' && issue.message.includes('请移除后再保存'))).toBe(true)
  })

  it('合法表单不产生问题', () => {
    expect(validateWorkflow(form())).toEqual([])
  })
})

describe('useWorkflowManager', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    setActivePinia(createPinia())
  })

  it('关键字与模式筛选只保留匹配项', () => {
    const workflowsStore = useWorkflowsStore()
    workflowsStore.state.items = [
      workflow([{ agent_id: 7, agent_name: '设备诊断', sort_order: 0 }]),
      {
        ...workflow([{ agent_id: 9, agent_name: '排程优化', sort_order: 0 }]),
        id: 6,
        name: '排程优化',
        mode: 'sequential',
      },
    ]
    workflowsStore.state.total = 2
    useAgentsStore().state.items = [agent(7, '设备诊断'), agent(9, '排程优化')]

    const manager = useWorkflowManager()
    manager.search.value = '故障'
    expect(manager.filteredWorkflows.value.map((item) => item.id)).toEqual([5])

    manager.search.value = ''
    manager.modeFilter.value = 'sequential'
    expect(manager.filteredWorkflows.value.map((item) => item.id)).toEqual([6])
  })

  it('按钮式启停只翻转 isEnabled 并复用现有成员', async () => {
    const workflowsStore = useWorkflowsStore()
    const source = workflow([
      { agent_id: 7, agent_name: '设备诊断', sort_order: 0 },
      { agent_id: 12, agent_name: '质量分析', sort_order: 1 },
    ])
    workflowsStore.state.items = [source]
    workflowsStore.state.total = 1
    // 注入替身：saveWorkflow 直接返回翻转后的对象，避免真实请求。
    workflowsStore.saveWorkflow = vi.fn().mockImplementation(async (input) => ({
      item: { ...source, is_enabled: input.isEnabled },
      error: null,
    }))

    const manager = useWorkflowManager()
    expect(await manager.toggleEnabled(source)).toBe(true)
    expect(workflowsStore.saveWorkflow).toHaveBeenCalledWith({
      id: 5,
      name: '故障诊断',
      description: '',
      mode: 'parallel',
      isEnabled: false,
      memberAgentIds: [7, 12],
    })
  })

  it('成员失效统计与筛选联动', () => {
    const workflowsStore = useWorkflowsStore()
    workflowsStore.state.items = [
      workflow([
        { agent_id: 7, agent_name: '设备诊断', sort_order: 0 },
        { agent_id: 12, agent_name: null, sort_order: 1 },
      ]),
    ]
    workflowsStore.state.total = 1
    useAgentsStore().state.items = [agent(7, '设备诊断')]

    const manager = useWorkflowManager()
    expect(manager.stats.value.broken).toBe(1)
    expect(manager.hasBrokenMember(workflowsStore.state.items[0]!)).toBe(true)
  })
})
