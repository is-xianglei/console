import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ApiError } from '@/http'
import {
  createPlan,
  deletePlan,
  getPlanDetail,
  getPlanList,
  updatePlan,
} from '@/http/orchestration-plan'
import type {
  PlanCreateRequest,
  PlanMemberRequest,
  PlanMode,
  PlanResponse,
} from '@/interfaces/orchestration-plan/api'
import { useAuthStore } from './auth'

interface OrchestrationPlansState {
  items: PlanResponse[]
  total: number
  loading: boolean
  saving: boolean
  deleting: boolean
  /** E-2 服务端分页专用状态；默认不启用，列表仍走全量拉取 + 前端分页（prd A-6）。 */
  pageState: {
    items: PlanResponse[]
    total: number
  }
}

/** 保存方案的输入；成员按数组顺序提交，position 由后端依序生成。 */
export interface SavePlanInput {
  id?: number
  name: string
  description: string
  mode: PlanMode
  maxIterations: number
  fallback: string
  isEnabled: boolean
  members: Array<{ agentId: number; routeKey: string; when: string }>
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

async function getAllPlanPages() {
  const items: PlanResponse[] = []
  let total: number
  do {
    const response = await getPlanList({ limit: 100, offset: items.length })
    items.push(...response.items)
    total = response.total
    if (!response.items.length) break
  } while (items.length < total)
  return { items, total }
}

/** 由表单输入构造后端载荷；routing 模式才携带 route_key/when 与 fallback。 */
function buildPlanPayload(input: SavePlanInput): PlanCreateRequest {
  const members: PlanMemberRequest[] = input.members.map((member) => ({
    agent_id: member.agentId,
    role_config: input.mode === 'routing'
      ? { route_key: member.routeKey.trim(), when: member.when.trim() }
      : {},
  }))
  const config: Record<string, unknown> = {}
  if (input.mode === 'loop') config.max_iterations = input.maxIterations
  if (input.mode === 'routing' && input.fallback.trim()) config.fallback = input.fallback.trim()
  return {
    name: input.name,
    description: input.description || null,
    mode: input.mode,
    config,
    is_enabled: input.isEnabled,
    members,
  }
}

export const useOrchestrationPlansStore = defineStore('orchestrationPlans', () => {
  const authStore = useAuthStore()
  let dataGeneration = 0
  let planListGeneration = 0
  const state = reactive<OrchestrationPlansState>({
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

  function contextChanged(generation: number, workspaceId: number | null) {
    return generation !== dataGeneration || workspaceId !== authStore.currentWorkspaceId
  }

  function invalidatePlanListRequests() {
    planListGeneration += 1
    state.loading = false
  }

  function upsertPlan(plan: PlanResponse) {
    invalidatePlanListRequests()
    const index = state.items.findIndex((item) => item.id === plan.id)
    if (index >= 0) state.items[index] = plan
    else state.items.unshift(plan)
    state.total = Math.max(state.total, state.items.length)
  }

  function resetPlans() {
    dataGeneration += 1
    planListGeneration += 1
    state.items = []
    state.total = 0
    state.loading = false
    state.saving = false
    state.deleting = false
    state.pageState.items = []
    state.pageState.total = 0
  }

  async function loadPlans(): Promise<string | null> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    const listGeneration = ++planListGeneration
    state.loading = true
    try {
      const response = await getAllPlanPages()
      if (contextChanged(generation, workspaceId) || listGeneration !== planListGeneration) return null
      state.items = response.items
      state.total = response.total
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId) || listGeneration !== planListGeneration) return null
      state.items = []
      state.total = 0
      return errorMessage(error, '编排方案列表加载失败')
    } finally {
      if (!contextChanged(generation, workspaceId) && listGeneration === planListGeneration) {
        state.loading = false
      }
    }
  }

  async function loadPlanDetail(planId: number): Promise<PlanResponse | null | undefined> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    try {
      const detail = await getPlanDetail(planId)
      if (contextChanged(generation, workspaceId)) return undefined
      upsertPlan(detail)
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
   * 存储的是 rawPage 字段，不影响加载器加载方式。
   */
  async function loadPage(params: {
    limit?: number
    offset?: number
    keyword?: string | null
    is_enabled?: boolean | null
  } = {}): Promise<string | null> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    const listGeneration = ++planListGeneration
    state.loading = true
    try {
      const response = await getPlanList({
        keyword: params.keyword ?? undefined,
        is_enabled: params.is_enabled ?? undefined,
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
      })
      if (contextChanged(generation, workspaceId) || listGeneration !== planListGeneration) return null
      state.pageState.items = response.items
      state.pageState.total = response.total
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId) || listGeneration !== planListGeneration) return null
      state.pageState.items = []
      state.pageState.total = 0
      return errorMessage(error, '编排方案列表加载失败')
    } finally {
      if (!contextChanged(generation, workspaceId) && listGeneration === planListGeneration) {
        state.loading = false
      }
    }
  }

  async function savePlan(input: SavePlanInput): Promise<{ item: PlanResponse | null; error: string | null }> {
    if (state.saving) return { item: null, error: '编排方案正在保存，请稍候' }
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    invalidatePlanListRequests()
    state.saving = true
    const payload = buildPlanPayload(input)

    try {
      const saved = input.id == null
        ? await createPlan(payload)
        : await updatePlan(input.id, payload)
      if (contextChanged(generation, workspaceId)) return { item: null, error: null }
      upsertPlan(saved)
      return { item: saved, error: null }
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return { item: null, error: null }
      await loadPlans()
      if (contextChanged(generation, workspaceId)) return { item: null, error: null }
      return { item: null, error: errorMessage(error, input.id ? '编排方案更新失败' : '编排方案创建失败') }
    } finally {
      if (!contextChanged(generation, workspaceId)) state.saving = false
    }
  }

  async function removePlan(planId: number): Promise<string | null | undefined> {
    if (state.deleting) return '编排方案正在删除，请稍候'
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    invalidatePlanListRequests()
    state.deleting = true
    try {
      await deletePlan(planId)
      if (contextChanged(generation, workspaceId)) return undefined
      invalidatePlanListRequests()
      state.items = state.items.filter((item) => item.id !== planId)
      state.total = Math.max(0, state.total - 1)
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return undefined
      return errorMessage(error, '编排方案删除失败')
    } finally {
      if (!contextChanged(generation, workspaceId)) state.deleting = false
    }
  }

  return {
    state,
    resetPlans,
    loadPlans,
    loadPage,
    loadPlanDetail,
    savePlan,
    removePlan,
  }
})
