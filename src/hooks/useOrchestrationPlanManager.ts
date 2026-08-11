import { computed, onBeforeUnmount, ref } from 'vue'
import type { PlanMode, PlanResponse } from '@/interfaces/orchestration-plan/api'
import type {
  PlanFormModel,
  PlanMemberFormModel,
  PlanValidationIssue,
} from '@/interfaces/orchestration-plan/model'
import { useAgentsStore } from '@/stores/agents'
import { useOrchestrationPlansStore } from '@/stores/orchestrationPlans'

/** 后端成员数量约束：一个方案 2-5 个成员。 */
export const MIN_MEMBERS = 2
export const MAX_MEMBERS = 5

/** 循环模式轮数约束：1-10。 */
export const MIN_ITERATIONS = 1
export const MAX_ITERATIONS = 10

/** 编排模式选项：中文标签、一句话说明与 lucide 字体图标名。 */
export const PLAN_MODE_OPTIONS: Array<{ value: PlanMode; label: string; hint: string; icon: string }> = [
  { value: 'sequential', label: '顺序执行', hint: '成员按排列顺序依次接力，前一个的输出作为后一个的输入。', icon: 'list-ordered' },
  { value: 'parallel', label: '并行执行', hint: '全部成员同时处理同一任务，最后汇总各自结果。', icon: 'columns' },
  { value: 'routing', label: '智能路由', hint: '按触发条件把任务分发给命中的那一个成员。', icon: 'split' },
  { value: 'loop', label: '循环迭代', hint: '成员按顺序循环执行，直到达到设定的轮数上限。', icon: 'repeat' },
]

/** 模式中文标签映射，供列表与详情展示。 */
export const PLAN_MODE_LABEL: Record<PlanMode, string> = {
  sequential: '顺序执行',
  parallel: '并行执行',
  routing: '智能路由',
  loop: '循环迭代',
}

function emptyPlanForm(): PlanFormModel {
  return {
    id: null,
    workspaceId: null,
    createdByUserId: null,
    name: '',
    description: '',
    mode: 'sequential',
    maxIterations: 3,
    fallback: '',
    isEnabled: true,
    members: [],
    createdAt: '',
    updatedAt: '',
  }
}

/** 后端响应转表单模型；成员按 position 排序，routing 角色配置取字符串字段。 */
export function planResponseToForm(plan: PlanResponse): PlanFormModel {
  const members: PlanMemberFormModel[] = [...plan.members]
    .sort((left, right) => left.position - right.position)
    .map((member) => ({
      agentId: member.agent_id,
      agentName: member.agent_name,
      routeKey: typeof member.role_config.route_key === 'string' ? member.role_config.route_key : '',
      when: typeof member.role_config.when === 'string' ? member.role_config.when : '',
      isAvailable: member.is_available,
    }))
  const rawIterations = plan.config.max_iterations
  const rawFallback = plan.config.fallback
  return {
    id: plan.id,
    workspaceId: plan.workspace_id,
    createdByUserId: plan.created_by_user_id,
    name: plan.name,
    description: plan.description ?? '',
    mode: plan.mode,
    maxIterations: typeof rawIterations === 'number' ? rawIterations : 3,
    fallback: typeof rawFallback === 'string' ? rawFallback : '',
    isEnabled: plan.is_enabled,
    members,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
  }
}

export function useOrchestrationPlanManager() {
  const plansStore = useOrchestrationPlansStore()
  const agentsStore = useAgentsStore()
  const search = ref('')
  const enabledFilter = ref<'all' | 'enabled' | 'disabled'>('all')
  const modeFilter = ref<'all' | PlanMode>('all')
  const selectedId = ref<number | null>(null)
  const builderOpen = ref(false)
  const builderMode = ref<'create' | 'edit'>('create')
  const draft = ref<PlanFormModel>(emptyPlanForm())
  const pendingDelete = ref<PlanResponse | null>(null)
  const loadingError = ref('')
  const toast = ref('')
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let loadRequest = 0
  let editRequest = 0

  const plans = computed(() => plansStore.state.items)
  const agents = computed(() => agentsStore.state.items)
  const loading = computed(() => plansStore.state.loading || agentsStore.state.loading)
  const saving = computed(() => plansStore.state.saving)
  const deleting = computed(() => plansStore.state.deleting)
  const filteredPlans = computed(() => {
    const query = search.value.trim().toLowerCase()
    return plans.value.filter((plan) => {
      const enabledMatches = enabledFilter.value === 'all'
        || (enabledFilter.value === 'enabled' ? plan.is_enabled : !plan.is_enabled)
      const modeMatches = modeFilter.value === 'all' || plan.mode === modeFilter.value
      const searchText = [
        plan.id,
        plan.name,
        plan.description,
        plan.mode,
        ...plan.members.map((member) => member.agent_name),
      ].join(' ').toLowerCase()
      return enabledMatches && modeMatches && (!query || searchText.includes(query))
    })
  })
  const selectedPlan = computed(() => plans.value.find((plan) => plan.id === selectedId.value) ?? null)
  const stats = computed(() => ({
    all: plansStore.state.total,
    enabled: plans.value.filter((plan) => plan.is_enabled).length,
    disabled: plans.value.filter((plan) => !plan.is_enabled).length,
    broken: plans.value.filter((plan) => plan.members.some((member) => !member.is_available)).length,
  }))

  function showToast(message: string) {
    toast.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, 2600)
  }

  async function loadAll() {
    const request = ++loadRequest
    // 方案成员从 Agents 目录勾选，因此同时刷新 agents store 的列表。
    const [plansError, agentsError] = await Promise.all([
      plansStore.loadPlans(),
      agentsStore.loadAgents(),
    ])
    if (request === loadRequest) loadingError.value = plansError ?? agentsError ?? ''
  }

  function resetView() {
    loadRequest += 1
    editRequest += 1
    builderOpen.value = false
    builderMode.value = 'create'
    draft.value = emptyPlanForm()
    selectedId.value = null
    pendingDelete.value = null
    loadingError.value = ''
    toast.value = ''
    if (toastTimer) clearTimeout(toastTimer)
  }

  function openCreate() {
    editRequest += 1
    loadingError.value = ''
    builderMode.value = 'create'
    draft.value = emptyPlanForm()
    builderOpen.value = true
  }

  async function openEdit(plan: PlanResponse) {
    const request = ++editRequest
    builderMode.value = 'edit'
    const detail = await plansStore.loadPlanDetail(plan.id)
    if (request !== editRequest || detail === undefined) return
    if (!detail) {
      loadingError.value = '编排方案详情加载失败，未进入编辑模式。请刷新后重试。'
      return
    }
    loadingError.value = ''
    draft.value = planResponseToForm(detail)
    builderOpen.value = true
  }

  function openDuplicate(plan: PlanResponse) {
    editRequest += 1
    loadingError.value = ''
    builderMode.value = 'create'
    draft.value = {
      ...planResponseToForm(plan),
      id: null,
      workspaceId: null,
      createdByUserId: null,
      name: `${plan.name} 副本`,
      isEnabled: false,
      createdAt: '',
      updatedAt: '',
    }
    builderOpen.value = true
  }

  /** 与后端 Service 校验规则对齐，让用户在提交前就看到问题。 */
  function validatePlan(plan: PlanFormModel): PlanValidationIssue[] {
    const issues: PlanValidationIssue[] = []
    if (!plan.name.trim()) issues.push({ section: 'basic', message: '名称不能为空。' })
    if (plan.members.length < MIN_MEMBERS || plan.members.length > MAX_MEMBERS) {
      issues.push({ section: 'members', message: `成员数量需在 ${MIN_MEMBERS}-${MAX_MEMBERS} 个之间，当前 ${plan.members.length} 个。` })
    }
    const unavailable = plan.members.filter((member) => !member.isAvailable)
    if (unavailable.length) {
      issues.push({ section: 'members', message: `${unavailable.map((member) => member.agentName).join('、')} 已停用，方案将无法运行。` })
    }
    if (plan.mode === 'loop') {
      if (!Number.isInteger(plan.maxIterations)
        || plan.maxIterations < MIN_ITERATIONS
        || plan.maxIterations > MAX_ITERATIONS) {
        issues.push({ section: 'config', message: `循环轮数必须是 ${MIN_ITERATIONS}-${MAX_ITERATIONS} 的整数。` })
      }
    }
    if (plan.mode === 'routing') {
      const routeKeys = plan.members.map((member) => member.routeKey.trim())
      plan.members.forEach((member, index) => {
        if (!routeKeys[index]) issues.push({ section: 'config', message: `成员 ${member.agentName} 缺少路由标识。` })
        else if (routeKeys.indexOf(routeKeys[index]!) !== index) {
          issues.push({ section: 'config', message: `路由标识 ${routeKeys[index]} 重复，方案内必须唯一。` })
        }
        if (!member.when.trim()) issues.push({ section: 'config', message: `成员 ${member.agentName} 缺少触发条件描述。` })
      })
      const fallback = plan.fallback.trim()
      if (fallback && !routeKeys.includes(fallback)) {
        issues.push({ section: 'config', message: `兜底路由 ${fallback} 未命中任何成员的路由标识。` })
      }
    }
    return issues
  }

  async function persistDraft(enabled = draft.value.isEnabled) {
    const result = await plansStore.savePlan({
      id: draft.value.id ?? undefined,
      name: draft.value.name.trim(),
      description: draft.value.description.trim(),
      mode: draft.value.mode,
      maxIterations: draft.value.maxIterations,
      fallback: draft.value.fallback,
      isEnabled: enabled,
      members: draft.value.members.map((member) => ({
        agentId: member.agentId,
        routeKey: member.routeKey,
        when: member.when,
      })),
    })
    if (result.error) {
      if (result.item) draft.value = planResponseToForm(result.item)
      loadingError.value = result.error
      return false
    }
    if (!result.item) {
      return false
    }

    loadingError.value = ''
    draft.value = planResponseToForm(result.item)
    builderMode.value = 'edit'
    selectedId.value = result.item.id
    showToast(`${result.item.name} 已保存`)
    return true
  }

  async function saveDraft() {
    if (validatePlan(draft.value).length) return false
    return persistDraft()
  }

  async function publish() {
    if (validatePlan(draft.value).length) return false
    const saved = await persistDraft(true)
    if (saved) {
      builderOpen.value = false
      showToast(`${draft.value.name} 已启用`)
    }
    return saved
  }

  async function confirmDelete() {
    if (!pendingDelete.value || deleting.value) return
    const target = pendingDelete.value
    const error = await plansStore.removePlan(target.id)
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
    plans,
    agents,
    loading,
    saving,
    deleting,
    search,
    enabledFilter,
    modeFilter,
    selectedId,
    builderOpen,
    builderMode,
    draft,
    pendingDelete,
    loadingError,
    toast,
    filteredPlans,
    selectedPlan,
    stats,
    showToast,
    loadAll,
    resetView,
    openCreate,
    openEdit,
    openDuplicate,
    validatePlan,
    saveDraft,
    publish,
    confirmDelete,
  }
}
