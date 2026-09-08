import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { MemoryDetail, MemoryStatus, MemoryType } from '@/interfaces/memory/model'
import { useMemoriesStore } from '@/stores/memories'
import { useMemoryEditor } from './useMemoryEditor'

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}))

function detail(
  id: number,
  name: string,
  memoryType: MemoryType = 'project',
  status: MemoryStatus = 'active',
): MemoryDetail {
  return {
    id,
    memory_key: `memory-${id}`,
    memory_type: memoryType,
    name,
    description: `${name} description`,
    status,
    version: 3,
    superseded_by_id: null,
    source_kind: 'manual',
    last_used_at: null,
    use_count: 2,
    body: `${name} 正文`,
    catalog_version: 12,
    revisions: [],
    sources: [],
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-02T00:00:00Z',
  }
}

describe('useMemoryEditor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useMemoriesStore()
    store.selectMemory = vi.fn().mockResolvedValue(null)
    store.createMemory = vi.fn().mockResolvedValue(null)
    store.updateMemory = vi.fn().mockResolvedValue(null)
    store.deleteMemory = vi.fn().mockResolvedValue(null)
  })

  it('openCreate(空) 建立空草稿', async () => {
    const editor = useMemoryEditor()
    await editor.openCreate()
    expect(editor.draft.value.id).toBeNull()
    expect(editor.draft.value.name).toBe('')
    expect(editor.draft.value.memoryKey).toBe('')
    expect(editor.draft.value.memoryType).toBe('user')
  })

  it('openCreate(sourceId) 复制源 Memory 为副本草稿', async () => {
    const store = useMemoriesStore()
    ;(store.selectMemory as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    store.state.detail = detail(5, '故障诊断')
    const editor = useMemoryEditor()
    await editor.openCreate(5)
    expect(editor.draft.value.id).toBeNull()
    expect(editor.draft.value.name).toBe('故障诊断 副本')
    expect(editor.draft.value.version).toBe(0)
  })

  it('openEdit(id) 拉详情转表单模型', async () => {
    const store = useMemoriesStore()
    ;(store.selectMemory as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    store.state.detail = detail(5, '故障诊断')
    const editor = useMemoryEditor()
    const ok = await editor.openEdit(5)
    expect(ok).toBe(true)
    expect(editor.draft.value.id).toBe(5)
    expect(editor.draft.value.version).toBe(3)
    expect(editor.draft.value.memoryKey).toBe('memory-5')
  })

  it('openEdit 详情缺失时返回 false 并设置错误', async () => {
    const store = useMemoriesStore()
    ;(store.selectMemory as ReturnType<typeof vi.fn>).mockResolvedValue('Memory 详情加载失败')
    const editor = useMemoryEditor()
    const ok = await editor.openEdit(5)
    expect(ok).toBe(false)
    expect(editor.error.value).toContain('加载失败')
  })

  it('saveDraft 校验失败不提交', async () => {
    const store = useMemoriesStore()
    const createMock = (store.createMemory as ReturnType<typeof vi.fn>)
    const editor = useMemoryEditor()
    await editor.openCreate()
    editor.draft.value.name = '   '
    const ok = await editor.saveDraft()
    expect(ok).toBe(false)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('saveDraft 新建成功跳详情页', async () => {
    const store = useMemoriesStore()
    store.createMemory = vi.fn().mockImplementation(async () => {
      store.state.detail = detail(5, '故障诊断')
      return null
    })
    const editor = useMemoryEditor()
    await editor.openCreate()
    editor.draft.value.memoryKey = 'fault-diagnosis'
    editor.draft.value.name = '故障诊断'
    editor.draft.value.description = '诊断规则'
    editor.draft.value.body = '依据证据分析。'
    const ok = await editor.saveDraft()
    expect(ok).toBe(true)
    expect(routerPush).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'memory-detail', params: { id: '5' } }),
    )
  })

  it('saveDraft 编辑成功携带 version 提交', async () => {
    const store = useMemoriesStore()
    const updateMock = (store.updateMemory as ReturnType<typeof vi.fn>)
    updateMock.mockImplementation(async () => {
      store.state.detail = detail(5, '故障诊断')
      return null
    })
    const editor = useMemoryEditor()
    store.state.detail = detail(5, '故障诊断')
    const ok = await editor.openEdit(5)
    expect(ok).toBe(true)
    const saved = await editor.saveDraft()
    expect(saved).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(5, expect.objectContaining({ version: 3 }))
  })

  it('removeDetail 成功后回列表', async () => {
    const editor = useMemoryEditor()
    const ok = await editor.removeDetail(5, 3)
    expect(ok).toBe(true)
    expect(routerPush).toHaveBeenCalledWith(expect.objectContaining({ name: 'memories' }))
  })
})
