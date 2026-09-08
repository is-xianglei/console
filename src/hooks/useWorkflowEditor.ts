import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { AgentResponse } from '@/interfaces/agent/api'
import type { WorkflowResponse } from '@/interfaces/workflow/api'
import type { WorkflowFormModel, WorkflowValidationIssue } from '@/interfaces/workflow/model'
import { useAgentsStore } from '@/stores/agents'
import { useWorkflowsStore } from '@/stores/workflows'
import {
  emptyWorkflowForm,
  validateWorkflow,
  workflowResponseToForm,
} from './useWorkflowManager'

/**
 * 详情 + 编辑 + 保存：与列表逻辑(useWorkflowManager)分离，
 * 由详情/create/edit 三个路由页各自实例化。导航由本 hook 统一负责。
 */
export function useWorkflowEditor() {
  const router = useRouter()
  const workflowsStore = useWorkflowsStore()
  const agentsStore = useAgentsStore()
  const draft = ref<WorkflowFormModel>(emptyWorkflowForm())
  const loadingDetail = ref(false)
  const saving = ref(false)
  const error = ref('')

  const agents = computed<AgentResponse[]>(() => agentsStore.state.items)
  const issues = computed<WorkflowValidationIssue[]>(() => validateWorkflow(draft.value))

  /** 编辑/创建页都需要 Agent 目录来勾选成员；首次进入时确保已加载。 */
  async function ensureAgents() {
    if (agentsStore.state.loading || agentsStore.state.items.length) return
    await agentsStore.loadAgents()
  }

  function goToList() {
    void router.push({ name: 'platform-resource', params: { module: 'build', resource: 'workflows' } })
  }

  function goToDetail(workflow: WorkflowResponse) {
    void router.push({ name: 'workflow-detail', params: { id: String(workflow.id) } })
  }

  /** 请求详情前先把编辑态置空，避免上一个草稿残留。 */
  function startEdit(id: number) {
    draft.value = emptyWorkflowForm()
    loadingDetail.value = true
    error.value = ''
    return id
  }

  /** 打开编辑页：拉详情并转表单模型；失败把错误留到页面，不进入编辑。 */
  async function openEdit(id: number): Promise<boolean> {
    startEdit(id)
    await ensureAgents()
    const detail = await workflowsStore.loadWorkflowDetail(id)
    loadingDetail.value = false
    if (detail === undefined) return false
    if (!detail) {
      error.value = 'Workflow 详情加载失败，未进入编辑模式。请刷新后重试。'
      return false
    }
    draft.value = workflowResponseToForm(detail, agents.value)
    return true
  }

  /**
   * 打开新增/复制页。sourceId 非空时拉源 Workflow 作为复制模板，
   * 用于 URL 上带 ?duplicate=<id> 的"复制"入口；为空则建空草稿。
   */
  async function openCreate(sourceId?: number): Promise<void> {
    error.value = ''
    await ensureAgents()
    if (sourceId == null) {
      draft.value = emptyWorkflowForm()
      return
    }
    loadingDetail.value = true
    const detail = await workflowsStore.loadWorkflowDetail(sourceId)
    loadingDetail.value = false
    if (detail == null) {
      error.value = '复制源 Workflow 加载失败，已返回新建模式。请刷新后重试。'
      draft.value = emptyWorkflowForm()
      return
    }
    const form = workflowResponseToForm(detail, agents.value)
    form.id = null
    form.name = `${detail.name} 副本`
    draft.value = form
  }

  /** 校验通过后提交草稿；成功跳详情页，失败把错误留在页面顶部。 */
  async function saveDraft(): Promise<boolean> {
    if (validateWorkflow(draft.value).length) return false
    if (saving.value) return false
    saving.value = true
    try {
      const result = await workflowsStore.saveWorkflow({
        id: draft.value.id,
        name: draft.value.name.trim(),
        description: draft.value.description.trim(),
        mode: draft.value.mode,
        isEnabled: draft.value.isEnabled,
        memberAgentIds: draft.value.members.map((member) => member.agentId),
      })
      if (result.error) {
        error.value = result.error
        return false
      }
      // item 与 error 同时为空表示工作区已切换，本次结果直接放弃。
      if (!result.item) return false
      error.value = ''
      goToDetail(result.item)
      return true
    } finally {
      saving.value = false
    }
  }

  return {
    draft,
    issues,
    agents,
    loadingDetail,
    saving,
    error,
    openEdit,
    openCreate,
    saveDraft,
    goToList,
    goToDetail,
  }
}
