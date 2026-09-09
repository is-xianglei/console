import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { AgentResponse } from '@/interfaces/agent/api'
import type { PlanResponse } from '@/interfaces/orchestration-plan/api'
import type { PlanFormModel, PlanValidationIssue } from '@/interfaces/orchestration-plan/model'
import { useAgentsStore } from '@/stores/agents'
import { useOrchestrationPlansStore } from '@/stores/orchestrationPlans'
import {
  emptyPlanForm,
  planResponseToForm,
  validatePlan,
} from './useOrchestrationPlanManager'
import { useSaveFeedback } from './useSaveFeedback'

/**
 * 详情 + 编辑 + 保存：与列表逻辑(useOrchestrationPlanManager)分离，
 * 由详情/create/edit 三个路由页各自实例化。导航由本 hook 统一负责。
 */
export function usePlanEditor() {
  const router = useRouter()
  const plansStore = useOrchestrationPlansStore()
  const agentsStore = useAgentsStore()
  const feedback = useSaveFeedback({
    listRoute: { name: 'platform-resource', params: { module: 'build', resource: 'plans' } },
    detailRoute: { name: 'plan-detail' },
  })
  const draft = ref<PlanFormModel>(emptyPlanForm())
  const loadingDetail = ref(false)
  const saving = ref(false)
  const error = ref('')
  /** 详情缺失或加载失败时为 true，编辑页据此渲染「未找到」空态（B-1）。 */
  const notFound = ref(false)

  const agents = computed<AgentResponse[]>(() => agentsStore.state.items)
  const issues = computed<PlanValidationIssue[]>(() => validatePlan(draft.value))

  /** 编辑/创建页都需要 Agent 目录来勾选成员；首次进入时确保已加载。 */
  async function ensureAgents() {
    if (agentsStore.state.loading || agentsStore.state.items.length) return
    await agentsStore.loadAgents()
  }

  function goToList() {
    void router.push({ name: 'platform-resource', params: { module: 'build', resource: 'plans' } })
  }

  function goToDetail(plan: PlanResponse) {
    void router.push({ name: 'plan-detail', params: { id: String(plan.id) } })
  }

  /** 请求详情前先把编辑态置空，避免上一个草稿残留。 */
  function startEdit(id: number) {
    draft.value = emptyPlanForm()
    loadingDetail.value = true
    error.value = ''
    notFound.value = false
    return id
  }

  /** 打开编辑页：拉详情并转表单模型；失败置 notFound，由编辑页渲染「未找到」空态。 */
  async function openEdit(id: number): Promise<boolean> {
    startEdit(id)
    await ensureAgents()
    const detail = await plansStore.loadPlanDetail(id)
    loadingDetail.value = false
    if (detail === undefined) return false
    if (!detail) {
      error.value = ''
      notFound.value = true
      return false
    }
    draft.value = planResponseToForm(detail)
    return true
  }

  /**
   * 打开新增/复制页。sourceId 非空时拉源方案作为复制模板，
   * 用于 URL 上带 ?duplicate=<id> 的"复制"入口；为空则建空草稿。
   */
  async function openCreate(sourceId?: number): Promise<void> {
    error.value = ''
    notFound.value = false
    await ensureAgents()
    if (sourceId == null) {
      draft.value = emptyPlanForm()
      return
    }
    loadingDetail.value = true
    const detail = await plansStore.loadPlanDetail(sourceId)
    loadingDetail.value = false
    if (detail == null) {
      error.value = '复制源方案加载失败，已返回新建模式。请刷新后重试。'
      draft.value = emptyPlanForm()
      return
    }
    const form = planResponseToForm(detail)
    form.id = null
    form.workspaceId = null
    form.createdByUserId = null
    form.name = `${detail.name} 副本`
    form.isEnabled = false
    form.createdAt = ''
    form.updatedAt = ''
    draft.value = form
  }

  /**
   * 保存草稿（保留草稿自带的启用状态）；校验通过后提交。
   * 成功跳详情页，失败把错误留在页面顶部。
   */
  async function saveDraft(): Promise<boolean> {
    if (validatePlan(draft.value).length) return false
    if (saving.value) return false
    saving.value = true
    try {
      const result = await plansStore.savePlan({
        id: draft.value.id ?? undefined,
        name: draft.value.name.trim(),
        description: draft.value.description.trim(),
        mode: draft.value.mode,
        maxIterations: draft.value.maxIterations,
        fallback: draft.value.fallback,
        isEnabled: draft.value.isEnabled,
        members: draft.value.members.map((member) => ({
          agentId: member.agentId,
          routeKey: member.routeKey,
          when: member.when,
        })),
      })
      if (result.error) {
        error.value = result.error
        return false
      }
      // item 与 error 同时为空表示工作区已切换，本次结果直接放弃。
      if (!result.item) return false
      error.value = ''
      await feedback.afterSave({ id: result.item.id, message: `编排方案「${result.item.name}」已保存` })
      return true
    } finally {
      saving.value = false
    }
  }

  /** 校验通过后以启用态提交，立即对会话开放；成功 toast + 回列表并带 ?highlight=<id>。 */
  async function publish(): Promise<boolean> {
    if (validatePlan(draft.value).length) return false
    if (saving.value) return false
    saving.value = true
    try {
      const result = await plansStore.savePlan({
        id: draft.value.id ?? undefined,
        name: draft.value.name.trim(),
        description: draft.value.description.trim(),
        mode: draft.value.mode,
        maxIterations: draft.value.maxIterations,
        fallback: draft.value.fallback,
        isEnabled: true,
        members: draft.value.members.map((member) => ({
          agentId: member.agentId,
          routeKey: member.routeKey,
          when: member.when,
        })),
      })
      if (result.error) {
        error.value = result.error
        return false
      }
      if (!result.item) return false
      error.value = ''
      await feedback.afterSave({ id: result.item.id, message: `编排方案「${result.item.name}」已发布` })
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
    notFound,
    openEdit,
    openCreate,
    saveDraft,
    publish,
    goToList,
    goToDetail,
  }
}
