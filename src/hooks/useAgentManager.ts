import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { AgentResponse } from '@/interfaces/agent/api'
import type { AgentFormModel, AgentValidationIssue } from '@/interfaces/agent/model'
import { useAgentsStore } from '@/stores/agents'
import { useAuthStore } from '@/stores/auth'
import { useListUrlState } from './useListUrlState'

/** 启用状态筛选值（与 URL 里 enabled 字段共用）。 */
export type AgentEnabledFilter = 'all' | 'enabled' | 'disabled'

/** 卡片网格每页条数：3 列的整数倍。 */
export const AGENT_PAGE_SIZES = [12, 24, 48]

export function emptyAgentForm(): AgentFormModel {
  return {
    id: null,
    workspaceId: null,
    createdByUserId: null,
    name: '',
    description: '',
    systemPrompt: '',
    modelName: '',
    // 新建默认停用：「保存」按表单值保存为停用，「保存并启用」由 publish 强制启用。
    isEnabled: false,
    toolIds: [],
    skillIds: [],
    createdAt: '',
    updatedAt: '',
  }
}

export function agentResponseToForm(agent: AgentResponse): AgentFormModel {
  return {
    id: agent.id,
    workspaceId: agent.workspace_id,
    createdByUserId: agent.created_by_user_id,
    name: agent.name,
    description: agent.description ?? '',
    systemPrompt: agent.system_prompt,
    modelName: agent.model_name ?? '',
    isEnabled: agent.is_enabled,
    toolIds: [...(agent.tool_ids ?? [])],
    skillIds: [...(agent.skill_ids ?? [])],
    createdAt: agent.created_at,
    updatedAt: agent.updated_at,
  }
}

export function validateAgent(agent: AgentFormModel): AgentValidationIssue[] {
  const issues: AgentValidationIssue[] = []
  if (!agent.name.trim()) issues.push({ field: 'name', message: '请输入名称' })
  if (!agent.systemPrompt.trim()) issues.push({ field: 'systemPrompt', message: '请输入系统提示词' })
  return issues
}

/**
 * 列表页：加载、筛选、分页；筛选/分页状态写入 URL（useListUrlState）。
 * 列表走全量拉取 + 前端过滤分页（store 的 loadAgents），单项操作见 useAgentActions。
 */
export function useAgentManager() {
  const agentsStore = useAgentsStore()
  const authStore = useAuthStore()

  const { state, apply, reset, isDefault } = useListUrlState({
    defaults: {
      keyword: '',
      enabled: 'all' as AgentEnabledFilter,
      page: 1,
      pageSize: AGENT_PAGE_SIZES[0],
    },
    resetPageOn: ['keyword', 'enabled', 'pageSize'],
  })

  const loadError = ref('')
  let loadRequest = 0

  const agents = computed(() => agentsStore.state.items)
  const loading = computed(() => agentsStore.state.loading)
  const hasActiveFilter = computed(() => state.keyword.trim() !== '' || state.enabled !== 'all')

  /** 关键字匹配名称 / 描述 / 模型名，状态按 is_enabled。 */
  const filteredAgents = computed(() => {
    const query = state.keyword.trim().toLowerCase()
    return agents.value.filter((agent) => {
      const enabledMatches = state.enabled === 'all'
        || (state.enabled === 'enabled' ? agent.is_enabled : !agent.is_enabled)
      const keywordMatches = !query
        || [agent.name, agent.description, agent.model_name].some((value) => value?.toLowerCase().includes(query))
      return enabledMatches && keywordMatches
    })
  })

  /** 空态分型：有筛选条件 →「没有匹配的智能体」；否则 →「还没有智能体」。 */
  const emptyMode = computed<'filtered' | 'none'>(() => (hasActiveFilter.value ? 'filtered' : 'none'))

  const total = computed(() => filteredAgents.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, state.pageSize))))
  const clampedPage = computed(() => Math.min(Math.max(1, state.page), pageCount.value))
  const pagedItems = computed(() => {
    const start = (clampedPage.value - 1) * state.pageSize
    return filteredAgents.value.slice(start, start + state.pageSize)
  })

  async function load() {
    const request = ++loadRequest
    loadError.value = ''
    const error = await agentsStore.loadAgents()
    if (request === loadRequest) loadError.value = error ?? ''
  }

  // 首次进入与切换工作区都重拉。
  watch(
    () => authStore.currentWorkspaceId,
    (workspaceId) => {
      if (workspaceId) void load()
    },
    { immediate: true },
  )

  function resetFilters() {
    reset()
  }

  /**
   * 删除后当前页没有数据时退一页（URL 由 useListUrlState 同步）。
   * pagedItems 按 clampedPage 切片，显示上已经落在最后一页，这里把 URL 里的 page 也拉回来。
   */
  function stepBackIfPageEmpty() {
    if (state.page > pageCount.value) state.page = pageCount.value
  }

  onBeforeUnmount(() => {
    loadRequest += 1
  })

  return {
    state,
    apply,
    reset,
    isDefault,
    agents,
    loading,
    loadError,
    hasActiveFilter,
    emptyMode,
    filteredAgents,
    total,
    pageCount,
    clampedPage,
    pagedItems,
    load,
    resetFilters,
    stepBackIfPageEmpty,
  }
}
