import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  createAgent,
  deleteAgent,
  getAgentDetail,
  getAgentList,
  updateAgent,
  updateAgentMcpServers,
  updateAgentSkills,
  updateAgentTools,
} from '../http/agent'
import { getMcpServerList } from '../http/mcp'
import { ApiError } from '../http'
import type { AgentResponse } from '../interfaces/agent/api'
import { getSkillList } from '../http/skill'
import { getToolList } from '../http/tool'
import { useAgentsStore } from './agents'

vi.mock('../http/agent', () => ({
  createAgent: vi.fn(),
  deleteAgent: vi.fn(),
  getAgentDetail: vi.fn(),
  getAgentList: vi.fn(),
  updateAgent: vi.fn(),
  updateAgentMcpServers: vi.fn(),
  updateAgentSkills: vi.fn(),
  updateAgentTools: vi.fn(),
}))
vi.mock('../http/mcp', () => ({ getMcpServerList: vi.fn() }))
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
  bindable_profiles: ['user_agent'],
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
    vi.mocked(getMcpServerList).mockResolvedValue([])
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

  it('只修改名称时不重新提交已有绑定，保留停用工具也可保存', async () => {
    const saved = { ...agent, name: '新名称', tool_ids: [disabledTool.id] }
    vi.mocked(updateAgent).mockResolvedValue(saved)
    vi.mocked(getAgentDetail).mockResolvedValue(saved)
    const result = await useAgentsStore().saveAgent({
      id: agent.id,
      name: saved.name,
      description: agent.description,
      systemPrompt: agent.system_prompt,
      modelName: agent.model_name,
      isEnabled: true,
      toolIds: [disabledTool.id],
      skillIds: agent.skill_ids,
    })

    expect(result.error).toBeNull()
    expect(updateAgentTools).not.toHaveBeenCalled()
    expect(updateAgentSkills).not.toHaveBeenCalled()
    expect(getAgentDetail).toHaveBeenCalledWith(agent.id)
  })

  it('绑定按集合比较，顺序改变不会触发 PUT', async () => {
    const saved = { ...agent, tool_ids: [11, 12], skill_ids: [21, 22] }
    vi.mocked(updateAgent).mockResolvedValue(saved)
    vi.mocked(getAgentDetail).mockResolvedValue(saved)
    const result = await useAgentsStore().saveAgent({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.system_prompt,
      modelName: agent.model_name,
      isEnabled: true,
      toolIds: [12, 11],
      skillIds: [22, 21],
    })

    expect(result.error).toBeNull()
    expect(updateAgentTools).not.toHaveBeenCalled()
    expect(updateAgentSkills).not.toHaveBeenCalled()
  })

  it('只改 Skill 时只提交 Skill 绑定', async () => {
    vi.mocked(updateAgent).mockResolvedValue(agent)
    vi.mocked(updateAgentSkills).mockResolvedValue({ ...agent, skill_ids: [] })
    vi.mocked(getAgentDetail).mockResolvedValue({ ...agent, skill_ids: [] })
    const result = await useAgentsStore().saveAgent({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.system_prompt,
      modelName: agent.model_name,
      isEnabled: true,
      toolIds: agent.tool_ids,
      skillIds: [],
    })

    expect(result.error).toBeNull()
    expect(updateAgentTools).not.toHaveBeenCalled()
    expect(updateAgentSkills).toHaveBeenCalledWith(agent.id, { skill_ids: [] })
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

  it('详情只有 404 才算不存在，网络错误和 5xx 返回 error', async () => {
    const store = useAgentsStore()

    vi.mocked(getAgentDetail).mockRejectedValueOnce(new ApiError('agent 不存在', 'NOT_FOUND', 404))
    expect(await store.loadAgentDetail(agent.id)).toEqual({ status: 'not-found' })

    vi.mocked(getAgentDetail).mockRejectedValueOnce(new ApiError('内部错误', '', 500))
    expect(await store.loadAgentDetail(agent.id)).toEqual({ status: 'error', message: '内部错误' })

    vi.mocked(getAgentDetail).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await store.loadAgentDetail(agent.id)).toEqual({ status: 'error', message: '智能体加载失败' })
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
    let resolveUpdate!: (value: AgentResponse) => void
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

  it('setAgentEnabled 只发 PATCH is_enabled，乐观更新且请求中记入 togglingIds', async () => {
    let resolveUpdate!: (value: AgentResponse) => void
    vi.mocked(updateAgent).mockReturnValue(new Promise((resolve) => { resolveUpdate = resolve }))
    const store = useAgentsStore()
    await store.loadAgents()

    const toggling = store.setAgentEnabled(agent.id, false)
    expect(store.state.items[0]?.is_enabled).toBe(false)
    expect(store.state.togglingIds).toEqual([agent.id])
    // 请求中重复切换直接忽略。
    expect(await store.setAgentEnabled(agent.id, true)).toBeNull()

    resolveUpdate({ ...agent, is_enabled: false, tool_ids: undefined, skill_ids: undefined })
    expect(await toggling).toBeNull()

    expect(updateAgent).toHaveBeenCalledOnce()
    expect(updateAgent).toHaveBeenCalledWith(agent.id, { is_enabled: false })
    expect(updateAgentTools).not.toHaveBeenCalled()
    expect(updateAgentSkills).not.toHaveBeenCalled()
    expect(getAgentDetail).not.toHaveBeenCalled()
    expect(store.state.togglingIds).toEqual([])
    // 响应缺绑定字段时沿用本地值。
    expect(store.state.items[0]).toMatchObject({ is_enabled: false, tool_ids: [11], skill_ids: [21] })
  })

  it('setAgentEnabled 失败回滚并返回后端 message', async () => {
    vi.mocked(updateAgent).mockRejectedValue(new ApiError('无权限', 'FORBIDDEN', 403))
    const store = useAgentsStore()
    await store.loadAgents()

    expect(await store.setAgentEnabled(agent.id, false)).toBe('无权限')
    expect(store.state.items[0]?.is_enabled).toBe(true)
    expect(store.state.togglingIds).toEqual([])
  })

  describe('MCP 绑定', () => {
    const mcpServer = {
      id: 31,
      server_key: 'deepwiki',
      visibility: 'workspace' as const,
      name: 'DeepWiki',
      url: 'https://mcp.deepwiki.com/mcp',
      auth_type: 'none',
      approval_mode: 'always',
      tool_allowlist: [],
      tool_denylist: [],
      config_rev: 1,
      is_enabled: true,
      writable: true,
      tool_count: 3,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    }
    const baseInput = {
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.system_prompt,
      modelName: agent.model_name,
      isEnabled: true,
      toolIds: agent.tool_ids,
      skillIds: agent.skill_ids,
    }

    it('能力目录同时加载 MCP server，MCP 失败不影响技能和工具', async () => {
      const store = useAgentsStore()
      vi.mocked(getMcpServerList).mockResolvedValueOnce([mcpServer])
      expect(await store.loadCatalogs()).toBeNull()
      expect(store.state.mcpServers).toEqual([mcpServer])

      vi.mocked(getMcpServerList).mockRejectedValueOnce(new ApiError('MCP 功能未启用', 'FORBIDDEN', 403))
      expect(await store.loadCatalogs()).toBeNull()
      expect(store.state.mcpServers).toEqual([])
      expect(store.state.mcpCatalogError).toBe('MCP 功能未启用')
      expect(store.state.skills).toEqual([skill])
    })

    it('创建后单独提交 MCP 绑定，空白名单传 null', async () => {
      const bound = { ...agent, mcp_servers: [{ server_id: 31, tool_names: null }] }
      vi.mocked(createAgent).mockResolvedValue(agent)
      vi.mocked(updateAgentMcpServers).mockResolvedValue(bound)
      const result = await useAgentsStore().saveAgent({ ...baseInput, mcpServers: [{ server_id: 31, tool_names: null }] })

      expect(result).toEqual({ item: bound, error: null })
      expect(updateAgentMcpServers).toHaveBeenCalledWith(7, { servers: [{ server_id: 31, tool_names: null }] })
    })

    it('创建成功但 MCP 绑定失败时返回已创建的 Agent 和错误', async () => {
      vi.mocked(createAgent).mockResolvedValue(agent)
      vi.mocked(updateAgentMcpServers).mockRejectedValue(new ApiError('只能绑定已启用的共享 server', 'BAD_REQUEST', 400))
      const result = await useAgentsStore().saveAgent({ ...baseInput, mcpServers: [{ server_id: 31, tool_names: ['ask'] }] })

      expect(result.item).toEqual(agent)
      expect(result.error).toContain('只能绑定已启用的共享 server')
    })

    it('更新时绑定没变不提交，变了才全量替换', async () => {
      const current = { ...agent, mcp_servers: [{ server_id: 31, tool_names: ['b', 'a'] }] }
      vi.mocked(updateAgent).mockResolvedValue(current)
      vi.mocked(getAgentDetail).mockResolvedValue(current)
      const store = useAgentsStore()

      await store.saveAgent({ ...baseInput, id: 7, mcpServers: [{ server_id: 31, tool_names: ['a', 'b'] }] })
      expect(updateAgentMcpServers).not.toHaveBeenCalled()

      vi.mocked(updateAgentMcpServers).mockResolvedValue({ ...agent, mcp_servers: [] })
      await store.saveAgent({ ...baseInput, id: 7, mcpServers: [] })
      expect(updateAgentMcpServers).toHaveBeenCalledWith(7, { servers: [] })
    })
  })
})
