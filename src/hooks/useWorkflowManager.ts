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

/** 名称长度上限，与后端 Schema 约束一致。 */
export const MAX_WORKFLOW_NAME_LENGTH = 128

/** 成员 Agent 已被软删除（agent_name 为 null）时的展示名。 */
export const DELETED_AGENT_LABEL = '已删除的 Agent'

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
  const search = ref('')
  const enabledFilter = ref<'all' | 'enabled' | 'disabled'>('all')
  const modeFilter = ref<'all' | WorkflowMode>('all')
  const selectedId = ref<number | null>(null)
  const pendingDelete = ref<WorkflowResponse | null>(null)
  /** 正在启停的 Workflow ID，供列表只在对应行展示 loading。 */
  const togglingId = ref<number | null>(null)
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
    const query = search.value.trim().toLowerCase()
    return workflows.value.filter((workflow) => {
      const enabledMatches = enabledFilter.value === 'all'
        || (enabledFilter.value === 'enabled' ? workflow.is_enabled : !workflow.is_enabled)
      const modeMatches = modeFilter.value === 'all' || workflow.mode === modeFilter.value
      const searchText = [
        workflow.id,
        workflow.name,
        workflow.description ?? '',
        workflow.mode,
        WORKFLOW_MODE_LABEL[workflow.mode],
        ...workflow.agents.map((member) => member.agent_name ?? ''),
      ].join(' ').toLowerCase()
      return enabledMatches && modeMatches && (!query || searchText.includes(query))
    })
  })
  const selectedWorkflow = computed(
    () => workflows.value.find((workflow) => workflow.id === selectedId.value) ?? null,
  )
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
    selectedId.value = null
    pendingDelete.value = null
    togglingId.value = null
    loadingError.value = ''
    toast.value = ''
    if (toastTimer) clearTimeout(toastTimer)
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
    workflows,
    agents,
    loading,
    saving,
    deleting,
    togglingId,
    search,
    enabledFilter,
    modeFilter,
    selectedId,
    pendingDelete,
    loadingError,
    toast,
    filteredWorkflows,
    selectedWorkflow,
    stats,
    isMemberAvailable,
    hasBrokenMember,
    validateWorkflow,
    showToast,
    loadAll,
    toggleEnabled,
    requestDelete,
    confirmDelete,
    cancelDelete,
    resetView,
  }
}
