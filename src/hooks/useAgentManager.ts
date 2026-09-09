import { computed, onBeforeUnmount, ref } from 'vue'
import type { AgentResponse } from '@/interfaces/agent/api'
import type { AgentFormModel, AgentValidationIssue } from '@/interfaces/agent/model'
import { useAgentsStore } from '@/stores/agents'
import { inDateRange, useListUrlState } from './useListUrlState'

/** 启用状态筛选值（与 URL 里 enabled 字段共用）。 */
export type AgentEnabledFilter = 'all' | 'enabled' | 'disabled'

const DEFAULT_PAGE_SIZE = 20

export function emptyAgentForm(): AgentFormModel {
  return {
    id: null,
    workspaceId: null,
    createdByUserId: null,
    name: '',
    description: '',
    systemPrompt: '',
    modelName: '',
    isEnabled: true,
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
  if (!agent.name.trim()) issues.push({ section: 'identity', message: '名称不能为空。' })
  if (!agent.systemPrompt.trim()) issues.push({ section: 'prompt', message: '系统提示词不能为空。' })
  return issues
}

/** 列表页：加载、筛选、删除；不含编辑/保存(见 useAgentEditor)。 */
export function useAgentManager() {
  const agentsStore = useAgentsStore()

  // 筛选/分页状态写入 route.query（useListUrlState）；state 为真源。
  const { state, apply, reset, isDefault } = useListUrlState({
    defaults: {
      keyword: '',
      enabled: 'all' as AgentEnabledFilter,
      model: 'all' as string,
      dateRange: [] as string[],
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    },
    resetPageOn: ['keyword', 'enabled', 'model', 'dateRange', 'pageSize'],
  })

  // 兼容模板既有绑定名（v-model="search" / enabledFilter），实际读写 state。
  const search = computed({
    get: () => state.keyword,
    set: (v) => { state.keyword = v },
  })
  const enabledFilter = computed({
    get: () => state.enabled,
    set: (v) => { state.enabled = v as AgentEnabledFilter },
  })
  const modelFilter = computed({
    get: () => state.model,
    set: (v) => { state.model = v },
  })
  const page = computed({ get: () => state.page, set: (v) => { state.page = v } })
  const pageSize = computed({ get: () => state.pageSize, set: (v) => { state.pageSize = v } })

  const selectedId = ref<number | null>(null)
  /** 多选：勾选行的 id 集合（供批量操作；点击表头全选当前页）。 */
  const selectedIds = ref<string[]>([])
  const pendingDelete = ref<AgentResponse | null>(null)
  /** 批量启用/停用/删除处理中。 */
  const batchBusy = ref(false)
  /** 单行按钮式启停处理中（防并发；与批量 toggle 互不干扰）。 */
  const togglingId = ref<number | null>(null)
  const loadingError = ref('')
  const toast = ref('')
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let loadRequest = 0

  const agents = computed(() => agentsStore.state.items)
  const tools = computed(() => agentsStore.state.tools)
  const skills = computed(() => agentsStore.state.skills)
  const loading = computed(() => agentsStore.state.loading || agentsStore.state.catalogsLoading)
  const saving = computed(() => agentsStore.state.saving)
  const deleting = computed(() => agentsStore.state.deleting)
  const filteredAgents = computed(() => {
    const query = state.keyword.trim().toLowerCase()
    const [start, end] = state.dateRange
    return agents.value.filter((agent) => {
      const enabledMatches = state.enabled === 'all'
        || (state.enabled === 'enabled' ? agent.is_enabled : !agent.is_enabled)
      const modelMatches = state.model === 'all' || (agent.model_name ?? '') === state.model
      const dateMatches = !start || !end || inDateRange(agent.created_at, start, end)
      const searchText = [
        agent.id,
        agent.name,
        agent.description,
        agent.model_name,
      ].join(' ').toLowerCase()
      return enabledMatches && modelMatches && dateMatches && (!query || searchText.includes(query))
    })
  })
  const selectedAgent = computed(() => agents.value.find((agent) => agent.id === selectedId.value) ?? null)

  const total = computed(() => filteredAgents.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, state.pageSize))))
  const clampedPage = computed(() => Math.min(Math.max(1, state.page), pageCount.value))
  /** 当前页切片（供 ResourceTable.data）。 */
  const pagedItems = computed(() => {
    const start = (clampedPage.value - 1) * state.pageSize
    return filteredAgents.value.slice(start, start + state.pageSize)
  })
  /** 选中项对应的 Agent 行（供批量操作）。 */
  const selectedAgents = computed(() => {
    const set = new Set(selectedIds.value)
    return filteredAgents.value.filter((item) => set.has(String(item.id)))
  })
  const selectedCount = computed(() => selectedAgents.value.length)

  const stats = computed(() => ({
    all: agentsStore.state.total,
    enabled: agents.value.filter((agent) => agent.is_enabled).length,
    disabled: agents.value.filter((agent) => !agent.is_enabled).length,
    unbound: agents.value.filter((agent) => !(agent.tool_ids?.length || agent.skill_ids?.length)).length,
  }))

  function showToast(message: string) {
    toast.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, 2600)
  }

  async function loadAll() {
    const request = ++loadRequest
    const error = await agentsStore.loadAll()
    if (request === loadRequest) loadingError.value = error ?? ''
  }

  function resetView() {
    loadRequest += 1
    reset()
    selectedId.value = null
    selectedIds.value = []
    pendingDelete.value = null
    batchBusy.value = false
    togglingId.value = null
    loadingError.value = ''
    toast.value = ''
    if (toastTimer) clearTimeout(toastTimer)
  }

  /** 批量启停 agents：复用 saveAgent（memberId 无关，直接翻转 is_enabled）。 */
  async function runBatchToggle(targetEnable: boolean): Promise<void> {
    if (batchBusy.value || !selectedAgents.value.length) return
    const targets = [...selectedAgents.value]
    batchBusy.value = true
    const failed: string[] = []
    let ok = 0
    try {
      for (const item of targets) {
        if (item.is_enabled === targetEnable) { ok += 1; continue }
        const result = await agentsStore.saveAgent({
          id: item.id,
          name: item.name,
          description: item.description ?? '',
          systemPrompt: item.system_prompt,
          modelName: item.model_name ?? '',
          isEnabled: targetEnable,
          toolIds: item.tool_ids ?? [],
          skillIds: item.skill_ids ?? [],
        })
        if (result.error) failed.push(String(item.id))
        else ok += 1
      }
      if (failed.length) selectedIds.value = failed
      else selectedIds.value = []
      loadingError.value = ''
      const base = targetEnable ? `已启用 ${ok} 个 Agent` : `已停用 ${ok} 个 Agent`
      if (failed.length) showToast(`${base}，失败 ${failed.length} 个（已保留选中可重试）`)
      else showToast(base)
    } finally {
      batchBusy.value = false
    }
  }

  function batchEnable() {
    return runBatchToggle(true)
  }

  function batchDisable() {
    return runBatchToggle(false)
  }

  /** 单行按钮式启停：只翻转 is_enabled，其余字段与 skill/tool 绑定原样回传（saveAgent 签名不变）。 */
  async function toggleEnabled(agent: AgentResponse) {
    if (togglingId.value != null || batchBusy.value) return false
    const enabled = !agent.is_enabled
    togglingId.value = agent.id
    try {
      const result = await agentsStore.saveAgent({
        id: agent.id,
        name: agent.name,
        description: agent.description ?? '',
        systemPrompt: agent.system_prompt,
        modelName: agent.model_name ?? '',
        isEnabled: enabled,
        toolIds: agent.tool_ids ?? [],
        skillIds: agent.skill_ids ?? [],
      })
      if (result.error) {
        loadingError.value = result.error
        return false
      }
      if (!result.item) return false
      loadingError.value = ''
      showToast(`${result.item.name} 已${enabled ? '启用' : '停用'}`)
      return true
    } finally {
      if (togglingId.value === agent.id) togglingId.value = null
    }
  }

  /** 批量删除：逐条调用 removeAgent，成功数/失败数汇总。 */
  async function batchDelete() {
    if (batchBusy.value || !selectedAgents.value.length) return
    const targets = [...selectedAgents.value]
    batchBusy.value = true
    const failed: string[] = []
    let ok = 0
    try {
      for (const item of targets) {
        const error = await agentsStore.removeAgent(item.id)
        if (error === undefined) continue
        if (error) { failed.push(String(item.id)) } else { ok += 1 }
      }
      if (failed.length) selectedIds.value = failed
      else selectedIds.value = []
      loadingError.value = ''
      if (failed.length) showToast(`已删除 ${ok} 个，失败 ${failed.length} 个（已保留选中可重试）`)
      else showToast(`已删除 ${ok} 个 Agent`)
    } finally {
      batchBusy.value = false
    }
  }

  async function confirmDelete() {
    if (!pendingDelete.value || deleting.value) return
    const target = pendingDelete.value
    const error = await agentsStore.removeAgent(target.id)
    if (error === undefined) return
    if (error) {
      loadingError.value = error
      return
    }
    if (selectedId.value === target.id) selectedId.value = null
    pendingDelete.value = null
    loadingError.value = ''
    showToast(`${target.name} 已删除`)
  }

  /** 打开删除确认框；目标对象存到 pendingDelete 由模板渲染确认。 */
  function requestDelete(agent: AgentResponse) {
    pendingDelete.value = agent
  }

  function cancelDelete() {
    pendingDelete.value = null
  }

  onBeforeUnmount(() => { if (toastTimer) clearTimeout(toastTimer) })

  return {
    state,
    apply,
    reset,
    isDefault,
    agents,
    tools,
    skills,
    loading,
    saving,
    deleting,
    batchBusy,
    togglingId,
    search,
    enabledFilter,
    modelFilter,
    page,
    pageSize,
    selectedId,
    selectedIds,
    selectedCount,
    selectedAgents,
    pendingDelete,
    loadingError,
    toast,
    total,
    pageCount,
    clampedPage,
    pagedItems,
    filteredAgents,
    selectedAgent,
    stats,
    showToast,
    loadAll,
    resetView,
    batchEnable,
    batchDisable,
    batchDelete,
    toggleEnabled,
    requestDelete,
    cancelDelete,
    confirmDelete,
  }
}
