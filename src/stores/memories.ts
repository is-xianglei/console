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
  }

  async function loadMemories(params?: GetMemoryListParams): Promise<string | null> {
    const generation = dataGeneration
    const requestId = ++listRequestId
    const isCurrent = () => generation === dataGeneration && requestId === listRequestId
    state.loading = true
    try {
      const response = state.query.trim()
        ? await searchMemory({
            query: state.query.trim(),
            memory_type: state.memoryType === 'all' ? undefined : state.memoryType,
            limit: params?.limit ?? 100,
          })
        : await getMemoryList({
            status: params?.status ?? 'active',
            memory_type: state.memoryType === 'all' ? undefined : state.memoryType,
            limit: params?.limit ?? 100,
            offset: params?.offset ?? 0,
          })
      if (!isCurrent()) return null
      state.items = response.items
      state.total = response.total
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
