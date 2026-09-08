import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ApiError } from '@/http'
import {
  createMemory,
  createMemoryPurgeConfirmation,
  deleteMemory,
  exportMemory,
  getMemoryDetail,
  getMemoryList,
  purgeMemory,
  rollbackMemoryDream,
  searchMemory,
  updateMemory,
} from '@/http/memory'
import type {
  CreateMemoryRequest,
  ExportMemoryResponse,
  GetMemoryListParams,
  MemoryPurgeConfirmationResponse,
  PurgeMemoryResponse,
  RollbackMemoryDreamResponse,
  UpdateMemoryRequest,
} from '@/interfaces/memory/api'
import type { MemoryDetail, MemorySummary, MemoryType } from '@/interfaces/memory/model'

interface MemoriesState {
  items: MemorySummary[]
  total: number
  loading: boolean
  selectedId: number | null
  detail: MemoryDetail | null
  detailLoading: boolean
  saving: boolean
  query: string
  memoryType: MemoryType | 'all'
  /** 当前页码（从 1 开始）。列表用真分页,每次只拉一页。 */
  page: number
  /** 每页条数。列表页真分页时传给 ResourcePagination。 */
  pageSize: number
}

export const useMemoriesStore = defineStore('memories', () => {
  let dataGeneration = 0
  let listRequestId = 0
  const state = reactive<MemoriesState>({
    items: [],
    total: 0,
    loading: false,
    selectedId: null,
    detail: null,
    detailLoading: false,
    saving: false,
    query: '',
    memoryType: 'all',
    page: 1,
    pageSize: 50,
  })

  function resetMemories() {
    dataGeneration += 1
    listRequestId += 1
    state.items = []
    state.total = 0
    state.loading = false
    state.selectedId = null
    state.detail = null
    state.detailLoading = false
    state.saving = false
    state.query = ''
    state.memoryType = 'all'
    state.page = 1
    state.pageSize = 50
  }

  /**
   * 加载 Memory 列表。传入 page 时用真分页（按 offset = (page-1)*pageSize 拉取）;
   * 搜索态后端不支持 offset,退化为按 limit 单次拉取。缺省用当前 state.page/pageSize。
   */
  async function loadMemories(params?: GetMemoryListParams & { page?: number }): Promise<string | null> {
    const generation = dataGeneration
    const requestId = ++listRequestId
    const isCurrent = () => generation === dataGeneration && requestId === listRequestId
    state.loading = true
    const page = Math.max(1, params?.page ?? state.page)
    const pageSize = Math.max(1, state.pageSize)
    try {
      const response = state.query.trim()
        ? await searchMemory({
            query: state.query.trim(),
            memory_type: state.memoryType === 'all' ? undefined : state.memoryType,
            limit: pageSize,
          })
        : await getMemoryList({
            status: params?.status ?? 'active',
            memory_type: state.memoryType === 'all' ? undefined : state.memoryType,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          })
      if (!isCurrent()) return null
      state.items = response.items
      state.total = response.total
      state.page = page
      if (state.selectedId && !response.items.some((item) => item.id === state.selectedId)) {
        state.selectedId = null
        state.detail = null
      }
      return null
    } catch (error) {
      if (!isCurrent()) return null
      state.items = []
      state.total = 0
      return error instanceof Error ? error.message : 'Memory 列表加载失败'
    } finally {
      if (isCurrent()) state.loading = false
    }
  }

  /** 切换到指定页并重载；用于 ResourcePagination 翻页。 */
  async function loadMemoriesPage(page: number): Promise<string | null> {
    if (page < 1 || page === state.page) return null
    state.page = page
    return loadMemories({ page })
  }

  /** 修改每页条数并回到第 1 页。 */
  function setPageSize(pageSize: number): void {
    state.pageSize = Math.max(1, pageSize)
    state.page = 1
  }

  async function selectMemory(id: number): Promise<string | null> {
    const generation = dataGeneration
    state.selectedId = id
    state.detail = null
    state.detailLoading = true
    try {
      const detail = await getMemoryDetail(id)
      if (generation === dataGeneration && state.selectedId === id) state.detail = detail
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Memory 详情加载失败'
    } finally {
      if (generation === dataGeneration && state.selectedId === id) state.detailLoading = false
    }
  }

  function clearSelection() {
    state.selectedId = null
    state.detail = null
    state.detailLoading = false
  }

  async function createMemoryAction(payload: CreateMemoryRequest): Promise<string | null> {
    const generation = dataGeneration
    state.saving = true
    try {
      const detail = await createMemory(payload)
      if (generation !== dataGeneration) return null
      await loadMemories()
      state.selectedId = detail.id
      state.detail = detail
      return null
    } catch (error) {
      return error instanceof ApiError ? error.message : 'Memory 创建失败'
    } finally {
      if (generation === dataGeneration) state.saving = false
    }
  }

  async function updateMemoryAction(
    id: number,
    payload: UpdateMemoryRequest,
  ): Promise<string | null> {
    const generation = dataGeneration
    state.saving = true
    try {
      const detail = await updateMemory(id, payload)
      if (generation !== dataGeneration) return null
      state.detail = detail
      const index = state.items.findIndex((item) => item.id === id)
      if (index >= 0) state.items[index] = detail
      return null
    } catch (error) {
      return error instanceof ApiError ? error.message : 'Memory 保存失败'
    } finally {
      if (generation === dataGeneration) state.saving = false
    }
  }

  async function deleteMemoryAction(id: number, version: number): Promise<string | null> {
    const generation = dataGeneration
    try {
      await deleteMemory(id, { version })
      if (generation !== dataGeneration) return null
      state.items = state.items.filter((item) => item.id !== id)
      state.total = Math.max(0, state.total - 1)
      if (state.selectedId === id) {
        state.selectedId = null
        state.detail = null
      }
      return null
    } catch (error) {
      return error instanceof ApiError ? error.message : 'Memory 删除失败'
    }
  }

  async function exportMemoryAction(): Promise<ExportMemoryResponse> {
    return exportMemory()
  }

  async function getPurgeConfirmation(): Promise<MemoryPurgeConfirmationResponse> {
    return createMemoryPurgeConfirmation()
  }

  async function purgeMemoryAction(
    confirmation: MemoryPurgeConfirmationResponse,
  ): Promise<PurgeMemoryResponse> {
    const generation = dataGeneration
    const result = await purgeMemory({
      confirmation_token: confirmation.confirmation_token,
      expected_catalog_version: confirmation.expected_catalog_version,
    })
    if (generation === dataGeneration) resetMemories()
    return result
  }

  async function rollbackMemoryDreamAction(
    dreamJobId: string,
    expectedCatalogVersion: number,
  ): Promise<RollbackMemoryDreamResponse> {
    const result = await rollbackMemoryDream(dreamJobId, {
      expected_after_catalog_version: expectedCatalogVersion,
    })
    await loadMemories()
    return result
  }

  return {
    state,
    resetMemories,
    loadMemories,
    loadMemoriesPage,
    setPageSize,
    selectMemory,
    clearSelection,
    createMemory: createMemoryAction,
    updateMemory: updateMemoryAction,
    deleteMemory: deleteMemoryAction,
    exportMemory: exportMemoryAction,
    getPurgeConfirmation,
    purgeMemory: purgeMemoryAction,
    rollbackMemoryDream: rollbackMemoryDreamAction,
  }
})
