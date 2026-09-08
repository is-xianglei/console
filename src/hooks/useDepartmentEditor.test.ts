import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { DepartmentResponse } from '@/interfaces/department/model'
import { useDepartmentsStore } from '@/stores/departments'
import { useDepartmentEditor, validateDepartment, departmentToForm, emptyDepartmentForm } from './useDepartmentEditor'

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}))

function department(): DepartmentResponse {
  return {
    id: 7,
    workspace_id: 3,
    parent_id: 2,
    name: '设备工程部',
    code: 'DEV-ENG',
    description: '负责设备接入',
    manager_id: 11,
    sort_order: 3,
    is_active: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  }
}

type Mock = ReturnType<typeof vi.fn>

describe('useDepartmentEditor', () => {
  beforeEach(() => {
    routerPush.mockReset()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    setActivePinia(createPinia())
    const store = useDepartmentsStore()
    // 无 token 时编辑器回退到 store.state.workspaceId；预置列表使 ensureCatalog 不再触发加载。
    store.state.workspaceId = 3
    store.state.items = [department()]
    store.loadDepartments = vi.fn(async () => null)
    store.selectDepartment = vi.fn(async () => null)
    store.saveDepartment = vi.fn(async () => null)
  })

  it('纯函数：departmentToForm 与 validateDepartment', () => {
    const form = departmentToForm(department())
    expect(form.parentId).toBe('2')
    expect(form.managerId).toBe('11')
    expect(validateDepartment(form)).toEqual([])
    const empty = emptyDepartmentForm()
    expect(validateDepartment(empty).map((issue) => issue.field)).toEqual(['name'])
  })

  it('openCreate 建立空草稿，可预填上级部门', async () => {
    const editor = useDepartmentEditor()
    await editor.openCreate(2)
    expect(editor.draft.value.id).toBeNull()
    expect(editor.draft.value.name).toBe('')
    expect(editor.draft.value.parentId).toBe('2')
    expect(editor.loadingDetail.value).toBe(false)
  })

  it('openEdit 先 selectDepartment 再填 draft', async () => {
    const store = useDepartmentsStore()
    ;(store.selectDepartment as Mock).mockImplementation(async () => {
      store.state.selectedId = 7
      store.state.detail = department()
      return null
    })
    const editor = useDepartmentEditor()
    const ok = await editor.openEdit(7)
    expect(ok).toBe(true)
    expect(store.selectDepartment).toHaveBeenCalledWith(7)
    expect(editor.draft.value.id).toBe(7)
    expect(editor.draft.value.code).toBe('DEV-ENG')
  })

  it('openEdit 详情失败时返回 false 并设置错误', async () => {
    const store = useDepartmentsStore()
    ;(store.selectDepartment as Mock).mockResolvedValue('部门详情加载失败')
    const editor = useDepartmentEditor()
    const ok = await editor.openEdit(7)
    expect(ok).toBe(false)
    expect(editor.error.value).toContain('加载失败')
  })

  it('saveDraft 名称为空不提交', async () => {
    const store = useDepartmentsStore()
    const editor = useDepartmentEditor()
    await editor.openCreate()
    editor.draft.value.name = '  '
    const ok = await editor.saveDraft()
    expect(ok).toBe(false)
    expect(store.saveDepartment).not.toHaveBeenCalled()
  })

  it('saveDraft 成功后跳详情页', async () => {
    const store = useDepartmentsStore()
    ;(store.saveDepartment as Mock).mockImplementation(async () => {
      store.state.selectedId = 9
      store.state.detail = { ...department(), id: 9, name: '质量工程部' }
      return null
    })
    const editor = useDepartmentEditor()
    await editor.openCreate()
    editor.draft.value.name = '质量工程部'
    editor.draft.value.parentId = '2'
    const ok = await editor.saveDraft()
    expect(ok).toBe(true)
    expect(store.saveDepartment).toHaveBeenCalledWith(
      expect.objectContaining({ name: '质量工程部', parent_id: 2, code: null }),
      undefined,
    )
    expect(routerPush).toHaveBeenCalledWith({ name: 'department-detail', params: { id: '9' } })
  })

  it('saveDraft 编辑态传 id，失败时写入 error 且不跳转', async () => {
    const store = useDepartmentsStore()
    ;(store.selectDepartment as Mock).mockImplementation(async () => {
      store.state.selectedId = 7
      store.state.detail = department()
      return null
    })
    ;(store.saveDepartment as Mock).mockResolvedValue('部门更新失败')
    const editor = useDepartmentEditor()
    await editor.openEdit(7)
    const ok = await editor.saveDraft()
    expect(ok).toBe(false)
    expect(store.saveDepartment).toHaveBeenCalledWith(expect.objectContaining({ name: '设备工程部' }), 7)
    expect(editor.error.value).toBe('部门更新失败')
    expect(routerPush).not.toHaveBeenCalled()
  })
})
