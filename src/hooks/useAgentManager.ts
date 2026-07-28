import { computed, onBeforeUnmount, ref } from 'vue'
import { AGENT_SEED, BUILTIN_TOOLS, MCP_SERVER_OPTIONS, SKILL_OPTIONS, createEmptyAgent } from '@/constants/agent'
import type { AgentConfig, AgentLifecycle, AgentValidationIssue } from '@/interfaces/agent/model'

function cloneAgent(agent: AgentConfig): AgentConfig {
  return structuredClone(agent)
}

export function useAgentManager() {
  const agents = ref(AGENT_SEED.map(cloneAgent))
  const search = ref('')
  const lifecycleFilter = ref<AgentLifecycle | 'all'>('all')
  const selectedId = ref('')
  const builderOpen = ref(false)
  const builderMode = ref<'create' | 'edit'>('create')
  const draft = ref<AgentConfig>(createEmptyAgent())
  const pendingDelete = ref<AgentConfig | null>(null)
  const toast = ref('')
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  const filteredAgents = computed(() => {
    const query = search.value.trim().toLowerCase()
    return agents.value.filter((agent) => {
      const lifecycleMatches = lifecycleFilter.value === 'all' || agent.lifecycle === lifecycleFilter.value
      const searchText = [agent.id, agent.name, agent.slug, agent.description, agent.owner, ...agent.tags].join(' ').toLowerCase()
      return lifecycleMatches && (!query || searchText.includes(query))
    })
  })
  const selectedAgent = computed(() => agents.value.find((agent) => agent.id === selectedId.value) ?? null)
  const stats = computed(() => ({
    all: agents.value.length,
    published: agents.value.filter((agent) => agent.lifecycle === 'published').length,
    draft: agents.value.filter((agent) => agent.lifecycle === 'draft' || agent.lifecycle === 'review').length,
    attention: agents.value.filter((agent) => agent.health === 'warning').length,
  }))

  function showToast(message: string) {
    toast.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, 2600)
  }

  function nextId() {
    const ids = agents.value.map((agent) => Number(agent.id.match(/\d+/)?.[0] ?? 0))
    return `AGT-${String(Math.max(0, ...ids) + 1).padStart(4, '0')}`
  }

  function openCreate() {
    builderMode.value = 'create'
    draft.value = createEmptyAgent()
    builderOpen.value = true
  }

  function openEdit(agent: AgentConfig) {
    builderMode.value = 'edit'
    draft.value = cloneAgent(agent)
    builderOpen.value = true
  }

  function openDuplicate(agent: AgentConfig) {
    builderMode.value = 'create'
    draft.value = cloneAgent(agent)
    draft.value.id = ''
    draft.value.name = `${agent.name} 副本`
    draft.value.slug = `${agent.slug}-copy`
    draft.value.lifecycle = 'draft'
    draft.value.health = 'idle'
    draft.value.publishedVersion = null
    draft.value.draftVersion = '0.1.0-draft'
    draft.value.successRate = null
    draft.value.lastRun = '尚未运行'
    builderOpen.value = true
  }

  function validateAgent(agent: AgentConfig): AgentValidationIssue[] {
    const issues: AgentValidationIssue[] = []
    if (!agent.name.trim() || !agent.slug.trim()) issues.push({ section: 'identity', message: '名称和唯一标识不能为空。' })
    if (agent.systemPrompt.trim().length < 30) issues.push({ section: 'prompt', message: '系统提示词至少需要 30 个字符。' })
    if (!agent.model.primaryModelId) issues.push({ section: 'model', message: '请选择主模型。' })

    const enabledToolIds = new Set(agent.tools.filter((tool) => tool.permission !== 'deny').map((tool) => tool.toolId))
    for (const binding of agent.skills) {
      const skill = SKILL_OPTIONS.find((item) => item.id === binding.skillId)
      if (!skill) continue
      const missing = skill.requiredToolIds.filter((toolId) => !enabledToolIds.has(toolId))
      if (missing.length) issues.push({ section: 'capabilities', message: `${skill.name} 缺少 ${missing.length} 个依赖工具。` })
    }

    const allTools = [...BUILTIN_TOOLS, ...MCP_SERVER_OPTIONS.flatMap((server) => server.tools)]
    const unsafeTool = agent.tools.find((binding) => {
      const tool = allTools.find((item) => item.id === binding.toolId)
      return tool?.risk === 'high' && binding.permission === 'allow'
    })
    if (unsafeTool) issues.push({ section: 'policy', message: '高风险工具不能设置为直接允许。' })
    if (agent.tools.some((tool) => tool.permission === 'ask') && (!agent.highRiskApproval || !agent.approvalGroup)) {
      issues.push({ section: 'policy', message: '需要审批的工具必须绑定审批组。' })
    }
    return issues
  }

  function saveDraft(agent = draft.value) {
    const saved = cloneAgent(agent)
    saved.id ||= nextId()
    saved.lifecycle = 'draft'
    saved.health = 'idle'
    saved.updatedAt = '刚刚'
    const index = agents.value.findIndex((item) => item.id === saved.id)
    if (index >= 0) agents.value[index] = saved
    else agents.value.unshift(saved)
    selectedId.value = saved.id
    draft.value = cloneAgent(saved)
    builderMode.value = 'edit'
    showToast(`${saved.name} 草稿已保存`)
  }

  function publish(agent = draft.value) {
    const issues = validateAgent(agent)
    if (issues.length) return issues
    const published = cloneAgent(agent)
    published.id ||= nextId()
    published.lifecycle = 'published'
    published.health = 'nominal'
    published.publishedVersion = published.draftVersion.replace('-draft', '')
    published.updatedAt = '刚刚'
    const index = agents.value.findIndex((item) => item.id === published.id)
    if (index >= 0) agents.value[index] = published
    else agents.value.unshift(published)
    selectedId.value = published.id
    draft.value = cloneAgent(published)
    builderOpen.value = false
    showToast(`${published.name} ${published.publishedVersion} 已发布`)
    return []
  }

  function confirmDelete() {
    if (!pendingDelete.value) return
    const id = pendingDelete.value.id
    agents.value = agents.value.filter((agent) => agent.id !== id)
    if (selectedId.value === id) selectedId.value = agents.value[0]?.id ?? ''
    showToast(`${pendingDelete.value.name} 已删除`)
    pendingDelete.value = null
  }

  onBeforeUnmount(() => { if (toastTimer) clearTimeout(toastTimer) })

  return {
    agents, search, lifecycleFilter, selectedId, builderOpen, builderMode, draft, pendingDelete, toast,
    filteredAgents, selectedAgent, stats, showToast, openCreate, openEdit, openDuplicate,
    validateAgent, saveDraft, publish, confirmDelete,
  }
}
