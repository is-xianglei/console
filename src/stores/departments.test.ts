import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  getDepartmentMemberList,
  getDepartmentTree,
} from '../http/department'
import { useDepartmentsStore } from './departments'

vi.mock('../http/department', () => ({
  getDepartmentList: vi.fn(),
  getDepartmentTree: vi.fn(),
  getDepartmentDetail: vi.fn(),
  getDepartmentAncestorList: vi.fn(),
  getDepartmentDescendantList: vi.fn(),
  getDepartmentMemberList: vi.fn(),
  createDepartment: vi.fn(),
  updateDepartment: vi.fn(),
  deleteDepartment: vi.fn(),
  updateMemberDepartment: vi.fn(),
}))

type TreeItem = { id: number; workspace_id: number; name: string; sort_order: number; is_active: boolean; created_at: string; updated_at: string; children?: TreeItem[] }
function treeItem(id: number, name: string, children: TreeItem[] = []): TreeItem {
  return { id, workspace_id: 3, name, sort_order: 0, is_active: true, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z', ...(children.length ? { children } : {}) }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
})

describe('departments store tree data source', () => {
  it('loadDepartments 同时装载平表 items 与树 tree（供 people 左树 / departments 树表）', async () => {
    const tree = [treeItem(1, '总公司', [treeItem(2, '市场部')]), treeItem(3, '研发部')]
    vi.mocked(getDepartmentTree).mockResolvedValue(tree)
    const { getDepartmentList } = await import('../http/department')
    // 平表 = 树展开后的全量（3 项）。
    vi.mocked(getDepartmentList).mockResolvedValue([treeItem(1, '总公司'), treeItem(2, '市场部'), treeItem(3, '研发部')] as never)

    const store = useDepartmentsStore()
    const error = await store.loadDepartments(3)
    expect(error).toBeNull()
    expect(store.state.items).toHaveLength(3)
    expect(store.state.tree).toHaveLength(2)
    // 树节点含 children（树表 getSubRows 依赖）。
    expect(store.state.tree[0].children).toHaveLength(1)
    expect(store.state.tree[0].children![0].name).toBe('市场部')
  })

  it('loadDepartments 移动工作区后重置并重载（generation 丢弃旧响应）', async () => {
    const { getDepartmentList } = await import('../http/department')
    vi.mocked(getDepartmentList).mockResolvedValue([treeItem(1, 'A')] as never)
    vi.mocked(getDepartmentTree).mockResolvedValue([treeItem(1, 'A')])

    const store = useDepartmentsStore()
    store.state.workspaceId = 3
    store.state.items = [treeItem(9, '旧') as never]
    const error = await store.loadDepartments(5)
    expect(error).toBeNull()
    expect(store.state.workspaceId).toBe(5)
    expect(store.state.items).toHaveLength(1)
    expect(store.state.items[0].name).toBe('A')
  })
})

describe('selectDepartment 成员数由 getDepartmentMemberList(include_descendants:false) 提供', () => {
  it('selectDepartment 装载 detail/descendants/members', async () => {
    const { getDepartmentDetail, getDepartmentAncestorList, getDepartmentDescendantList } = await import('../http/department')
    vi.mocked(getDepartmentDetail).mockResolvedValue(treeItem(1, '总公司') as never)
    vi.mocked(getDepartmentAncestorList).mockResolvedValue([])
    vi.mocked(getDepartmentDescendantList).mockResolvedValue([treeItem(2, '市场部') as never])
    vi.mocked(getDepartmentMemberList).mockResolvedValue([{ id: 9, user_id: 9, username: 'u', email: 'e', role: 'member' }] as never)

    const store = useDepartmentsStore()
    store.state.workspaceId = 3
    const error = await store.selectDepartment(1)
    expect(error).toBeNull()
    expect(store.state.members).toHaveLength(1)
    expect(store.state.descendants).toHaveLength(1)
  })
})
