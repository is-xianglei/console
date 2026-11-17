import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'
import { ApiError } from '@/http'
import {
  createTeamDefinition,
  deleteTeamDefinition,
  getTeamDefinitionDetail,
  getTeamDefinitionList,
  updateTeamDefinition,
} from '@/http/team-definition'
import type {
  TeamDefinitionCreateRequest,
  TeamDefinitionResponse,
  TeamDefinitionUpdateRequest,
} from '@/interfaces/team-definition/api'
import { useAuthStore } from './auth'

interface TeamsState {
  items: TeamDefinitionResponse[]
  total: number
  loading: boolean
  saving: boolean
  deleting: boolean
  /** 正在切换启停的 Team id。 */
  togglingIds: number[]
  /**
   * 会话头部、会话列表按 id 取名：列表里查不到时单独拉详情的结果。
   * null 表示后端已经没有这个 Team（已删除），界面显示「Team 已删除」。
   */
  names: Record<number, string | null>
}

export type TeamDetailResult =
  | { status: 'ok'; item: TeamDefinitionResponse }
  | { status: 'not-found' }
  | { status: 'error'; message: string }

export type SaveTeamInput =
  | { id?: undefined; create: TeamDefinitionCreateRequest }
  | { id: number; update: TeamDefinitionUpdateRequest }

/**
 * 保存失败的定位信息：表单据此标红字段或成员行，文案以后端为准。
 * memberIndexes 来自 422 的 loc，memberNames 来自重名 / 保留名，agentIds 来自 404「绑定的Agent不存在」。
 */
export interface TeamSaveError {
  message: string
  field: 'name' | 'members' | null
  memberIndexes: number[]
  memberNames: string[]
  agentIds: number[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : []
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError && error.message ? error.message : fallback
}

/** pydantic 的自定义校验错误带「Value error, 」前缀，展示时去掉。 */
function validationText(message: string) {
  return message.replace(/^Value error,\s*/, '')
}

/** 把后端错误映射成表单可用的定位信息；422 取第一条校验错误，成员错误前面加「第 N 个成员」。 */
export function teamSaveError(error: unknown, fallback: string): TeamSaveError {
  const result: TeamSaveError = { message: errorMessage(error, fallback), field: null, memberIndexes: [], memberNames: [], agentIds: [] }
  if (!(error instanceof ApiError)) return result
  const details = error.details ?? {}

  if (error.status === 409) {
    result.field = 'name'
    return result
  }
  if (error.status === 404 && Array.isArray(details.agent_ids)) {
    result.field = 'members'
    result.agentIds = numberList(details.agent_ids)
    return result
  }
  if (error.status !== 422) return result

  // 服务层的 422：保留名带 details.name，重名带 details.names。
  if (typeof details.name === 'string' || Array.isArray(details.names)) {
    result.field = 'members'
    result.memberNames = typeof details.name === 'string' ? [details.name] : stringList(details.names)
    return result
  }

  // 请求层的 422：details.errors 是 pydantic 错误列表，loc 形如 ['body', 'members', 1, 'name']。
  const first = Array.isArray(details.errors) ? details.errors.find(isRecord) : undefined
  if (!first) return result
  const loc = Array.isArray(first.loc) ? first.loc : []
  const text = typeof first.msg === 'string' ? validationText(first.msg) : result.message
  const fieldIndex = loc.indexOf('members')
  if (fieldIndex >= 0) {
    result.field = 'members'
    const index = loc[fieldIndex + 1]
    if (typeof index === 'number') {
      result.memberIndexes = [index]
      result.message = `第 ${index + 1} 个成员：${text}`
      return result
    }
    result.message = text
    return result
  }
  if (loc.includes('name')) result.field = 'name'
  result.message = text
  return result
}

async function getAllTeamPages() {
  const items: TeamDefinitionResponse[] = []
  let total: number
  do {
    const response = await getTeamDefinitionList({ limit: 100, offset: items.length })
    items.push(...response.items)
    total = response.total
    if (!response.items.length) break
  } while (items.length < total)
  return { items, total }
}

export const useTeamsStore = defineStore('teams', () => {
  const authStore = useAuthStore()
  let dataGeneration = 0
  let listGeneration = 0
  /** 正在拉详情取名的 id，避免会话列表同一 Team 并发请求多次。 */
  const resolvingNames = new Set<number>()
  const state = reactive<TeamsState>({
    items: [],
    total: 0,
    loading: false,
    saving: false,
    deleting: false,
    togglingIds: [],
    names: {},
  })

  /** 新建会话只能选启用的 Team。 */
  const enabledTeams = computed(() => state.items.filter((item) => item.is_enabled))

  /** 工作区切换或 reset 后，仍在途的请求结果一律丢弃。 */
  function contextChanged(generation: number, workspaceId: number | null) {
    return generation !== dataGeneration || workspaceId !== authStore.currentWorkspaceId
  }

  function invalidateListRequests() {
    listGeneration += 1
    state.loading = false
  }

  function upsertTeam(team: TeamDefinitionResponse) {
    invalidateListRequests()
    const index = state.items.findIndex((item) => item.id === team.id)
    if (index >= 0) state.items[index] = team
    else state.items.unshift(team)
    state.total = Math.max(state.total, state.items.length)
    state.names[team.id] = team.name
  }

  function resetTeams() {
    dataGeneration += 1
    listGeneration += 1
    resolvingNames.clear()
    state.items = []
    state.total = 0
    state.loading = false
    state.saving = false
    state.deleting = false
    state.togglingIds = []
    state.names = {}
  }

  async function loadTeams(): Promise<string | null> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    const requestGeneration = ++listGeneration
    state.loading = true
    try {
      const response = await getAllTeamPages()
      if (contextChanged(generation, workspaceId) || requestGeneration !== listGeneration) return null
      state.items = response.items
      state.total = response.total
      for (const item of response.items) state.names[item.id] = item.name
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId) || requestGeneration !== listGeneration) return null
      return errorMessage(error, 'Team 列表加载失败')
    } finally {
      if (!contextChanged(generation, workspaceId) && requestGeneration === listGeneration) state.loading = false
    }
  }

  /** 返回 undefined 表示上下文已切换，调用方直接放弃。 */
  async function loadTeamDetail(definitionId: number): Promise<TeamDetailResult | undefined> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    try {
      const detail = await getTeamDefinitionDetail(definitionId)
      if (contextChanged(generation, workspaceId)) return undefined
      upsertTeam(detail)
      return { status: 'ok', item: detail }
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return undefined
      if (error instanceof ApiError && error.status === 404) {
        state.names[definitionId] = null
        return { status: 'not-found' }
      }
      return { status: 'error', message: errorMessage(error, 'Team 详情加载失败') }
    }
  }

  /**
   * 会话标识用的名称：string 是名称，null 是已删除，undefined 是还不知道。
   * 列表里有就直接用；没有时由 resolveTeamName 拉一次详情补上。
   */
  function teamName(definitionId: number): string | null | undefined {
    const listed = state.items.find((item) => item.id === definitionId)
    if (listed) return listed.name
    return state.names[definitionId]
  }

  async function resolveTeamName(definitionId: number): Promise<void> {
    if (teamName(definitionId) !== undefined || resolvingNames.has(definitionId)) return
    resolvingNames.add(definitionId)
    try {
      // 网络等临时错误不记成「已删除」，下次再取。
      await loadTeamDetail(definitionId)
    } finally {
      resolvingNames.delete(definitionId)
    }
  }

  async function saveTeam(input: SaveTeamInput): Promise<{ item: TeamDefinitionResponse | null; error: TeamSaveError | null }> {
    const fallback = input.id == null ? 'Team 创建失败' : 'Team 更新失败'
    if (state.saving) return { item: null, error: teamSaveError(null, 'Team 正在保存，请稍候') }
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    invalidateListRequests()
    state.saving = true
    try {
      const saved = input.id == null
        ? await createTeamDefinition(input.create)
        : await updateTeamDefinition(input.id, input.update)
      if (contextChanged(generation, workspaceId)) return { item: null, error: null }
      upsertTeam(saved)
      return { item: saved, error: null }
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return { item: null, error: null }
      return { item: null, error: teamSaveError(error, fallback) }
    } finally {
      if (!contextChanged(generation, workspaceId)) state.saving = false
    }
  }

  /** 启停只改 is_enabled；停用后不能用来新建会话，已有会话不受影响。 */
  async function setTeamEnabled(definitionId: number, enabled: boolean): Promise<string | null> {
    if (state.togglingIds.includes(definitionId)) return null
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    state.togglingIds.push(definitionId)
    try {
      const saved = await updateTeamDefinition(definitionId, { is_enabled: enabled })
      if (contextChanged(generation, workspaceId)) return null
      upsertTeam(saved)
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return null
      return errorMessage(error, enabled ? 'Team 启用失败' : 'Team 停用失败')
    } finally {
      if (!contextChanged(generation, workspaceId)) {
        state.togglingIds = state.togglingIds.filter((id) => id !== definitionId)
      }
    }
  }

  /** 返回 undefined 表示上下文已切换。 */
  async function removeTeam(definitionId: number): Promise<string | null | undefined> {
    if (state.deleting) return 'Team 正在删除，请稍候'
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    invalidateListRequests()
    state.deleting = true
    try {
      await deleteTeamDefinition(definitionId)
      if (contextChanged(generation, workspaceId)) return undefined
      state.items = state.items.filter((item) => item.id !== definitionId)
      state.total = Math.max(0, state.total - 1)
      state.names[definitionId] = null
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return undefined
      return errorMessage(error, 'Team 删除失败')
    } finally {
      if (!contextChanged(generation, workspaceId)) state.deleting = false
    }
  }

  return {
    state,
    enabledTeams,
    resetTeams,
    loadTeams,
    loadTeamDetail,
    teamName,
    resolveTeamName,
    saveTeam,
    setTeamEnabled,
    removeTeam,
  }
})
