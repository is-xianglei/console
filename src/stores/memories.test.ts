import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { deleteMemory, getMemoryList } from '../http/memory'
import type { MemorySummary } from '../interfaces/memory/model'
import { useMemoriesStore } from './memories'

vi.mock('../http/memory', () => ({
  createMemory: vi.fn(),
  createMemoryPurgeConfirmation: vi.fn(),
  deleteMemory: vi.fn(),
  exportMemory: vi.fn(),
  getMemoryDetail: vi.fn(),
  getMemoryList: vi.fn(),
  purgeMemory: vi.fn(),
  rollbackMemoryDream: vi.fn(),
  searchMemory: vi.fn(),
  updateMemory: vi.fn(),
}))

function memory(id: number, name: string): MemorySummary {
  return {
    id,
    memory_key: `memory-${id}`,
    memory_type: 'project',
    name,
    description: `${name} description`,
    status: 'active',
    version: 1,
    superseded_by_id: null,
    source_kind: 'manual',
    last_used_at: null,
    use_count: 0,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('memories store 请求隔离', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('只应用最后一次列表请求的结果', async () => {
    const first = deferred<Awaited<ReturnType<typeof getMemoryList>>>()
    const second = deferred<Awaited<ReturnType<typeof getMemoryList>>>()
    vi.mocked(getMemoryList)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const store = useMemoriesStore()

    const firstLoad = store.loadMemories()
    const secondLoad = store.loadMemories()
    second.resolve({ items: [memory(2, 'new')], total: 1, limit: 100, offset: 0 })
    await secondLoad
    first.resolve({ items: [memory(1, 'old')], total: 1, limit: 100, offset: 0 })
    await firstLoad

    expect(store.state.items.map((item) => item.name)).toEqual(['new'])
    expect(store.state.loading).toBe(false)
  })

  it('工作区重置后忽略旧删除请求的响应', async () => {
    const pendingDelete = deferred<Awaited<ReturnType<typeof deleteMemory>>>()
    vi.mocked(deleteMemory).mockReturnValueOnce(pendingDelete.promise)
    const store = useMemoriesStore()
    store.state.items = [memory(1, 'old')]
    store.state.total = 1

    const deleting = store.deleteMemory(1, 1)
    store.resetMemories()
    store.state.items = [memory(2, 'new workspace')]
    store.state.total = 1
    pendingDelete.resolve({ id: 1, deleted: true, version: 2, catalog_version: 2 })
    await deleting

    expect(store.state.items.map((item) => item.name)).toEqual(['new workspace'])
    expect(store.state.total).toBe(1)
  })

  it('删除最后一页唯一一条后回退页码', async () => {
    vi.mocked(getMemoryList).mockResolvedValueOnce({ items: [memory(1, '唯一')], total: 1, limit: 50, offset: 50 })
    vi.mocked(deleteMemory).mockResolvedValueOnce({ id: 1, deleted: true, version: 2, catalog_version: 2 })
    const store = useMemoriesStore()
    // 先拉到第 2 页，仅含一条。
    await store.loadMemories({ page: 2, query: '', memoryType: 'all' })
    expect(store.state.page).toBe(2)
    expect(store.state.items).toHaveLength(1)

    const error = await store.deleteMemory(1, 1)

    expect(error).toBeNull()
    expect(store.state.items).toHaveLength(0)
    expect(store.state.total).toBe(0)
    // 页面因为无数据回退到上一页。
    expect(store.state.page).toBe(1)
  })
})
