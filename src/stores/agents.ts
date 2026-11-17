import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ApiError } from '@/http'
import {
  createAgent,
  deleteAgent,
  getAgentDetail,
  getAgentList,
  updateAgent,
  updateAgentMcpServers,
  updateAgentSkills,
  updateAgentTools,
} from '@/http/agent'
import { getMcpServerList } from '@/http/mcp'
import { getSkillList } from '@/http/skill'
import { getToolList } from '@/http/tool'
import type { AgentCreateRequest, AgentMcpBinding, AgentResponse } from '@/interfaces/agent/api'
import type { McpServerResponse } from '@/interfaces/mcp/api'
import type { SkillResponse } from '@/interfaces/skill/model'
import type { ToolResponse } from '@/interfaces/tool/model'
import { sameMcpBindings } from '@/utils/mcp'
import { useAuthStore } from './auth'

interface AgentsState {
  items: AgentResponse[]
  total: number
  tools: ToolResponse[]
  skills: SkillResponse[]
  /** 可见的 MCP server（表单里只列可绑定的，详情用它显示名称）。 */
  mcpServers: McpServerResponse[]
  /** MCP 目录单独加载：MCP 关闭或失败不影响技能 / 工具目录。 */
  mcpCatalogError: string
  loading: boolean
  catalogsLoading: boolean
  saving: boolean
  deleting: boolean
  /** 正在切换启停的 Agent id（列表卡片 / 详情开关据此禁用）。 */
  togglingIds: number[]
  /** E-2 服务端分页专用状态；默认不启用，列表仍走全量拉取 + 前端分页（prd A-6）。 */
  pageState: {
    items: AgentResponse[]
    total: number
  }
}

export interface SaveAgentInput {
  id?: number
  name: string
  description: string
  systemPrompt: string
  modelName: string
  isEnabled: boolean
  toolIds: number[]
  skillIds: number[]
  /** 不传表示不改 MCP 绑定。 */
  mcpServers?: AgentMcpBinding[]
}

export type AgentDetailResult =
  | { status: 'ok'; item: AgentResponse }
  | { status: 'not-found' }
  | { status: 'error'; message: string }

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

function sameBindingIds(current: number[] | undefined, next: number[]): boolean {
  const currentIds = new Set(current ?? [])
  const nextIds = new Set(next)
  return currentIds.size === nextIds.size && [...nextIds].every((id) => currentIds.has(id))
}

async function getAllAgentPages() {
  const items: AgentResponse[] = []
  let total: number
  do {
    const response = await getAgentList({ limit: 100, offset: items.length })
    items.push(...response.items)
    total = response.total
    if (!response.items.length) break
  } while (items.length < total)
  return { items, total }
}

async function getAllToolPages(isEnabled: boolean) {
  const items: ToolResponse[] = []
  let total: number
  do {
    const response = await getToolList({ is_enabled: isEnabled, limit: 100, offset: items.length })
    items.push(...response.items)
    total = response.total
    if (!response.items.length) break
  } while (items.length < total)
  return items
}

export const useAgentsStore = defineStore('agents', () => {
  const authStore = useAuthStore()
  let dataGeneration = 0
  let agentListGeneration = 0
  let catalogGeneration = 0
  const state = reactive<AgentsState>({
    items: [],
    total: 0,
    tools: [],
    skills: [],
    mcpServers: [],
    mcpCatalogError: '',
    loading: false,
    catalogsLoading: false,
    saving: false,
    deleting: false,
    togglingIds: [],
    pageState: {
      items: [],
      total: 0,
    },
  })

  function contextChanged(generation: number, workspaceId: number | null) {
    return generation !== dataGeneration || workspaceId !== authStore.currentWorkspaceId
  }

  function invalidateAgentListRequests() {
    agentListGeneration += 1
    state.loading = false
  }

  function upsertAgent(agent: AgentResponse) {
    invalidateAgentListRequests()
    const index = state.items.findIndex((item) => item.id === agent.id)
    if (index >= 0) state.items[index] = agent
    else state.items.unshift(agent)
    state.total = Math.max(state.total, state.items.length)
  }

  function resetAgents() {
    dataGeneration += 1
    agentListGeneration += 1
    catalogGeneration += 1
    state.items = []
    state.total = 0
    state.tools = []
    state.skills = []
    state.mcpServers = []
    state.mcpCatalogError = ''
    state.loading = false
    state.catalogsLoading = false
    state.saving = false
    state.deleting = false
    state.togglingIds = []
    state.pageState.items = []
    state.pageState.total = 0
  }

  async function loadAgents(): Promise<string | null> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    const listGeneration = ++agentListGeneration
    state.loading = true
    try {
      const response = await getAllAgentPages()
      if (contextChanged(generation, workspaceId) || listGeneration !== agentListGeneration) return null
      state.items = response.items
      state.total = response.total
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId) || listGeneration !== agentListGeneration) return null
      state.items = []
      state.total = 0
      return errorMessage(error, 'Agent 列表加载失败')
    } finally {
      if (!contextChanged(generation, workspaceId) && listGeneration === agentListGeneration) {
        state.loading = false
      }
    }
  }

  async function loadCatalogs(): Promise<string | null> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    const requestGeneration = ++catalogGeneration
    state.catalogsLoading = true
    const mcpRequest = getMcpServerList()
      .then((servers) => ({ servers, error: '' }))
      .catch((error: unknown) => ({ servers: [] as McpServerResponse[], error: errorMessage(error, 'MCP server 目录加载失败') }))
    try {
      const [enabledTools, disabledTools, skills, mcp] = await Promise.all([
        getAllToolPages(true),
        getAllToolPages(false),
        getSkillList(),
        mcpRequest,
      ])
      if (contextChanged(generation, workspaceId) || requestGeneration !== catalogGeneration) return null
      state.tools = [...enabledTools, ...disabledTools]
      state.skills = skills
      state.mcpServers = mcp.servers
      state.mcpCatalogError = mcp.error
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId) || requestGeneration !== catalogGeneration) return null
      state.tools = []
      state.skills = []
      state.mcpServers = []
      return errorMessage(error, 'Agent 能力目录加载失败')
    } finally {
      if (!contextChanged(generation, workspaceId) && requestGeneration === catalogGeneration) {
        state.catalogsLoading = false
      }
    }
  }

  async function loadAll(): Promise<string | null> {
    const [agentsError, catalogsError] = await Promise.all([loadAgents(), loadCatalogs()])
    return agentsError ?? catalogsError
  }

  /**
   * 拉单个 Agent 详情。只有后端明确返回 404 才算「不存在」；网络错误、5xx 等返回 error，
   * 由页面显示错误并允许重试。返回 undefined 表示请求期间切换了工作区，结果作废。
   */
  async function loadAgentDetail(agentId: number): Promise<AgentDetailResult | undefined> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    try {
      const detail = await getAgentDetail(agentId)
      if (contextChanged(generation, workspaceId)) return undefined
      upsertAgent(detail)
      return { status: 'ok', item: detail }
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return undefined
      if (error instanceof ApiError && error.status === 404) return { status: 'not-found' }
      return { status: 'error', message: errorMessage(error, '智能体加载失败') }
    }
  }

  /**
   * E-2 服务端分页（可选，默认不启用）：与 groups.loadPage 同款样板，单接口拉一页写入
   * pageState，generation 计数丢弃旧响应。默认不启用——prd A-6 本阶段保留全量拉取 +
   * 前端分页（chat 工作台依赖全量 items），当单资源超过 500 条时再切换。
   */
  async function loadPage(params: {
    limit?: number
    offset?: number
    keyword?: string | null
    is_enabled?: boolean | null
  } = {}): Promise<string | null> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    const listGeneration = ++agentListGeneration
    state.loading = true
    try {
      const response = await getAgentList({
        keyword: params.keyword ?? undefined,
        is_enabled: params.is_enabled ?? undefined,
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
      })
      if (contextChanged(generation, workspaceId) || listGeneration !== agentListGeneration) return null
      state.pageState.items = response.items
      state.pageState.total = response.total
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId) || listGeneration !== agentListGeneration) return null
      state.pageState.items = []
      state.pageState.total = 0
      return errorMessage(error, 'Agent 列表加载失败')
    } finally {
      if (!contextChanged(generation, workspaceId) && listGeneration === agentListGeneration) {
        state.loading = false
      }
    }
  }

  async function saveAgent(input: SaveAgentInput): Promise<{ item: AgentResponse | null; error: string | null }> {
    if (state.saving) return { item: null, error: 'Agent 正在保存，请稍候' }
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    invalidateAgentListRequests()
    state.saving = true
    const payload: AgentCreateRequest = {
      name: input.name,
      description: input.description || null,
      system_prompt: input.systemPrompt,
      model_name: input.modelName || null,
      is_enabled: input.isEnabled,
      tool_ids: input.toolIds,
      skill_ids: input.skillIds,
    }

    try {
      let saved: AgentResponse
      if (input.id == null) {
        saved = await createAgent(payload)
        // 创建接口不接收 MCP 绑定，建好后再单独绑定。
        const mcpServers = input.mcpServers ?? []
        if (mcpServers.length) {
          if (contextChanged(generation, workspaceId)) return { item: null, error: null }
          try {
            saved = await updateAgentMcpServers(saved.id, { servers: mcpServers })
          } catch (error) {
            if (contextChanged(generation, workspaceId)) return { item: null, error: null }
            upsertAgent(saved)
            return {
              item: saved,
              error: `Agent 已创建，但 MCP 绑定失败（${errorMessage(error, '更新失败')}）。请检查后重新保存。`,
            }
          }
        }
      } else {
        saved = await updateAgent(input.id, {
          name: payload.name,
          description: payload.description,
          system_prompt: payload.system_prompt,
          model_name: payload.model_name,
          is_enabled: payload.is_enabled,
        })
        if (contextChanged(generation, workspaceId)) return { item: null, error: null }
        const [toolsResult, skillsResult, mcpResult] = await Promise.allSettled([
          sameBindingIds(saved.tool_ids, input.toolIds)
            ? Promise.resolve(saved)
            : updateAgentTools(input.id, { tool_ids: input.toolIds }),
          sameBindingIds(saved.skill_ids, input.skillIds)
            ? Promise.resolve(saved)
            : updateAgentSkills(input.id, { skill_ids: input.skillIds }),
          input.mcpServers === undefined || sameMcpBindings(saved.mcp_servers, input.mcpServers)
            ? Promise.resolve(saved)
            : updateAgentMcpServers(input.id, { servers: input.mcpServers }),
        ])
        if (contextChanged(generation, workspaceId)) return { item: null, error: null }

        const bindingErrors: string[] = []
        if (toolsResult.status === 'rejected') {
          bindingErrors.push(`Tool 绑定：${errorMessage(toolsResult.reason, '更新失败')}`)
        }
        if (skillsResult.status === 'rejected') {
          bindingErrors.push(`Skill 绑定：${errorMessage(skillsResult.reason, '更新失败')}`)
        }
        if (mcpResult.status === 'rejected') {
          bindingErrors.push(`MCP 绑定：${errorMessage(mcpResult.reason, '更新失败')}`)
        }
        if (bindingErrors.length) {
          let current: AgentResponse | null = null
          try {
            current = await getAgentDetail(input.id)
          } catch {
            await loadAgents()
          }
          if (contextChanged(generation, workspaceId)) return { item: null, error: null }
          if (current) upsertAgent(current)
          return {
            item: current,
            error: current
              ? `Agent 基础信息已保存，但部分能力绑定失败（${bindingErrors.join('；')}）。当前配置已重新读取，请检查后重试。`
              : `Agent 基础信息已保存，但部分能力绑定失败（${bindingErrors.join('；')}），且详情回读失败。请刷新后确认当前配置。`,
          }
        }
        try {
          saved = await getAgentDetail(input.id)
        } catch (error) {
          await loadAgents()
          if (contextChanged(generation, workspaceId)) return { item: null, error: null }
          return {
            item: null,
            error: `Agent 已保存，但读取最新详情失败：${errorMessage(error, '读取失败')}。请刷新后确认当前配置。`,
          }
        }
      }

      if (contextChanged(generation, workspaceId)) return { item: null, error: null }
      upsertAgent(saved)
      return { item: saved, error: null }
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return { item: null, error: null }
      await loadAgents()
      if (contextChanged(generation, workspaceId)) return { item: null, error: null }
      return { item: null, error: errorMessage(error, input.id ? 'Agent 更新失败' : 'Agent 创建失败') }
    } finally {
      if (!contextChanged(generation, workspaceId)) state.saving = false
    }
  }

  function patchEnabledLocally(agentId: number, enabled: boolean) {
    const index = state.items.findIndex((item) => item.id === agentId)
    if (index >= 0) state.items[index] = { ...state.items[index], is_enabled: enabled }
  }

  /**
   * 启用 / 停用：只发 PATCH /agents/{id} { is_enabled }，不动能力绑定、不回读详情。
   * 先改界面，失败回滚并返回错误信息；请求中的 id 记在 togglingIds。
   */
  async function setAgentEnabled(agentId: number, enabled: boolean): Promise<string | null> {
    if (state.togglingIds.includes(agentId)) return null
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    const previous = state.items.find((item) => item.id === agentId)?.is_enabled ?? !enabled
    state.togglingIds = [...state.togglingIds, agentId]
    patchEnabledLocally(agentId, enabled)
    try {
      const updated = await updateAgent(agentId, { is_enabled: enabled })
      if (contextChanged(generation, workspaceId)) return null
      const current = state.items.find((item) => item.id === agentId)
      // PATCH 响应可能不带绑定字段，缺失时沿用本地值。
      upsertAgent({
        ...current,
        ...updated,
        tool_ids: updated.tool_ids ?? current?.tool_ids,
        skill_ids: updated.skill_ids ?? current?.skill_ids,
        mcp_servers: updated.mcp_servers ?? current?.mcp_servers,
      })
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return null
      patchEnabledLocally(agentId, previous)
      return errorMessage(error, enabled ? '启用失败' : '停用失败')
    } finally {
      if (!contextChanged(generation, workspaceId)) {
        state.togglingIds = state.togglingIds.filter((id) => id !== agentId)
      }
    }
  }

  async function removeAgent(agentId: number): Promise<string | null | undefined> {
    if (state.deleting) return 'Agent 正在删除，请稍候'
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    invalidateAgentListRequests()
    state.deleting = true
    try {
      await deleteAgent(agentId)
      if (contextChanged(generation, workspaceId)) return undefined
      invalidateAgentListRequests()
      state.items = state.items.filter((item) => item.id !== agentId)
      state.total = Math.max(0, state.total - 1)
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return undefined
      return errorMessage(error, 'Agent 删除失败')
    } finally {
      if (!contextChanged(generation, workspaceId)) state.deleting = false
    }
  }

  return {
    state,
    resetAgents,
    loadAgents,
    loadPage,
    loadCatalogs,
    loadAll,
    loadAgentDetail,
    saveAgent,
    setAgentEnabled,
    removeAgent,
  }
})
