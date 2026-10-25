import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { GroupResponse } from '@/interfaces/group/model'
import { useGroupsStore } from '@/stores/groups'
import { emptyGroupForm, groupFormToPayload, groupToForm, useGroupEditor, validateGroup } from './useGroupEditor'

// 编辑器已不依赖路由；保留 router mock 只为断言「保存后不跳转」。
const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}))

const toastAdd = vi.fn()
vi.mock('@nuxt/ui/composables', () => ({
  useToast: () => ({ add: toastAdd }),
}))

function group(): GroupResponse {
  return {
    id: 7,
    workspace_id: 3,
    name: '设备协作组',
    slug: 'device-team',
    description: '跨部门设备协作',
    group_type: 'team',
    created_by: 11,
    owner_id: 11,
    visibility: 'workspace',
    join_mode: 'approval',
    is_active: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  }
}

type Mock = ReturnType<typeof vi.fn>

describe('useGroupEditor', () => {
  beforeEach(() => {
    routerPush.mockReset()
    toastAdd.mockReset()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    setActivePinia(createPinia())
    const store = useGroupsStore()
    // 无 token 时编辑器回退到 store.state.workspaceId；预置列表使 ensureCatalog 不再触发加载。
    store.state.workspaceId = 3
    store.state.items = [group()]
    store.loadGroups = vi.fn(async () => null)
    store.selectGroup = vi.fn(async () => null)
    store.saveGroup = vi.fn(async () => null)
  })

  it('纯函数：groupToForm / validateGroup / groupFormToPayload', () => {
    const form = groupToForm(group())
    expect(form.slug).toBe('device-team')
    expect(form.joinMode).toBe('approval')
    expect(validateGroup(form)).toEqual([])
    const empty = emptyGroupForm()
    expect(validateGroup(empty).map((issue) => issue.field)).toEqual(['name', 'slug'])
    expect(validateGroup({ ...empty, name: 'x', slug: 'Bad Slug' }).map((issue) => issue.field)).toEqual(['slug'])
    // 新建不带 is_active，编辑才附带。
    expect(groupFormToPayload({ ...empty, name: 'A', slug: 'a' })).not.toHaveProperty('is_active')
    expect(groupFormToPayload({ ...form, isActive: false })).toMatchObject({ is_active: false, description: '跨部门设备协作' })
  })

  it('openCreate 建立空草稿', async () => {
    const editor = useGroupEditor()
    await editor.openCreate()
    expect(editor.draft.value.id).toBeNull()
    expect(editor.draft.value.name).toBe('')
    expect(editor.draft.value.groupType).toBe('team')
    expect(editor.loadingDetail.value).toBe(false)
  })

  it('openEdit 先 selectGroup 再填 draft', async () => {
    const store = useGroupsStore()
    ;(store.selectGroup as Mock).mockImplementation(async () => {
      store.state.selectedId = 7
      store.state.detail = group()
      return null
    })
    const editor = useGroupEditor()
    const ok = await editor.openEdit(7)
    expect(ok).toBe(true)
    expect(store.selectGroup).toHaveBeenCalledWith(7)
    expect(editor.draft.value.id).toBe(7)
    expect(editor.draft.value.slug).toBe('device-team')
  })

  it('openEdit 详情失败时返回 false 并设置错误', async () => {
    const store = useGroupsStore()
    ;(store.selectGroup as Mock).mockResolvedValue('群组详情加载失败')
    const editor = useGroupEditor()
    const ok = await editor.openEdit(7)
    expect(ok).toBe(false)
    expect(editor.error.value).toContain('加载失败')
  })

  it('saveDraft 校验不通过不提交', async () => {
    const store = useGroupsStore()
    const editor = useGroupEditor()
    await editor.openCreate()
    editor.draft.value.name = '  '
    editor.draft.value.slug = 'ok-slug'
    expect(await editor.saveDraft()).toBe(false)
    editor.draft.value.name = '新组'
    editor.draft.value.slug = 'Bad_Slug'
    expect(await editor.saveDraft()).toBe(false)
    expect(store.saveGroup).not.toHaveBeenCalled()
  })

  it('saveDraft 新建成功：toast + onSaved(新 id)，不跳转路由', async () => {
    const store = useGroupsStore()
    ;(store.saveGroup as Mock).mockImplementation(async () => {
      store.state.selectedId = 9
      store.state.detail = { ...group(), id: 9, name: '质量协作组', slug: 'quality' }
      return null
    })
    const onSaved = vi.fn()
    const editor = useGroupEditor()
    await editor.openCreate()
    editor.draft.value.name = '质量协作组'
    editor.draft.value.slug = 'quality'
    editor.draft.value.joinMode = 'open'
    const ok = await editor.saveDraft({ onSaved })
    expect(ok).toBe(true)
    expect(store.saveGroup).toHaveBeenCalledWith(
      expect.objectContaining({ name: '质量协作组', slug: 'quality', join_mode: 'open', description: null }),
      undefined,
    )
    expect((store.saveGroup as Mock).mock.calls[0][0]).not.toHaveProperty('is_active')
    expect(toastAdd).toHaveBeenCalledWith({ title: '群组「质量协作组」已保存', color: 'success' })
    expect(onSaved).toHaveBeenCalledWith(9)
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('saveDraft 编辑成功：onSaved 收到原 id，不跳转', async () => {
    const store = useGroupsStore()
    ;(store.selectGroup as Mock).mockImplementation(async () => {
      store.state.selectedId = 7
      store.state.detail = group()
      return null
    })
    const onSaved = vi.fn()
    const editor = useGroupEditor()
    await editor.openEdit(7)
    editor.draft.value.name = '设备协作二组'
    expect(await editor.saveDraft({ onSaved })).toBe(true)
    expect(store.saveGroup).toHaveBeenCalledWith(expect.objectContaining({ name: '设备协作二组' }), 7)
    expect(onSaved).toHaveBeenCalledWith(7)
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('saveDraft 编辑态传 id 与 is_active，失败时写入 error、不回调、不跳转', async () => {
    const store = useGroupsStore()
    ;(store.selectGroup as Mock).mockImplementation(async () => {
      store.state.selectedId = 7
      store.state.detail = group()
      return null
    })
    ;(store.saveGroup as Mock).mockResolvedValue('群组更新失败')
    const onSaved = vi.fn()
    const editor = useGroupEditor()
    await editor.openEdit(7)
    editor.draft.value.isActive = false
    const ok = await editor.saveDraft({ onSaved })
    expect(ok).toBe(false)
    expect(store.saveGroup).toHaveBeenCalledWith(expect.objectContaining({ name: '设备协作组', is_active: false }), 7)
    expect(editor.error.value).toBe('群组更新失败')
    expect(onSaved).not.toHaveBeenCalled()
    expect(toastAdd).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
  })
})
