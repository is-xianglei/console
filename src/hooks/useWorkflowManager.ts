import { computed, onBeforeUnmount, ref } from 'vue'
import { WORKFLOW_MODE_LABEL, minWorkflowMembers } from '@/constants/workflow'
import type { AgentResponse } from '@/interfaces/agent/api'
import type {
  WorkflowAgentResponse,
  WorkflowMode,
  WorkflowResponse,
} from '@/interfaces/workflow/api'
import type {
  WorkflowFormModel,
  WorkflowMemberFormModel,
  WorkflowValidationIssue,
} from '@/interfaces/workflow/model'
import { useAgentsStore } from '@/stores/agents'
import { useWorkflowsStore } from '@/stores/workflows'
import { inDateRange, useListUrlState } from './useListUrlState'

/** 名称长度上限，与后端 Schema 约束一致。 */
export const MAX_WORKFLOW_NAME_LENGTH = 128

/** 成员 Agent 已被软删除（agent_name 为 null）时的展示名。 */
export const DELETED_AGENT_LABEL = '已删除的 Agent'

/** 启用状态筛选值（与 URL 里 enabled 字段共用）。 */
export type WorkflowEnabledFilter = 'all' | 'enabled' | 'disabled'

const DEFAULT_PAGE_SIZE = 20

export function emptyWorkflowForm(): WorkflowFormModel {
  return {
    id: null,
    name: '',
    description: '',
    mode: 'sequential',
    isEnabled: true,
    members: [],
  }
}

/** 成员按 sort_order 升序，同序号再按 agent_id，保证与后端排序一致。 */
export function sortWorkflowMembers(workflow: WorkflowResponse): WorkflowAgentResponse[] {
  return [...workflow.agents].sort(
    (left, right) => left.sort_order - right.sort_order || left.agent_id - right.agent_id,
  )
}

/**
 * 成员是否仍可参与编排：后端只在 Agent 被软删除时把 agent_name 置空，
 * 是否停用需要用 Agent 列表反查，两者任一不满足都视为失效。
 */
export function isWorkflowMemberAvailable(
  member: WorkflowAgentResponse,
  agents: AgentResponse[],
): boolean {
  if (member.agent_name == null) return false
  const agent = agents.find((item) => item.id === member.agent_id)
  return agent?.is_enabled === true
}

/** 任一成员失效即视为 Workflow 成员失效，列表统计与告警共用该判定。 */
export function hasUnavailableWorkflowMember(
  workflow: WorkflowResponse,
  agents: AgentResponse[],
): boolean {
  return workflow.agents.some((member) => !isWorkflowMemberAvailable(member, agents))
}

/** 后端响应转表单模型；成员名优先取响应的 agent_name，可用性由 Agent 列表反查。 */
export function workflowResponseToForm(
  workflow: WorkflowResponse,
  agents: AgentResponse[],
): WorkflowFormModel {
  const members: WorkflowMemberFormModel[] = sortWorkflowMembers(workflow).map((member) => ({
    agentId: member.agent_id,
    agentName: member.agent_name ?? DELETED_AGENT_LABEL,
    isAvailable: isWorkflowMemberAvailable(member, agents),
  }))
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description ?? '',
    mode: workflow.mode,
    isEnabled: workflow.is_enabled,
    members,
  }
}

/** 与后端 Service 校验规则对齐，让用户在提交前就看到问题；有任一问题即阻止保存。 */
export function validateWorkflow(form: WorkflowFormModel): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = []
  const name = form.name.trim()
  if (!name) {
    issues.push({ section: 'basic', message: '名称不能为空。' })
  } else if (name.length > MAX_WORKFLOW_NAME_LENGTH) {
    issues.push({
      section: 'basic',
      message: `名称不能超过 ${MAX_WORKFLOW_NAME_LENGTH} 个字符，当前 ${name.length} 个。`,
    })
  }

  const minMembers = minWorkflowMembers(form.mode)
  if (form.members.length < minMembers) {
    issues.push({
      section: 'members',
      message: `${WORKFLOW_MODE_LABEL[form.mode]}至少需要 ${minMembers} 个成员，当前 ${form.members.length} 个。`,
    })
  }

  const seen = new Set<number>()
  const duplicated: string[] = []
  form.members.forEach((member) => {
    if (seen.has(member.agentId)) {
      if (!duplicated.includes(member.agentName)) duplicated.push(member.agentName)
      return
    }
    seen.add(member.agentId)
  })
  if (duplicated.length) {
    issues.push({
      section: 'members',
      message: `${duplicated.join('、')} 重复加入，同一 Agent 只能出现一次。`,
    })
  }

  const unavailable = form.members.filter((member) => !member.isAvailable)
  if (unavailable.length) {
    issues.push({
      section: 'members',
      message: `${unavailable.map((member) => member.agentName).join('、')} 已停用或已删除，请移除后再保存。`,
    })
  }
  return issues
}

/** 列表页状态：加载、筛选、启停、删除；不含编辑/详情/保存。 */
export function useWorkflowManager() {
  const workflowsStore = useWorkflowsStore()
  const agentsStore = useAgentsStore()

  // 筛选/分页状态写入 route.query（useListUrlState）；state 为真源。
  // 注意：URL 键统一叫 enabled（prd A-3），对外仍暴露 enabledFilter 兼容既有绑定。
  const { state, apply, reset, isDefault } = useListUrlState({
    defaults: {
      keyword: '',
      enabled: 'all' as WorkflowEnabledFilter,
      mode: 'all' as 'all' | WorkflowMode,
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
    set: (v) => { state.enabled = v as WorkflowEnabledFilter },
  })
  const modeFilter = computed({
    get: () => state.mode,
    set: (v) => { state.mode = v as 'all' | WorkflowMode },
  })
  const page = computed({ get: () => state.page, set: (v) => { state.page = v } })
  const pageSize = computed({ get: () => state.pageSize, set: (v) => { state.pageSize = v } })

  const selectedId = ref<number | null>(null)
  /** 多选：勾选行的 id 集合（供批量操作；点击表头全选当前页）。 */
  const selectedIds = ref<string[]>([])
  const pendingDelete = ref<WorkflowResponse | null>(null)
  /** 正在启停的 Workflow ID，供列表只在对应行展示 loading。 */
  const togglingId = ref<number | null>(null)
  /** 批量启用/停用/删除处理中。 */
  const batchBusy = ref(false)
  const loadingError = ref('')
  const toast = ref('')
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let loadRequest = 0

  const workflows = computed(() => workflowsStore.state.items)
  const agents = computed(() => agentsStore.state.items)
  const loading = computed(() => workflowsStore.state.loading || agentsStore.state.loading)
  const saving = computed(() => workflowsStore.state.saving)
  const deleting = computed(() => workflowsStore.state.deleting)

  function isMemberAvailable(member: WorkflowAgentResponse) {
    return isWorkflowMemberAvailable(member, agents.value)
  }

  function hasBrokenMember(workflow: WorkflowResponse) {
    return hasUnavailableWorkflowMember(workflow, agents.value)
  }

  const filteredWorkflows = computed(() => {
    const query = state.keyword.trim().toLowerCase()
    const [start, end] = state.dateRange
    return workflows.value.filter((workflow) => {
      const enabledMatches = state.enabled === 'all'
        || (state.enabled === 'enabled' ? workflow.is_enabled : !workflow.is_enabled)
      const modeMatches = state.mode === 'all' || workflow.mode === state.mode
      const dateMatches = !start || !end || inDateRange(workflow.created_at, start, end)
      const searchText = [
        workflow.id,
        workflow.name,
        workflow.description ?? '',
        workflow.mode,
        WORKFLOW_MODE_LABEL[workflow.mode],
        ...workflow.agents.map((member) => member.agent_name ?? ''),
      ].join(' ').toLowerCase()
      return enabledMatches && modeMatches && dateMatches && (!query || searchText.includes(query))
    })
  })
  const selectedWorkflow = computed(
    () => workflows.value.find((workflow) => workflow.id === selectedId.value) ?? null,
  )

  const total = computed(() => filteredWorkflows.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, state.pageSize))))
  const clampedPage = computed(() => Math.min(Math.max(1, state.page), pageCount.value))
  /** 当前页切片（供 ResourceTable.data）。 */
  const pagedItems = computed(() => {
    const start = (clampedPage.value - 1) * state.pageSize
    return filteredWorkflows.value.slice(start, start + state.pageSize)
  })
  /** 选中项对应的 Workflow 行（供批量操作）。 */
  const selectedWorkflows = computed(() => {
    const set = new Set(selectedIds.value)
    return filteredWorkflows.value.filter((item) => set.has(String(item.id)))
  })
  const selectedCount = computed(() => selectedWorkflows.value.length)

  const stats = computed(() => ({
    all: workflowsStore.state.total,
    enabled: workflows.value.filter((workflow) => workflow.is_enabled).length,
    disabled: workflows.value.filter((workflow) => !workflow.is_enabled).length,
    broken: workflows.value.filter((workflow) => hasBrokenMember(workflow)).length,
  }))

  function showToast(message: string) {
    toast.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, 2600)
  }

  async function loadAll() {
    const request = ++loadRequest
    // 成员可用性要用 Agent 列表反查，因此与 Workflow 列表一并刷新。
    const [workflowsError, agentsError] = await Promise.all([
      workflowsStore.loadWorkflows(),
      agentsStore.loadAgents(),
    ])
    if (request === loadRequest) loadingError.value = workflowsError ?? agentsError ?? ''
  }

  function resetView() {
    loadRequest += 1
    reset()
    selectedId.value = null
    selectedIds.value = []
    pendingDelete.value = null
    togglingId.value = null
    batchBusy.value = false
    loadingError.value = ''
    toast.value = ''
    if (toastTimer) clearTimeout(toastTimer)
  }

  /** 批量操作的公共骨架：逐条串行调用 action，汇总成功/失败并保留失败项待重试。 */
  async function runBatch(
    ids: string[],
    action: (item: WorkflowResponse) => Promise<boolean>,
    successText: (n: number) => string,
  ): Promise<void> {
    if (batchBusy.value) return
    const targets = ids.map((id) => filteredWorkflows.value.find((item) => String(item.id) === id)).filter((item): item is WorkflowResponse => Boolean(item))
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
    if (!selectedWorkflows.value.length) return
    return runBatch(
      selectedIds.value,
      async (item) => (item.is_enabled ? true : toggleEnabled(item)),
      (n) => `已启用 ${n} 个 Workflow`,
    )
  }

  /** 批量停用：把选中项的 is_enabled 翻成 false。 */
  function batchDisable() {
    if (!selectedWorkflows.value.length) return
    return runBatch(
      selectedIds.value,
      async (item) => (item.is_enabled ? toggleEnabled(item) : true),
      (n) => `已停用 ${n} 个 Workflow`,
    )
  }

  /** 批量删除：逐条调用 removeWorkflow，成功数/失败数汇总。 */
  async function batchDelete() {
    if (batchBusy.value || !selectedWorkflows.value.length) return
    const targets = [...selectedWorkflows.value]
    batchBusy.value = true
    const failed: string[] = []
    let ok = 0
    try {
      for (const item of targets) {
        const error = await workflowsStore.removeWorkflow(item.id)
        if (error === undefined) continue
        if (error) { failed.push(String(item.id)) } else { ok += 1 }
      }
      if (failed.length) selectedIds.value = failed
      else selectedIds.value = []
      loadingError.value = ''
      if (failed.length) showToast(`已删除 ${ok} 个，失败 ${failed.length} 个（已保留选中可重试）`)
      else showToast(`已删除 ${ok} 个 Workflow`)
    } finally {
      batchBusy.value = false
    }
  }

  onBeforeUnmount(() => { if (toastTimer) clearTimeout(toastTimer) })

  /** 只翻转启用状态，其余字段与成员顺序原样回传（PATCH 提供 agents 即整体替换）。 */
  async function toggleEnabled(workflow: WorkflowResponse) {
    if (togglingId.value != null) return false
    const enabled = !workflow.is_enabled
    togglingId.value = workflow.id
    try {
      const result = await workflowsStore.saveWorkflow({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description ?? '',
        mode: workflow.mode,
        isEnabled: enabled,
        memberAgentIds: sortWorkflowMembers(workflow).map((member) => member.agent_id),
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
      if (togglingId.value === workflow.id) togglingId.value = null
    }
  }

  /** 打开删除确认框；目标对象存到 pendingDelete 由模板渲染确认。 */
  function requestDelete(workflow: WorkflowResponse) {
    pendingDelete.value = workflow
  }

  function cancelDelete() {
    pendingDelete.value = null
  }

  /** 确认后调用删除接口；失败把错误放到页面顶部，成功清除选中与确认框。 */
  async function confirmDelete() {
    if (!pendingDelete.value || deleting.value) return
    const target = pendingDelete.value
    const error = await workflowsStore.removeWorkflow(target.id)
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

  return {
    state,
    apply,
    reset,
    isDefault,
    workflows,
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
    selectedId,
    selectedIds,
    selectedCount,
    selectedWorkflows,
    pendingDelete,
    loadingError,
    toast,
    total,
    pageCount,
    clampedPage,
    pagedItems,
    filteredWorkflows,
    selectedWorkflow,
    stats,
    isMemberAvailable,
    hasBrokenMember,
    validateWorkflow,
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
