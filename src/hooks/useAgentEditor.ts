import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { AgentResponse } from '@/interfaces/agent/api'
import type { AgentFormModel, AgentValidationIssue } from '@/interfaces/agent/model'
import { useAgentsStore } from '@/stores/agents'
import {
  agentResponseToForm,
  emptyAgentForm,
  validateAgent,
} from './useAgentManager'
import { useSaveFeedback } from './useSaveFeedback'

/** 新建/编辑/复制/保存：与列表逻辑(useAgentManager)分离，供 create/edit 路由页实例化。 */
export function useAgentEditor() {
  const router = useRouter()
  const agentsStore = useAgentsStore()
  const feedback = useSaveFeedback({
    listRoute: { name: 'platform-resource', params: { module: 'build', resource: 'agents' } },
    detailRoute: { name: 'agent-detail' },
  })
  const draft = ref<AgentFormModel>(emptyAgentForm())
  const loadingDetail = ref(false)
  const saving = ref(false)
  const error = ref('')
  /** 详情缺失或加载失败时为 true，编辑页据此渲染「未找到」空态（B-1）。 */
  const notFound = ref(false)

  const tools = computed(() => agentsStore.state.tools)
  const skills = computed(() => agentsStore.state.skills)
  const issues = computed<AgentValidationIssue[]>(() => validateAgent(draft.value))

  function goToList() {
    void router.push({ name: 'platform-resource', params: { module: 'build', resource: 'agents' } })
  }

  function goToDetail(agent: AgentResponse) {
    void router.push({ name: 'agent-detail', params: { id: String(agent.id) } })
  }

  function startEdit(id: number) {
    draft.value = emptyAgentForm()
    loadingDetail.value = true
    error.value = ''
    notFound.value = false
    return id
  }

  async function openEdit(id: number): Promise<boolean> {
    startEdit(id)
    const detail = await agentsStore.loadAgentDetail(id)
    loadingDetail.value = false
    if (detail === undefined) return false
    if (!detail) {
      error.value = ''
      notFound.value = true
      return false
    }
    draft.value = agentResponseToForm(detail)
    return true
  }

  /** sourceId 非空时复制一个 Agent 为新草稿(URL ?duplicate=<id>)；为空建空草稿。 */
  async function openCreate(sourceId?: number): Promise<void> {
    error.value = ''
    notFound.value = false
    if (sourceId == null) {
      draft.value = emptyAgentForm()
      return
    }
    loadingDetail.value = true
    const detail = await agentsStore.loadAgentDetail(sourceId)
    loadingDetail.value = false
    if (detail == null) {
      error.value = '复制源 Agent 加载失败，已返回新建模式。请刷新后重试。'
      draft.value = emptyAgentForm()
      return
    }
    const form = agentResponseToForm(detail)
    form.id = null
    form.workspaceId = null
    form.createdByUserId = null
    form.name = `${detail.name} 副本`
    form.isEnabled = false
    form.createdAt = ''
    form.updatedAt = ''
    draft.value = form
  }

  /** 返回保存后的 Agent；失败返回 null。 */
  async function persist(enabled: boolean): Promise<AgentResponse | null> {
    if (validateAgent(draft.value).length) return null
    const result = await agentsStore.saveAgent({
      id: draft.value.id ?? undefined,
      name: draft.value.name.trim(),
      description: draft.value.description.trim(),
      systemPrompt: draft.value.systemPrompt.trim(),
      modelName: draft.value.modelName.trim(),
      isEnabled: enabled,
      toolIds: [...draft.value.toolIds],
      skillIds: [...draft.value.skillIds],
    })
    if (result.error) {
      if (result.item) draft.value = agentResponseToForm(result.item)
      error.value = result.error
      return null
    }
    if (!result.item) {
      return null
    }
    error.value = ''
    draft.value = agentResponseToForm(result.item)
    return result.item
  }

  async function saveDraft(): Promise<boolean> {
    if (saving.value) return false
    saving.value = true
    try {
      const saved = await persist(draft.value.isEnabled)
      if (saved) await feedback.afterSave({ id: saved.id, message: `Agent「${saved.name}」已保存` })
      return Boolean(saved)
    } finally {
      saving.value = false
    }
  }

  async function publish(): Promise<boolean> {
    if (saving.value) return false
    saving.value = true
    try {
      const saved = await persist(true)
      if (saved) await feedback.afterSave({ id: saved.id, message: `Agent「${saved.name}」已发布` })
      return Boolean(saved)
    } finally {
      saving.value = false
    }
  }

  return {
    draft,
    issues,
    tools,
    skills,
    loadingDetail,
    saving,
    error,
    notFound,
    openEdit,
    openCreate,
    saveDraft,
    publish,
    goToList,
    goToDetail,
  }
}
