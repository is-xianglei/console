import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ApiError } from '@/http'
import {
  createAgent,
  deleteAgent,
  getAgentDetail,
  getAgentList,
  updateAgent,
  updateAgentSkills,
  updateAgentTools,
} from '@/http/agent'
import { getSkillList } from '@/http/skill'
import { getToolList } from '@/http/tool'
import type { AgentCreateRequest, AgentResponse } from '@/interfaces/agent/api'
import type { SkillResponse } from '@/interfaces/skill/model'
import type { ToolResponse } from '@/interfaces/tool/model'
import { useAuthStore } from './auth'

interface AgentsState {
  items: AgentResponse[]
  total: number
  tools: ToolResponse[]
  skills: SkillResponse[]
  loading: boolean
  catalogsLoading: boolean
  saving: boolean
  deleting: boolean
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
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
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
    loading: false,
    catalogsLoading: false,
    saving: false,
    deleting: false,
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
    state.loading = false
    state.catalogsLoading = false
    state.saving = false
    state.deleting = false
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
    try {
      const [enabledTools, disabledTools, skills] = await Promise.all([
        getAllToolPages(true),
        getAllToolPages(false),
        getSkillList(),
      ])
      if (contextChanged(generation, workspaceId) || requestGeneration !== catalogGeneration) return null
      state.tools = [...enabledTools, ...disabledTools]
      state.skills = skills
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId) || requestGeneration !== catalogGeneration) return null
      state.tools = []
      state.skills = []
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

  async function loadAgentDetail(agentId: number): Promise<AgentResponse | null | undefined> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    try {
      const detail = await getAgentDetail(agentId)
      if (contextChanged(generation, workspaceId)) return undefined
      upsertAgent(detail)
      return detail
    } catch {
      if (contextChanged(generation, workspaceId)) return undefined
      return null
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
      } else {
        saved = await updateAgent(input.id, {
          name: payload.name,
          description: payload.description,
          system_prompt: payload.system_prompt,
          model_name: payload.model_name,
          is_enabled: payload.is_enabled,
        })
        if (contextChanged(generation, workspaceId)) return { item: null, error: null }
        const [toolsResult, skillsResult] = await Promise.allSettled([
          updateAgentTools(input.id, { tool_ids: input.toolIds }),
          updateAgentSkills(input.id, { skill_ids: input.skillIds }),
        ])
        if (contextChanged(generation, workspaceId)) return { item: null, error: null }

        const bindingErrors: string[] = []
        if (toolsResult.status === 'rejected') {
          bindingErrors.push(`Tool 绑定：${errorMessage(toolsResult.reason, '更新失败')}`)
        }
        if (skillsResult.status === 'rejected') {
          bindingErrors.push(`Skill 绑定：${errorMessage(skillsResult.reason, '更新失败')}`)
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
    removeAgent,
  }
})
