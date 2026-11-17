import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ApiError } from '@/http'
import {
  authorizeMcpServer,
  completeMcpOAuth,
  createMcpServer,
  deleteMcpServer,
  getMcpServerDetail,
  getMcpServerList,
  getMcpServerToolList,
  probeMcpServer,
  revokeMcpOAuth,
  updateMcpServer,
} from '@/http/mcp'
import type {
  McpOAuthCompleteRequest,
  McpProbeResponse,
  McpServerCreateRequest,
  McpServerResponse,
  McpServerUpdateRequest,
  McpToolResponse,
} from '@/interfaces/mcp/api'
import { useAuthStore } from './auth'

interface McpState {
  items: McpServerResponse[]
  loading: boolean
  saving: boolean
  deleting: boolean
  /** 正在切换启停 / 重新探测的 server id。 */
  togglingIds: number[]
  probingIds: number[]
  /** 工具快照按 server 缓存；探测、修改后失效。 */
  toolsByServer: Record<number, McpToolResponse[]>
  toolsLoadingIds: number[]
}

export type McpDetailResult =
  | { status: 'ok'; item: McpServerResponse }
  | { status: 'not-found' }
  | { status: 'error'; message: string }

export type SaveMcpServerInput =
  | { id?: undefined; create: McpServerCreateRequest }
  | { id: number; update: McpServerUpdateRequest }

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError && error.message ? error.message : fallback
}

export const useMcpStore = defineStore('mcp', () => {
  const authStore = useAuthStore()
  let dataGeneration = 0
  let listGeneration = 0
  const state = reactive<McpState>({
    items: [],
    loading: false,
    saving: false,
    deleting: false,
    togglingIds: [],
    probingIds: [],
    toolsByServer: {},
    toolsLoadingIds: [],
  })

  function contextChanged(generation: number, workspaceId: number | null) {
    return generation !== dataGeneration || workspaceId !== authStore.currentWorkspaceId
  }

  function invalidateListRequests() {
    listGeneration += 1
    state.loading = false
  }

  function upsertServer(server: McpServerResponse) {
    invalidateListRequests()
    const index = state.items.findIndex((item) => item.id === server.id)
    if (index >= 0) state.items[index] = server
    else state.items.unshift(server)
  }

  function forgetTools(serverId: number) {
    const next = { ...state.toolsByServer }
    delete next[serverId]
    state.toolsByServer = next
  }

  function resetMcp() {
    dataGeneration += 1
    listGeneration += 1
    state.items = []
    state.loading = false
    state.saving = false
    state.deleting = false
    state.togglingIds = []
    state.probingIds = []
    state.toolsByServer = {}
    state.toolsLoadingIds = []
  }

  async function loadServers(): Promise<string | null> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    const requestGeneration = ++listGeneration
    state.loading = true
    const stale = () => contextChanged(generation, workspaceId) || requestGeneration !== listGeneration
    try {
      const items = await getMcpServerList()
      if (stale()) return null
      state.items = items
      return null
    } catch (error) {
      if (stale()) return null
      state.items = []
      return errorMessage(error, 'MCP server 列表加载失败')
    } finally {
      if (!stale()) state.loading = false
    }
  }

  /** 只有后端明确 404 才算不存在；返回 undefined 表示请求期间切换了工作区。 */
  async function loadServerDetail(serverId: number): Promise<McpDetailResult | undefined> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    try {
      const detail = await getMcpServerDetail(serverId)
      if (contextChanged(generation, workspaceId)) return undefined
      upsertServer(detail)
      return { status: 'ok', item: detail }
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return undefined
      if (error instanceof ApiError && error.status === 404) return { status: 'not-found' }
      return { status: 'error', message: errorMessage(error, 'MCP server 加载失败') }
    }
  }

  /** 读工具快照；force 为 false 时命中缓存直接返回。 */
  async function loadTools(serverId: number, force = false): Promise<{ tools: McpToolResponse[]; error: string | null } | undefined> {
    const cached = state.toolsByServer[serverId]
    if (cached && !force) return { tools: cached, error: null }
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    state.toolsLoadingIds = [...state.toolsLoadingIds, serverId]
    try {
      const tools = await getMcpServerToolList(serverId)
      if (contextChanged(generation, workspaceId)) return undefined
      state.toolsByServer = { ...state.toolsByServer, [serverId]: tools }
      return { tools, error: null }
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return undefined
      return { tools: [], error: errorMessage(error, '工具清单加载失败') }
    } finally {
      if (!contextChanged(generation, workspaceId)) {
        state.toolsLoadingIds = state.toolsLoadingIds.filter((id) => id !== serverId)
      }
    }
  }

  /** 新建或修改；后端会先探测，失败时返回中文错误，表单保持不动。 */
  async function saveServer(input: SaveMcpServerInput): Promise<{ item: McpServerResponse | null; error: string | null }> {
    if (state.saving) return { item: null, error: 'MCP server 正在保存，请稍候' }
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    state.saving = true
    try {
      const saved = input.id == null
        ? (await createMcpServer(input.create)).server
        : await updateMcpServer(input.id, input.update)
      if (contextChanged(generation, workspaceId)) return { item: null, error: null }
      upsertServer(saved)
      forgetTools(saved.id)
      return { item: saved, error: null }
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return { item: null, error: null }
      return { item: null, error: errorMessage(error, input.id == null ? 'MCP server 创建失败' : 'MCP server 修改失败') }
    } finally {
      if (!contextChanged(generation, workspaceId)) state.saving = false
    }
  }

  function patchEnabledLocally(serverId: number, enabled: boolean) {
    const index = state.items.findIndex((item) => item.id === serverId)
    if (index >= 0) state.items[index] = { ...state.items[index]!, is_enabled: enabled }
  }

  /** 启停只提交 is_enabled，不触发探测；先改界面，失败回滚。 */
  async function setServerEnabled(serverId: number, enabled: boolean): Promise<string | null> {
    if (state.togglingIds.includes(serverId)) return null
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    const previous = state.items.find((item) => item.id === serverId)?.is_enabled ?? !enabled
    state.togglingIds = [...state.togglingIds, serverId]
    patchEnabledLocally(serverId, enabled)
    try {
      const updated = await updateMcpServer(serverId, { is_enabled: enabled })
      if (contextChanged(generation, workspaceId)) return null
      upsertServer(updated)
      forgetTools(serverId)
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return null
      patchEnabledLocally(serverId, previous)
      return errorMessage(error, enabled ? '启用失败' : '停用失败')
    } finally {
      if (!contextChanged(generation, workspaceId)) {
        state.togglingIds = state.togglingIds.filter((id) => id !== serverId)
      }
    }
  }

  async function removeServer(serverId: number): Promise<string | null | undefined> {
    if (state.deleting) return 'MCP server 正在删除，请稍候'
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    state.deleting = true
    try {
      await deleteMcpServer(serverId)
      if (contextChanged(generation, workspaceId)) return undefined
      invalidateListRequests()
      state.items = state.items.filter((item) => item.id !== serverId)
      forgetTools(serverId)
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return undefined
      return errorMessage(error, 'MCP server 删除失败')
    } finally {
      if (!contextChanged(generation, workspaceId)) state.deleting = false
    }
  }

  /** 重新探测；探测失败也会带回 server（last_probe_error 已更新），快照不变。 */
  async function probeServer(serverId: number): Promise<{ result: McpProbeResponse | null; error: string | null } | undefined> {
    if (state.probingIds.includes(serverId)) return { result: null, error: null }
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    state.probingIds = [...state.probingIds, serverId]
    try {
      const result = await probeMcpServer(serverId)
      if (contextChanged(generation, workspaceId)) return undefined
      upsertServer(result.server)
      if (result.ok) forgetTools(serverId)
      return { result, error: null }
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return undefined
      return { result: null, error: errorMessage(error, '探测失败') }
    } finally {
      if (!contextChanged(generation, workspaceId)) {
        state.probingIds = state.probingIds.filter((id) => id !== serverId)
      }
    }
  }

  /** 授权前半程：返回授权地址，由页面跳转。 */
  async function beginAuthorization(serverId: number): Promise<{ url: string | null; error: string | null }> {
    try {
      const { authorization_url: url } = await authorizeMcpServer(serverId)
      return { url, error: null }
    } catch (error) {
      return { url: null, error: errorMessage(error, '发起授权失败') }
    }
  }

  async function completeAuthorization(payload: McpOAuthCompleteRequest): Promise<{ item: McpServerResponse | null; error: string | null }> {
    try {
      const server = await completeMcpOAuth(payload)
      upsertServer(server)
      forgetTools(server.id)
      return { item: server, error: null }
    } catch (error) {
      return { item: null, error: errorMessage(error, '授权失败') }
    }
  }

  /** 撤销自己的授权后重读详情，刷新授权状态。 */
  async function revokeAuthorization(serverId: number): Promise<string | null | undefined> {
    const generation = dataGeneration
    const workspaceId = authStore.currentWorkspaceId
    try {
      await revokeMcpOAuth(serverId)
      if (contextChanged(generation, workspaceId)) return undefined
      const result = await loadServerDetail(serverId)
      if (result?.status === 'error') return `授权已撤销，但刷新状态失败：${result.message}`
      return null
    } catch (error) {
      if (contextChanged(generation, workspaceId)) return undefined
      return errorMessage(error, '撤销授权失败')
    }
  }

  return {
    state,
    resetMcp,
    loadServers,
    loadServerDetail,
    loadTools,
    saveServer,
    setServerEnabled,
    removeServer,
    probeServer,
    beginAuthorization,
    completeAuthorization,
    revokeAuthorization,
  }
})
