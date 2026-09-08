import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflowDetail,
  getWorkflowList,
  updateWorkflow,
} from '../http/workflow'
import type { WorkflowResponse } from '../interfaces/workflow/api'
import { useWorkflowsStore } from './workflows'

vi.mock('../http/workflow', () => ({
  createWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  getWorkflowDetail: vi.fn(),
  getWorkflowList: vi.fn(),
  updateWorkflow: vi.fn(),
}))

function workflow(id: number, name: string): WorkflowResponse {
  return {
    id,
    workspace_id: 3,
    name,
    description: `${name} 描述`,
    mode: 'sequential',
    is_enabled: true,
    created_by_user_id: 2,
    agents: [
      { agent_id: 7, agent_name: '设备诊断', sort_order: 0 },
    ],
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-02T00:00:00Z',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('workflows store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    setActivePinia(createPinia())
    vi.resetAllMocks()
    vi.mocked(getWorkflowList).mockResolvedValue({
      items: [workflow(1, '故障诊断')],
      total: 1,
      limit: 100,
      offset: 0,
    })
  })

  it('加载 Workflow 列表时拼接所有分页', async () => {
    vi.mocked(getWorkflowList).mockImplementation(async (params) => ({
      items: params?.offset === 0 ? [workflow(1, '故障诊断')] : [workflow(2, '质量分析')],
      total: 2,
      limit: 100,
      offset: params?.offset ?? 0,
    }))
    const store = useWorkflowsStore()

    expect(await store.loadWorkflows()).toBeNull()
    expect(store.state.items.map((item) => item.id)).toEqual([1, 2])
    expect(store.state.total).toBe(2)
  })

  it('加载失败返回错误串并清空列表', async () => {
    vi.mocked(getWorkflowList).mockRejectedValue(new Error('网络错误'))
    const store = useWorkflowsStore()

    const error = await store.loadWorkflows()

    expect(error).toContain('Workflow 列表加载失败')
    expect(store.state.items).toEqual([])
    expect(store.state.total).toBe(0)
  })

  it('创建时发送名称去空格、空描述转 null、成员按下标排序', async () => {
    vi.mocked(createWorkflow).mockResolvedValue(workflow(9, '故障诊断'))
    const store = useWorkflowsStore()

    const result = await store.saveWorkflow({
      name: '  故障诊断  ',
      description: '',
      mode: 'parallel',
      isEnabled: true,
      memberAgentIds: [7, 12],
    })

    expect(result.error).toBeNull()
    expect(createWorkflow).toHaveBeenCalledWith({
      name: '故障诊断',
      description: null,
      mode: 'parallel',
      is_enabled: true,
      agents: [
        { agent_id: 7, sort_order: 0 },
        { agent_id: 12, sort_order: 1 },
      ],
    })
    expect(store.state.items[0]?.id).toBe(9)
  })

  it('编辑时调用 updateWorkflow 并携带 id', async () => {
    vi.mocked(getWorkflowList).mockResolvedValue({
      items: [workflow(5, '旧名称')],
      total: 1,
      limit: 100,
      offset: 0,
    })
    vi.mocked(updateWorkflow).mockResolvedValue(workflow(5, '新名称'))
    const store = useWorkflowsStore()
    await store.loadWorkflows()

    const result = await store.saveWorkflow({
      id: 5,
      name: '新名称',
      description: '新描述',
      mode: 'sequential',
      isEnabled: false,
      memberAgentIds: [7],
    })

    expect(result.error).toBeNull()
    expect(updateWorkflow).toHaveBeenCalledWith(5, {
      name: '新名称',
      description: '新描述',
      mode: 'sequential',
      is_enabled: false,
      agents: [{ agent_id: 7, sort_order: 0 }],
    })
  })

  it('保存失败返回错误并重拉列表回滚', async () => {
    vi.mocked(createWorkflow).mockRejectedValue(new Error('名称已存在'))
    const store = useWorkflowsStore()

    const result = await store.saveWorkflow({
      name: '故障诊断',
      description: '',
      mode: 'sequential',
      isEnabled: true,
      memberAgentIds: [7],
    })

    expect(result.item).toBeNull()
    expect(result.error).toContain('Workflow 创建失败')
    expect(getWorkflowList).toHaveBeenCalledTimes(1)
    expect(store.state.items).toEqual([workflow(1, '故障诊断')])
  })

  it('删除成功后从列表移除并扣减总数', async () => {
    vi.mocked(deleteWorkflow).mockResolvedValue({ deleted: true })
    const store = useWorkflowsStore()
    await store.loadWorkflows()

    expect(await store.removeWorkflow(1)).toBeNull()
    expect(store.state.items).toEqual([])
    expect(store.state.total).toBe(0)
  })

  it('删除失败返回错误串且列表不变', async () => {
    vi.mocked(deleteWorkflow).mockRejectedValue(new Error('无权删除'))
    const store = useWorkflowsStore()
    await store.loadWorkflows()

    expect(await store.removeWorkflow(1)).toContain('Workflow 删除失败')
    expect(store.state.items).toEqual([workflow(1, '故障诊断')])
  })

  it('重置后忽略旧工作区尚未完成的列表响应', async () => {
    const pending = deferred<Awaited<ReturnType<typeof getWorkflowList>>>()
    vi.mocked(getWorkflowList).mockReturnValue(pending.promise)
    const store = useWorkflowsStore()
    const loading = store.loadWorkflows()

    store.resetWorkflows()
    pending.resolve({ items: [workflow(1, '故障诊断')], total: 1, limit: 100, offset: 0 })
    await loading

    expect(store.state.items).toEqual([])
  })

  it('详情加载成功后并入列表', async () => {
    vi.mocked(getWorkflowDetail).mockResolvedValue(workflow(1, '故障诊断'))
    const store = useWorkflowsStore()

    expect(await store.loadWorkflowDetail(1)).toEqual(workflow(1, '故障诊断'))
    expect(store.state.items[0]?.id).toBe(1)
  })
})
