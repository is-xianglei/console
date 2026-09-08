import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { getDepartmentMemberList } from '@/http/department'
import type { DepartmentTreeResponse } from '@/interfaces/department/model'
import { useDepartmentsStore } from '@/stores/departments'
import {
  filterDepartmentTree,
  flattenDepartmentTree,
  useDepartmentManager,
} from './useDepartmentManager'

const routeState = reactive({ query: {} as Record<string, string | string[] | undefined>, params: {}, name: 'platform-resource' })
const router = {
  push: vi.fn(async (to: unknown) => to),
  replace: vi.fn(async (to: unknown) => to),
  back: vi.fn(async () => undefined),
}

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => router,
}))

vi.mock('@/http/department', () => ({
  getDepartmentMemberList: vi.fn(),
  getDepartmentList: vi.fn(),
  getDepartmentTree: vi.fn(),
  getDepartmentDetail: vi.fn(),
  getDepartmentAncestorList: vi.fn(),
  getDepartmentDescendantList: vi.fn(),
  createDepartment: vi.fn(),
  updateDepartment: vi.fn(),
  deleteDepartment: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
  routeState.query = {}
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() })
  setActivePinia(createPinia())
})

describe('filterDepartmentTree / flattenDepartmentTree', () => {
  it('搜索命中节点保留完整父级链（祖先弱化、命中高亮）', () => {
    // 树：公司(root) → 市场部(name=市场部) / 研发部；公司自身不命中。
    const nodes: DepartmentTreeResponse[] = [{
      id: 1, workspace_id: 3, name: '总公司', sort_order: 0, is_active: true, created_at: '', updated_at: '',
      children: [{ id: 2, workspace_id: 3, name: '市场部', sort_order: 0, is_active: true, created_at: '', updated_at: '' }],
    }]
    const result = filterDepartmentTree(nodes, (n) => n.name === '市场部')
    expect(result).toHaveLength(1)
    // 父节点保留但自身未命中 → 祖先弱化。
    expect(result[0].match).toBe(false)
    expect(result[0].ancestorOfMatch).toBe(true)
    expect(result[0].children!.length).toBe(1)
    expect((result[0].children![0] as unknown as { match: boolean }).match).toBe(true)
  })

  it('自身命中但无命中子孙也保留', () => {
    const nodes: DepartmentTreeResponse[] = [{ id: 1, workspace_id: 3, name: '市场部', sort_order: 0, is_active: true, created_at: '', updated_at: '' }]
    const result = filterDepartmentTree(nodes, (n) => n.name === '市场部')
    expect(result[0].match).toBe(true)
    expect(result[0].ancestorOfMatch).toBe(false)
  })

  it('完全未命中的节点被过滤，子孙不保留', () => {
    const nodes: DepartmentTreeResponse[] = [{ id: 1, workspace_id: 3, name: '市场部', sort_order: 0, is_active: true, created_at: '', updated_at: '', children: [{ id: 2, workspace_id: 3, name: '华东', sort_order: 0, is_active: true, created_at: '', updated_at: '' }] }]
    expect(filterDepartmentTree(nodes, (n) => n.name === '研发部')).toHaveLength(0)
  })

  it('flattenDepartmentTree 按先序展开（父在前、子跟随）', () => {
    const nodes: DepartmentTreeResponse[] = [{ id: 1, workspace_id: 3, name: 'A', sort_order: 0, is_active: true, created_at: '', updated_at: '', children: [{ id: 2, workspace_id: 3, name: 'B', sort_order: 0, is_active: true, created_at: '', updated_at: '' }] }]
    const rows = flattenDepartmentTree(filterDepartmentTree(nodes, () => true))
    expect(rows.map((r) => r.id)).toEqual([1, 2])
  })

  it('flattenDepartmentTree 传播停用子树标记：停用节点自身与全部子孙 subtreeInactive=true（B4）', () => {
    const nodes: DepartmentTreeResponse[] = [{
      id: 1, workspace_id: 3, name: '总公司', sort_order: 0, is_active: true, created_at: '', updated_at: '',
      children: [{ id: 2, workspace_id: 3, name: '停用部门', sort_order: 0, is_active: false, created_at: '', updated_at: '', children: [{ id: 3, workspace_id: 3, name: '孙部门', sort_order: 0, is_active: true, created_at: '', updated_at: '' }] }],
    }]
    const rows = flattenDepartmentTree(filterDepartmentTree(nodes, () => true))
    const byId = new Map(rows.map((r) => [r.id, r]))
    // 停用节点自身与其后代标记弱化；无关的根节点不受影响。
    expect(byId.get(2)!.subtreeInactive).toBe(true)
    expect(byId.get(3)!.subtreeInactive).toBe(true)
    expect(byId.get(1)!.subtreeInactive).toBe(false)
  })
})

describe('useDepartmentManager', () => {
  it('部门树进入 URL 状态：state.keyword 往返于 query（含 ant 环境即时回读）', () => {
    routeState.query = { keyword: '市场', collapsed: '1' }
    const manager = useDepartmentManager()
    expect(manager.state.keyword).toBe('市场')
    expect(manager.state.collapsed).toBe(true)
  })

  it('requestDelete 有下级部门时给出阻断信息并禁用确认', async () => {
    const store = useDepartmentsStore()
    store.state.workspaceId = 3
    vi.mocked(getDepartmentMemberList).mockResolvedValue([])
    const manager = useDepartmentManager()
    const node: DepartmentTreeResponse = { id: 1, workspace_id: 3, name: '总公司', sort_order: 0, is_active: true, created_at: '', updated_at: '', children: [{ id: 2, workspace_id: 3, name: '市场部', sort_order: 0, is_active: true, created_at: '', updated_at: '' }] }
    await manager.requestDelete(node as never)
    expect(manager.deleteBlockers.value).toMatchObject({ childrenCount: 1, memberCount: 0 })
  })

  it('requestDelete 无下级且有直属成员时列出成员数', async () => {
    const store = useDepartmentsStore()
    store.state.workspaceId = 3
    vi.mocked(getDepartmentMemberList).mockResolvedValue([{ id: 9, user_id: 9, username: 'u', email: 'e', role: 'member' } as never])
    const manager = useDepartmentManager()
    const node: DepartmentTreeResponse = { id: 3, workspace_id: 3, name: '研发部', sort_order: 0, is_active: true, created_at: '', updated_at: '' }
    await manager.requestDelete(node as never)
    expect(manager.deleteBlockers.value).toMatchObject({ childrenCount: 0, memberCount: 1 })
  })

  it('requestDelete 无依赖成员且成员接口返回空时不阻断', async () => {
    const store = useDepartmentsStore()
    store.state.workspaceId = 3
    vi.mocked(getDepartmentMemberList).mockResolvedValue([])
    const manager = useDepartmentManager()
    const node: DepartmentTreeResponse = { id: 3, workspace_id: 3, name: '研发部', sort_order: 0, is_active: true, created_at: '', updated_at: '' }
    await manager.requestDelete(node as never)
    expect(manager.deleteBlockers.value).toBeNull()
  })
})
