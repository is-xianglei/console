import { computed, onBeforeUnmount, ref } from 'vue'
import type { AgentResponse } from '@/interfaces/agent/api'
import type { AgentFormModel, AgentValidationIssue } from '@/interfaces/agent/model'
import { useAgentsStore } from '@/stores/agents'

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
  const search = ref('')
  const enabledFilter = ref<'all' | 'enabled' | 'disabled'>('all')
  const selectedId = ref<number | null>(null)
  const pendingDelete = ref<AgentResponse | null>(null)
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
    const query = search.value.trim().toLowerCase()
    return agents.value.filter((agent) => {
      const enabledMatches = enabledFilter.value === 'all'
        || (enabledFilter.value === 'enabled' ? agent.is_enabled : !agent.is_enabled)
      const searchText = [
        agent.id,
        agent.name,
        agent.description,
        agent.model_name,
      ].join(' ').toLowerCase()
      return enabledMatches && (!query || searchText.includes(query))
    })
  })
  const selectedAgent = computed(() => agents.value.find((agent) => agent.id === selectedId.value) ?? null)
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
    selectedId.value = null
    pendingDelete.value = null
    loadingError.value = ''
    toast.value = ''
    if (toastTimer) clearTimeout(toastTimer)
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

  onBeforeUnmount(() => { if (toastTimer) clearTimeout(toastTimer) })

  return {
    agents,
    tools,
    skills,
    loading,
    saving,
    deleting,
    search,
    enabledFilter,
    selectedId,
    pendingDelete,
    loadingError,
    toast,
    filteredAgents,
    selectedAgent,
    stats,
    showToast,
    loadAll,
    resetView,
    confirmDelete,
  }
}
