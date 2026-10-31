import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  createAgent,
  deleteAgent,
  getAgentDetail,
  getAgentList,
  updateAgent,
  updateAgentSkills,
  updateAgentTools,
} from '../http/agent'
import { getSkillList } from '../http/skill'
import { getToolList } from '../http/tool'
import { useAgentsStore } from './agents'

vi.mock('../http/agent', () => ({
  createAgent: vi.fn(),
  deleteAgent: vi.fn(),
  getAgentDetail: vi.fn(),
  getAgentList: vi.fn(),
  updateAgent: vi.fn(),
  updateAgentSkills: vi.fn(),
  updateAgentTools: vi.fn(),
}))
vi.mock('../http/skill', () => ({ getSkillList: vi.fn() }))
vi.mock('../http/tool', () => ({ getToolList: vi.fn() }))

const agent = {
  id: 7,
  workspace_id: 3,
  name: '设备诊断',
  description: '检查设备异常',
  system_prompt: '依据证据诊断设备异常。',
  model_name: 'factory-model',
  is_enabled: true,
  created_by_user_id: 2,
  tool_ids: [11],
  skill_ids: [21],
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
}
const enabledTool = {
  id: 11,
  tool_key: 'asset.read',
  name: '读取设备',
  description: '读取设备信息',
  tool_type: 'builtin',
  runtime_name: 'asset_read',
  is_system: true,
  is_enabled: true,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
}
const disabledTool = { ...enabledTool, id: 12, tool_key: 'asset.write', is_enabled: false }
const skill = {
  id: 21,
  workspace_id: 3,
  name: 'equipment-check',
  description: '设备检查',
  version: null,
  scope: 'workspace',
  is_enabled: true,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
}

describe('agents store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    setActivePinia(createPinia())
    vi.resetAllMocks()
    vi.mocked(getAgentList).mockResolvedValue({ items: [agent], total: 1, limit: 100, offset: 0 })
    vi.mocked(getToolList).mockImplementation(async (params) => ({
      items: params?.is_enabled === false ? [disabledTool] : [enabledTool],
      total: 1,
      limit: 100,
      offset: 0,
    }))
    vi.mocked(getSkillList).mockResolvedValue([skill])
  })

  it('加载 Agent 及启用和停用工具目录', async () => {
    const store = useAgentsStore()
    expect(await store.loadAll()).toBeNull()
    expect(store.state.items).toEqual([agent])
    expect(store.state.tools.map((item) => item.id)).toEqual([11, 12])
    expect(store.state.skills).toEqual([skill])
  })

  it('更新 Agent 后全量替换工具与 Skill 并重新读取详情', async () => {
    vi.mocked(updateAgent).mockResolvedValue(agent)
    vi.mocked(updateAgentTools).mockResolvedValue(agent)
    vi.mocked(updateAgentSkills).mockResolvedValue(agent)
    vi.mocked(getAgentDetail).mockResolvedValue({ ...agent, tool_ids: [], skill_ids: [] })
    const store = useAgentsStore()

    const result = await store.saveAgent({
      id: 7,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.system_prompt,
      modelName: agent.model_name,
      isEnabled: true,
      toolIds: [],
      skillIds: [],
    })

    expect(result.error).toBeNull()
    expect(updateAgentTools).toHaveBeenCalledWith(7, { tool_ids: [] })
    expect(updateAgentSkills).toHaveBeenCalledWith(7, { skill_ids: [] })
    expect(getAgentDetail).toHaveBeenCalledWith(7)
    expect(result.item).toMatchObject({ tool_ids: [], skill_ids: [] })
  })

  it('能力绑定部分失败时等待两项完成并返回重新读取的当前配置', async () => {
    vi.mocked(updateAgent).mockResolvedValue(agent)
    vi.mocked(updateAgentTools).mockRejectedValue(new Error('tool failed'))
    vi.mocked(updateAgentSkills).mockResolvedValue({ ...agent, skill_ids: [] })
    vi.mocked(getAgentDetail).mockResolvedValue({ ...agent, skill_ids: [] })
    const store = useAgentsStore()

    const result = await store.saveAgent({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.system_prompt,
      modelName: agent.model_name,
      isEnabled: true,
      toolIds: [],
      skillIds: [],
    })

    expect(updateAgentTools).toHaveBeenCalledOnce()
    expect(updateAgentSkills).toHaveBeenCalledOnce()
    expect(getAgentDetail).toHaveBeenCalledWith(agent.id)
    expect(result.item).toMatchObject({ skill_ids: [] })
    expect(result.error).toContain('部分能力绑定失败')
    expect(result.error).toContain('Tool 绑定')
  })

  it('配置已写入但详情回读失败时给出准确提示', async () => {
    vi.mocked(updateAgent).mockResolvedValue(agent)
    vi.mocked(updateAgentTools).mockResolvedValue(agent)
    vi.mocked(updateAgentSkills).mockResolvedValue(agent)
    vi.mocked(getAgentDetail).mockRejectedValue(new Error('detail failed'))
    const store = useAgentsStore()

    const result = await store.saveAgent({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.system_prompt,
      modelName: agent.model_name,
      isEnabled: true,
      toolIds: agent.tool_ids,
      skillIds: agent.skill_ids,
    })

    expect(result.item).toBeNull()
    expect(result.error).toContain('Agent 已保存，但读取最新详情失败')
    expect(getAgentList).toHaveBeenCalled()
  })

  it('重置后忽略旧工作区尚未完成的列表响应', async () => {
    let resolveList!: (value: Awaited<ReturnType<typeof getAgentList>>) => void
    vi.mocked(getAgentList).mockReturnValue(new Promise((resolve) => { resolveList = resolve }))
    const store = useAgentsStore()
    const loading = store.loadAgents()

    store.resetAgents()
    resolveList({ items: [agent], total: 1, limit: 100, offset: 0 })
    await loading

    expect(store.state.items).toEqual([])
  })

  it('重置后忽略旧工作区列表请求的错误', async () => {
    let rejectList!: (reason: Error) => void
    vi.mocked(getAgentList).mockReturnValue(new Promise((_resolve, reject) => { rejectList = reject }))
    const store = useAgentsStore()
    const loading = store.loadAgents()

    store.resetAgents()
    rejectList(new Error('旧工作区请求失败'))

    expect(await loading).toBeNull()
    expect(store.state.items).toEqual([])
  })

  it('旧列表响应不会覆盖创建结果', async () => {
    let resolveList!: (value: Awaited<ReturnType<typeof getAgentList>>) => void
    vi.mocked(getAgentList).mockReturnValue(new Promise((resolve) => { resolveList = resolve }))
    vi.mocked(createAgent).mockResolvedValue(agent)
    const store = useAgentsStore()
    const loading = store.loadAgents()

    const result = await store.saveAgent({
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.system_prompt,
      modelName: agent.model_name,
      isEnabled: true,
      toolIds: agent.tool_ids,
      skillIds: agent.skill_ids,
    })
    resolveList({ items: [], total: 0, limit: 100, offset: 0 })
    await loading

    expect(result.item).toEqual(agent)
    expect(store.state.items).toEqual([agent])
  })

  it('重置后忽略旧工作区尚未完成的详情响应', async () => {
    let resolveDetail!: (value: typeof agent) => void
    vi.mocked(getAgentDetail).mockReturnValue(new Promise((resolve) => { resolveDetail = resolve }))
    const store = useAgentsStore()
    const loading = store.loadAgentDetail(agent.id)

    store.resetAgents()
    resolveDetail(agent)

    expect(await loading).toBeUndefined()
    expect(store.state.items).toEqual([])
  })

  it('更新基础信息期间重置后不再提交能力绑定', async () => {
    let resolveUpdate!: (value: typeof agent) => void
    vi.mocked(updateAgent).mockReturnValue(new Promise((resolve) => { resolveUpdate = resolve }))
    const store = useAgentsStore()
    const saving = store.saveAgent({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.system_prompt,
      modelName: agent.model_name,
      isEnabled: true,
      toolIds: [enabledTool.id],
      skillIds: [skill.id],
    })

    store.resetAgents()
    resolveUpdate(agent)

    expect(await saving).toEqual({ item: null, error: null })
    expect(updateAgentTools).not.toHaveBeenCalled()
    expect(updateAgentSkills).not.toHaveBeenCalled()
    expect(getAgentDetail).not.toHaveBeenCalled()
  })

  it('保存失败后的列表回读期间切换工作区不会返回旧错误', async () => {
    let resolveList!: (value: Awaited<ReturnType<typeof getAgentList>>) => void
    vi.mocked(updateAgent).mockRejectedValue(new Error('旧工作区保存失败'))
    vi.mocked(getAgentList).mockReturnValue(new Promise((resolve) => { resolveList = resolve }))
    const store = useAgentsStore()
    const saving = store.saveAgent({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.system_prompt,
      modelName: agent.model_name,
      isEnabled: true,
      toolIds: agent.tool_ids,
      skillIds: agent.skill_ids,
    })

    await vi.waitFor(() => expect(getAgentList).toHaveBeenCalled())
    store.resetAgents()
    resolveList({ items: [agent], total: 1, limit: 100, offset: 0 })

    expect(await saving).toEqual({ item: null, error: null })
  })

  it('删除成功后同步移除本地记录', async () => {
    vi.mocked(deleteAgent).mockResolvedValue({ deleted: true })
    const store = useAgentsStore()
    await store.loadAgents()

    expect(await store.removeAgent(7)).toBeNull()
    expect(store.state.items).toEqual([])
  })

  it('重置后忽略旧工作区尚未完成的删除响应', async () => {
    let resolveDelete!: (value: { deleted: boolean }) => void
    vi.mocked(deleteAgent).mockReturnValue(new Promise((resolve) => { resolveDelete = resolve }))
    const store = useAgentsStore()
    await store.loadAgents()
    const deleting = store.removeAgent(agent.id)

    store.resetAgents()
    resolveDelete({ deleted: true })

    expect(await deleting).toBeUndefined()
    expect(store.state.items).toEqual([])
  })

  it('删除进行中不会重复提交请求', async () => {
    let resolveDelete!: (value: { deleted: boolean }) => void
    vi.mocked(deleteAgent).mockReturnValue(new Promise((resolve) => { resolveDelete = resolve }))
    const store = useAgentsStore()
    await store.loadAgents()

    const deleting = store.removeAgent(agent.id)
    expect(await store.removeAgent(agent.id)).toBe('Agent 正在删除，请稍候')
    expect(deleteAgent).toHaveBeenCalledOnce()

    resolveDelete({ deleted: true })
    expect(await deleting).toBeNull()
    expect(store.state.deleting).toBe(false)
  })

  it('创建时仅发送接口支持字段', async () => {
    vi.mocked(createAgent).mockResolvedValue(agent)
    const store = useAgentsStore()
    await store.saveAgent({
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.system_prompt,
      modelName: agent.model_name,
      isEnabled: true,
      toolIds: [11],
      skillIds: [21],
    })

    expect(createAgent).toHaveBeenCalledWith({
      name: agent.name,
      description: agent.description,
      system_prompt: agent.system_prompt,
      model_name: agent.model_name,
      is_enabled: true,
      tool_ids: [11],
      skill_ids: [21],
    })
  })
})
