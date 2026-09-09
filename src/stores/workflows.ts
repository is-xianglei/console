import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ApiError } from '@/http'
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflowDetail,
  getWorkflowList,
  updateWorkflow,
} from '@/http/workflow'
import type {
  WorkflowCreateRequest,
  WorkflowMode,
  WorkflowResponse,
} from '@/interfaces/workflow/api'
import { useAuthStore } from './auth'

interface WorkflowsState {
  items: WorkflowResponse[]
  total: number
  loading: boolean
  saving: boolean
  deleting: boolean
  /** E-2 服务端分页专用状态；默认不启用，列表仍走全量拉取 + 前端分页（prd A-6）。 */
  pageState: {
    items: WorkflowResponse[]
    total: number
  }
}

/** 保存 Workflow 的输入；成员按数组顺序提交，sort_order 取数组下标。 */
export interface SaveWorkflowInput {
  id?: number | null
  name: string
  description: string
  mode: WorkflowMode
  isEnabled: boolean
  memberAgentIds: number[]
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

async function getAllWorkflowPages() {
  const items: WorkflowResponse[] = []
  let total: number
  do {
    const response = await getWorkflowList({ limit: 100, offset: items.length })
    items.push(...response.items)
    total = response.total
    if (!response.items.length) break
  } while (items.length < total)
  return { items, total }
}

/** 由表单输入构造后端载荷；更新与创建共用同一形状（PATCH 提供 agents 即整体替换）。 */
function buildWorkflowPayload(input: SaveWorkflowInput): WorkflowCreateRequest {
  return {
    name: input.name.trim(),
    description: input.description.trim() || null,
    mode: input.mode,
    is_enabled: input.isEnabled,
    agents: input.memberAgentIds.map((agentId, index) => ({ agent_id: agentId, sort_order: index })),
  }
}

export const useWorkflowsStore = defineStore('workflows', () => {
  const authStore = useAuthStore()
  let dataGeneration = 0
  let listGeneration = 0
  const state = reactive<WorkflowsState>({
    items: [],
    total: 0,
    loading: false,
    saving: false,
    deleting: false,
    pageState: {
      items: [],
      total: 0,
    },
  })

  /** 工作区切换或 reset 后，仍在途的请求结果一律丢弃，避免写入错误工作区的数据。 */
  function contextChanged(generation: number, workspaceId: number | null) {
    return generation !== dataGeneration || workspaceId !== authStore.currentWorkspaceId
  }

  function invalidateListRequests() {
    listGeneration += 1
    state.loading = false
  }

  function upsertWorkflow(workflow: WorkflowResponse) {
    invalidateListRequests()
    const index = state.items.findIndex((item) => item.id === workflow.id)
    if (index >= 0) state.items[index] = workflow
    else state.items.unshift(workflow)
    state.total = Math.max(state.total, state.items.length)
  }

  function resetWorkflows() {
    dataGeneration += 1
    listGeneration += 1
    state.items = []
    state.total = 0
    state.loading = false
    state.saving = false
    state.deleting = false
    state.pageState.items = []
    state.pageState.total = 0
  }

  async function loadWorkflows(): Promise<string | null> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    const requestGeneration = ++listGeneration
    state.loading = true
    try {
      const response = await getAllWorkflowPages()
      if (contextChanged(generation, workspaceId) || requestGeneration !== listGeneration) return null
      state.items = response.items
      state.total = response.total
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId) || requestGeneration !== listGeneration) return null
      state.items = []
      state.total = 0
      return errorMessage(error, 'Workflow 列表加载失败')
    } finally {
      if (!contextChanged(generation, workspaceId) && requestGeneration === listGeneration) {
        state.loading = false
      }
    }
  }

  /** 返回 undefined 表示上下文已切换，调用方应直接放弃本次结果。 */
  async function loadWorkflowDetail(workflowId: number): Promise<WorkflowResponse | null | undefined> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    try {
      const detail = await getWorkflowDetail(workflowId)
      if (contextChanged(generation, workspaceId)) return undefined
      upsertWorkflow(detail)
      return detail
    } catch {
      if (contextChanged(generation, workspaceId)) return undefined
      return null
    }
  }

  /**
   * E-2 服务端分页（可选，默认不启用）：与 groups.loadPage 同款样板，单接口拉一页写入
   * pageState，generation 计数丢弃旧响应。默认不启用——prd A-6 本阶段保留全量拉取 +
   * 前端分页（chat 工作台依赖全量 items），当单资源超过 500 条时再切换。
   */
  async function loadPage(params: {
    limit?: number
    offset?: number
    keyword?: string | null
    is_enabled?: boolean | null
  } = {}): Promise<string | null> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    const requestGeneration = ++listGeneration
    state.loading = true
    try {
      const response = await getWorkflowList({
        keyword: params.keyword ?? undefined,
        is_enabled: params.is_enabled ?? undefined,
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
      })
      if (contextChanged(generation, workspaceId) || requestGeneration !== listGeneration) return null
      state.pageState.items = response.items
      state.pageState.total = response.total
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId) || requestGeneration !== listGeneration) return null
      state.pageState.items = []
      state.pageState.total = 0
      return errorMessage(error, 'Workflow 列表加载失败')
    } finally {
      if (!contextChanged(generation, workspaceId) && requestGeneration === listGeneration) {
        state.loading = false
      }
    }
  }

  async function saveWorkflow(
    input: SaveWorkflowInput,
  ): Promise<{ item: WorkflowResponse | null; error: string | null }> {
    if (state.saving) return { item: null, error: 'Workflow 正在保存，请稍候' }
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    invalidateListRequests()
    state.saving = true
    const payload = buildWorkflowPayload(input)
    try {
      const saved = input.id == null
        ? await createWorkflow(payload)
        : await updateWorkflow(input.id, payload)
      if (contextChanged(generation, workspaceId)) return { item: null, error: null }
      upsertWorkflow(saved)
      return { item: saved, error: null }
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return { item: null, error: null }
      // 保存失败后重拉列表，把本地乐观状态回滚到服务端真实状态。
      await loadWorkflows()
      if (contextChanged(generation, workspaceId)) return { item: null, error: null }
      return {
        item: null,
        error: errorMessage(error, input.id == null ? 'Workflow 创建失败' : 'Workflow 更新失败'),
      }
    } finally {
      if (!contextChanged(generation, workspaceId)) state.saving = false
    }
  }

  async function removeWorkflow(workflowId: number): Promise<string | null | undefined> {
    if (state.deleting) return 'Workflow 正在删除，请稍候'
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    invalidateListRequests()
    state.deleting = true
    try {
      await deleteWorkflow(workflowId)
      if (contextChanged(generation, workspaceId)) return undefined
      invalidateListRequests()
      state.items = state.items.filter((item) => item.id !== workflowId)
      state.total = Math.max(0, state.total - 1)
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return undefined
      return errorMessage(error, 'Workflow 删除失败')
    } finally {
      if (!contextChanged(generation, workspaceId)) state.deleting = false
    }
  }

  return {
    state,
    resetWorkflows,
    loadWorkflows,
    loadPage,
    loadWorkflowDetail,
    saveWorkflow,
    removeWorkflow,
  }
})
