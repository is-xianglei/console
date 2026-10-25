import { computed, onBeforeUnmount, ref } from 'vue'
import type { PlanMode, PlanResponse } from '@/interfaces/orchestration-plan/api'
import type {
  PlanBuilderStep,
  PlanFormModel,
  PlanIssueField,
  PlanMemberFormModel,
  PlanValidationIssue,
} from '@/interfaces/orchestration-plan/model'
import { useAgentsStore } from '@/stores/agents'
import { useOrchestrationPlansStore } from '@/stores/orchestrationPlans'
import { inDateRange, useListUrlState } from './useListUrlState'

/** 后端成员数量约束：一个方案 2-5 个成员。 */
export const MIN_MEMBERS = 2
export const MAX_MEMBERS = 5

/** 循环模式轮数约束：1-10。 */
export const MIN_ITERATIONS = 1
export const MAX_ITERATIONS = 10

/** 启用状态筛选值（与 URL 里 enabled 字段共用）。 */
export type PlanEnabledFilter = 'all' | 'enabled' | 'disabled'

const DEFAULT_PAGE_SIZE = 20

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

export function emptyPlanForm(): PlanFormModel {
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

/** 成员是否仍可参与编排：只认后端给出的 is_available 判定。 */
export function isPlanMemberAvailable(member: PlanResponse['members'][number]): boolean {
  return member.is_available
}

/**
 * 与后端 Service 校验规则对齐，让用户在提交前就看到问题；有任一问题即阻止保存。
 * 每条问题带 field（routeKey / when 另带 memberIndex），Builder 据此定位步骤与字段，不依赖消息文本。
 */
export function validatePlan(plan: PlanFormModel): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = []
  if (!plan.name.trim()) issues.push({ section: 'basic', field: 'name', message: '名称不能为空。' })
  if (plan.members.length < MIN_MEMBERS || plan.members.length > MAX_MEMBERS) {
    issues.push({ section: 'members', field: 'members', message: `成员数量需在 ${MIN_MEMBERS}-${MAX_MEMBERS} 个之间，当前 ${plan.members.length} 个。` })
  }
  const agentIds = plan.members.map((member) => member.agentId)
  const duplicated = plan.members.filter((member, index) => agentIds.indexOf(member.agentId) !== index)
  if (duplicated.length) {
    issues.push({ section: 'members', field: 'members', message: `${duplicated.map((member) => member.agentName).join('、')} 重复加入，同一 Agent 只能加入一次。` })
  }
  const unavailable = plan.members.filter((member) => !member.isAvailable)
  if (unavailable.length) {
    issues.push({ section: 'members', field: 'members', message: `${unavailable.map((member) => member.agentName).join('、')} 已停用，方案将无法运行。` })
  }
  if (plan.mode === 'loop') {
    if (!Number.isInteger(plan.maxIterations)
      || plan.maxIterations < MIN_ITERATIONS
      || plan.maxIterations > MAX_ITERATIONS) {
      issues.push({ section: 'config', field: 'maxIterations', message: `循环轮数必须是 ${MIN_ITERATIONS}-${MAX_ITERATIONS} 的整数。` })
    }
  }
  if (plan.mode === 'routing') {
    const routeKeys = plan.members.map((member) => member.routeKey.trim())
    plan.members.forEach((member, index) => {
      if (!routeKeys[index]) {
        issues.push({ section: 'config', field: 'routeKey', memberIndex: index, message: `成员 ${member.agentName} 缺少路由标识。` })
      } else if (routeKeys.indexOf(routeKeys[index]!) !== index) {
        // 重复的那一行（第二次及以后出现）报错，字段级提示落在该行的路由标识上。
        issues.push({ section: 'config', field: 'routeKey', memberIndex: index, message: `路由标识 ${routeKeys[index]} 重复，方案内必须唯一。` })
      }
      if (!member.when.trim()) {
        issues.push({ section: 'config', field: 'when', memberIndex: index, message: `成员 ${member.agentName} 缺少触发条件描述。` })
      }
    })
    const fallback = plan.fallback.trim()
    if (fallback && !routeKeys.includes(fallback)) {
      issues.push({ section: 'config', field: 'fallback', message: `兜底路由 ${fallback} 未命中任何成员的路由标识。` })
    }
  }
  return issues
}

/** 校验问题字段 → Builder 步骤：每个字段都有归属，类型保证不会漏映射。 */
const PLAN_ISSUE_STEP: Record<PlanIssueField, PlanBuilderStep> = {
  name: 'basic',
  members: 'members',
  routeKey: 'order',
  when: 'order',
  maxIterations: 'config',
  fallback: 'config',
}

/** 校验问题所在的 Builder 步骤。 */
export function planIssueStep(issue: PlanValidationIssue): PlanBuilderStep {
  return PLAN_ISSUE_STEP[issue.field]
}

/**
 * 校验问题 → UFormField name：routeKey / when 落到对应成员行（`routeKey-<下标>` / `when-<下标>`），
 * 其余即字段名。members 没有单独的输入控件，只由步骤内问题提示展示。
 */
export function planIssueFieldName(issue: PlanValidationIssue): string {
  if (issue.field === 'routeKey' || issue.field === 'when') return `${issue.field}-${issue.memberIndex ?? 0}`
  return issue.field
}

/** 列表页状态：加载、筛选、启停、删除；不含编辑/详情/保存。 */
export function useOrchestrationPlanManager() {
  const plansStore = useOrchestrationPlansStore()
  const agentsStore = useAgentsStore()

  // 筛选/分页状态写入 route.query（useListUrlState）；state 为真源。
  // URL 键统一叫 enabled（prd A-3），对外仍暴露 enabledFilter 兼容既有绑定。
  const { state, apply, reset, isDefault } = useListUrlState({
    defaults: {
      keyword: '',
      enabled: 'all' as PlanEnabledFilter,
      mode: 'all' as 'all' | PlanMode,
      dateRange: [] as string[],
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    },
    resetPageOn: ['keyword', 'enabled', 'mode', 'dateRange', 'pageSize'],
  })

  // 兼容模板既有绑定名（v-model="search" / enabledFilter / modeFilter），实际读写 state。
  const search = computed({
    get: () => state.keyword,
    set: (v) => { state.keyword = v },
  })
  const enabledFilter = computed({
    get: () => state.enabled,
    set: (v) => { state.enabled = v as PlanEnabledFilter },
  })
  const modeFilter = computed({
    get: () => state.mode,
    set: (v) => { state.mode = v as 'all' | PlanMode },
  })
  const page = computed({ get: () => state.page, set: (v) => { state.page = v } })
  const pageSize = computed({ get: () => state.pageSize, set: (v) => { state.pageSize = v } })

  const pendingDelete = ref<PlanResponse | null>(null)
  /** 正在启停的方案 ID，供列表只在对应行展示 loading。 */
  const togglingId = ref<number | null>(null)
  /** 多选：勾选行的 id 集合（供批量操作；点击表头全选当前页）。 */
  const selectedIds = ref<string[]>([])
  /** 批量启用/停用/删除处理中。 */
  const batchBusy = ref(false)
  const loadingError = ref('')
  const toast = ref('')
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let loadRequest = 0

  const plans = computed(() => plansStore.state.items)
  const agents = computed(() => agentsStore.state.items)
  const loading = computed(() => plansStore.state.loading || agentsStore.state.loading)
  const saving = computed(() => plansStore.state.saving)
  const deleting = computed(() => plansStore.state.deleting)
  const filteredPlans = computed(() => {
    const query = state.keyword.trim().toLowerCase()
    const [start, end] = state.dateRange
    return plans.value.filter((plan) => {
      const enabledMatches = state.enabled === 'all'
        || (state.enabled === 'enabled' ? plan.is_enabled : !plan.is_enabled)
      const modeMatches = state.mode === 'all' || plan.mode === state.mode
      const dateMatches = !start || !end || inDateRange(plan.created_at, start, end)
      const searchText = [
        plan.id,
        plan.name,
        plan.description,
        plan.mode,
        ...plan.members.map((member) => member.agent_name),
      ].join(' ').toLowerCase()
      return enabledMatches && modeMatches && dateMatches && (!query || searchText.includes(query))
    })
  })

  const total = computed(() => filteredPlans.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, state.pageSize))))
  const clampedPage = computed(() => Math.min(Math.max(1, state.page), pageCount.value))
  /** 当前页切片（供 ResourceTable.data）。 */
  const pagedItems = computed(() => {
    const start = (clampedPage.value - 1) * state.pageSize
    return filteredPlans.value.slice(start, start + state.pageSize)
  })
  /** 选中项对应的 Plan 行（供批量操作）。 */
  const selectedPlans = computed(() => {
    const set = new Set(selectedIds.value)
    return filteredPlans.value.filter((item) => set.has(String(item.id)))
  })
  const selectedCount = computed(() => selectedPlans.value.length)

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
    reset()
    pendingDelete.value = null
    togglingId.value = null
    selectedIds.value = []
    batchBusy.value = false
    loadingError.value = ''
    toast.value = ''
    if (toastTimer) clearTimeout(toastTimer)
  }

  onBeforeUnmount(() => { if (toastTimer) clearTimeout(toastTimer) })

  /** 只翻转启用状态，其余字段与成员顺序原样回传（savePlan 提供完整载荷）。
   *  乐观更新：先翻转本地行的 is_enabled，接口失败时 store 在 savePlan 的 catch 里重拉
   *  列表把该行回滚到服务端真实状态（对齐 useWorkflowManager 的乐观语义）。 */
  async function toggleEnabled(plan: PlanResponse) {
    if (togglingId.value != null) return false
    const enabled = !plan.is_enabled
    togglingId.value = plan.id
    plan.is_enabled = enabled
    try {
      const result = await plansStore.savePlan({
        id: plan.id,
        name: plan.name,
        description: plan.description ?? '',
        mode: plan.mode,
        maxIterations: typeof plan.config.max_iterations === 'number' ? plan.config.max_iterations : 3,
        fallback: typeof plan.config.fallback === 'string' ? plan.config.fallback : '',
        isEnabled: enabled,
        members: [...plan.members]
          .sort((left, right) => left.position - right.position)
          .map((member) => ({
            agentId: member.agent_id,
            routeKey: typeof member.role_config.route_key === 'string' ? member.role_config.route_key : '',
            when: typeof member.role_config.when === 'string' ? member.role_config.when : '',
          })),
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
      if (togglingId.value === plan.id) togglingId.value = null
    }
  }

  /** 打开删除确认框；目标对象存到 pendingDelete 由模板渲染确认。 */
  function requestDelete(plan: PlanResponse) {
    pendingDelete.value = plan
  }

  /** 批量操作的公共骨架：逐条串行调用 action，汇总成功/失败并保留失败项待重试。 */
  async function runBatch(
    ids: string[],
    action: (item: PlanResponse) => Promise<boolean>,
    successText: (n: number) => string,
  ): Promise<void> {
    if (batchBusy.value) return
    const targets = ids.map((id) => filteredPlans.value.find((item) => String(item.id) === id)).filter((item): item is PlanResponse => Boolean(item))
    if (!targets.length) return
    batchBusy.value = true
    const failed: string[] = []
    let ok = 0
    try {
      for (const item of targets) {
        const success = await action(item)
        if (success) { ok += 1 } else { failed.push(String(item.id)) }
      }
      if (failed.length) selectedIds.value = failed
      else selectedIds.value = []
      loadingError.value = ''
      const base = successText(ok)
      if (failed.length) showToast(`${base}，失败 ${failed.length} 个（已保留选中可重试）`)
      else showToast(base)
    } finally {
      batchBusy.value = false
    }
  }

  /** 批量启用：把选中项的 is_enabled 翻成 true。 */
  function batchEnable() {
    if (!selectedPlans.value.length) return
    return runBatch(
      selectedIds.value,
      async (item) => (item.is_enabled ? true : toggleEnabled(item)),
      (n) => `已启用 ${n} 个编排方案`,
    )
  }

  /** 批量停用：把选中项的 is_enabled 翻成 false。 */
  function batchDisable() {
    if (!selectedPlans.value.length) return
    return runBatch(
      selectedIds.value,
      async (item) => (item.is_enabled ? toggleEnabled(item) : true),
      (n) => `已停用 ${n} 个编排方案`,
    )
  }

  /** 批量删除：逐条调用 removePlan，成功数/失败数汇总。 */
  async function batchDelete() {
    if (batchBusy.value || !selectedPlans.value.length) return
    const targets = [...selectedPlans.value]
    batchBusy.value = true
    const failed: string[] = []
    let ok = 0
    try {
      for (const item of targets) {
        const error = await plansStore.removePlan(item.id)
        if (error === undefined) continue
        if (error) { failed.push(String(item.id)) } else { ok += 1 }
      }
      if (failed.length) selectedIds.value = failed
      else selectedIds.value = []
      loadingError.value = ''
      if (failed.length) showToast(`已删除 ${ok} 个，失败 ${failed.length} 个（已保留选中可重试）`)
      else showToast(`已删除 ${ok} 个编排方案`)
    } finally {
      batchBusy.value = false
    }
  }

  function cancelDelete() {
    pendingDelete.value = null
  }

  /** 确认后调用删除接口；失败把错误放到页面顶部，成功清除确认框。 */
  async function confirmDelete() {
    if (!pendingDelete.value || deleting.value) return
    const target = pendingDelete.value
    const error = await plansStore.removePlan(target.id)
    if (error === undefined) return
    if (error) {
      loadingError.value = error
      return
    }
    pendingDelete.value = null
    loadingError.value = ''
    showToast(`${target.name} 已删除`)
  }

  return {
    state,
    apply,
    reset,
    isDefault,
    plans,
    agents,
    loading,
    saving,
    deleting,
    togglingId,
    batchBusy,
    search,
    enabledFilter,
    modeFilter,
    page,
    pageSize,
    selectedIds,
    selectedCount,
    selectedPlans,
    pendingDelete,
    loadingError,
    toast,
    total,
    pageCount,
    clampedPage,
    pagedItems,
    filteredPlans,
    validatePlan,
    showToast,
    loadAll,
    toggleEnabled,
    batchEnable,
    batchDisable,
    batchDelete,
    requestDelete,
    confirmDelete,
    cancelDelete,
    resetView,
  }
}
