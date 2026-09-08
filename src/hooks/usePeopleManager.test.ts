import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { deleteUser } from '@/http/user'
import { getUserList } from '@/http/user'
import { getWorkspaceMemberList } from '@/http/workspace'
import type { UserResponse } from '@/interfaces/user/model'
import type { WorkspaceMemberDetailResponse } from '@/interfaces/workspace/model'
import { useAuthStore } from '@/stores/auth'
import { useDepartmentsStore } from '@/stores/departments'
import { usePeopleManager } from './usePeopleManager'

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

vi.mock('@/http/user', () => ({
  getUserList: vi.fn(),
  getUserDetail: vi.fn(),
  deleteUser: vi.fn(),
}))
vi.mock('@/http/workspace', () => ({
  getWorkspaceMemberList: vi.fn(),
  updateWorkspaceMemberRole: vi.fn(),
}))
vi.mock('@/http/department', () => ({
  getDepartmentList: vi.fn(),
  getDepartmentTree: vi.fn(),
}))

function user(id: number, name: string): UserResponse {
  return { id, username: name, email: `${name}@example.com`, full_name: name, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' }
}

function member(userId: number, role = 'member'): WorkspaceMemberDetailResponse {
  return { id: userId, workspace_id: 3, user_id: userId, username: `u${userId}`, email: `u${userId}@example.com`, role, created_at: '2026-08-01T00:00:00Z' }
}

beforeEach(() => {
  vi.resetAllMocks()
  routeState.query = {}
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() })
  setActivePinia(createPinia())
  useAuthStore().state.user = user(1, 'me')
  vi.mocked(getUserList).mockResolvedValue([user(1, 'me'), user(2, 'alice'), user(3, 'bob')])
  // 当前登录用户默认也是管理员：可删除 admin（否则会被「非管理员不能操作管理员」拦截）。
  vi.mocked(getWorkspaceMemberList).mockResolvedValue([member(1, 'admin'), member(2, 'admin'), member(3)])
  // 部门目录加载 mock：loadAll 依赖 ensureDepartments，避免触达真实 http。
  useDepartmentsStore().loadDepartments = vi.fn(async () => null)
})

describe('usePeopleManager', () => {
  it('query ↔ URL 序列化：keyword/departmentId/membership/page/pageSize 往返', () => {
    routeState.query = { keyword: 'ali', departmentId: '2', membership: 'admin', page: '3', pageSize: '50' }
    const manager = usePeopleManager()
    expect(manager.state.keyword).toBe('ali')
    expect(manager.state.departmentId).toBe('2')
    expect(manager.state.membership).toBe('admin')
    expect(manager.state.page).toBe(3)
    expect(manager.state.pageSize).toBe(50)
  })

  it('selectDepartment 写 departmentId 且 page 归 1（A2）', () => {
    const manager = usePeopleManager()
    manager.state.page = 5
    manager.selectDepartment('2')
    expect(manager.state.departmentId).toBe('2')
    expect(manager.state.page).toBe(1)
  })

  it('canDeletePerson 规则集中走 can()：不能删自己、非管理员不能删管理员（A6）', async () => {
    const manager = usePeopleManager()
    await manager.loadAll(3)
    // 自己不可删。
    expect(manager.canDeletePerson({ ...user(1, 'me'), membership: member(1, 'admin') })).toBe(false)
    // 管理员(操作者也是管理员)可删普通成员。
    expect(manager.canDeletePerson({ ...user(2, 'alice'), membership: member(2, 'admin') })).toBe(true)
    // 非管理员操作者不能删管理员；非管理员也不能删自己。
    vi.mocked(getWorkspaceMemberList).mockResolvedValue([member(1), member(2, 'admin'), member(3)])
    const nonAdmin = usePeopleManager()
    await nonAdmin.loadAll(3)
    expect(nonAdmin.canDeletePerson({ ...user(2, 'alice'), membership: member(2, 'admin') })).toBe(false)
    expect(nonAdmin.canDeletePerson({ ...user(1, 'me'), membership: member(1) })).toBe(false)
  })

  it('canTogglePerson 集中走 can()：不能停用自己、非管理员不能操作管理员（A6）', async () => {
    const manager = usePeopleManager()
    await manager.loadAll(3)
    expect(manager.canTogglePerson({ ...user(1, 'me'), membership: member(1, 'admin') })).toBe(false)
    expect(manager.canTogglePerson({ ...user(2, 'alice'), membership: member(2, 'admin') })).toBe(true)
    // 非管理员操作者不能操作管理员。
    vi.mocked(getWorkspaceMemberList).mockResolvedValue([member(1), member(2, 'admin'), member(3)])
    const nonAdmin = usePeopleManager()
    await nonAdmin.loadAll(3)
    expect(nonAdmin.canTogglePerson({ ...user(2, 'alice'), membership: member(2, 'admin') })).toBe(false)
  })

  it('批量删除自动剔除不满足行级规则的用户（A3/A6）', async () => {
    const manager = usePeopleManager()
    await manager.loadAll(3)
    manager.selectedIds.value = ['1', '2', '3']
    // 当前登录用户 id=1 被剔除；操作者为 admin，管理员(2,3)仍可删。
    expect(manager.safeSelectedIds.value).toEqual(['2', '3'])
    expect(manager.selectedTotal.value).toBe(2)
    vi.mocked(deleteUser).mockResolvedValue({})
    const error = await manager.deleteSelected()
    expect(error).toBeNull()
    // 只删除 alice 与 bob，不调用 deleteUser(1)。
    expect(deleteUser).toHaveBeenCalledWith(2)
    expect(deleteUser).toHaveBeenCalledWith(3)
    expect(deleteUser).not.toHaveBeenCalledWith(1)
  })

  it('批量删除：非管理员操作者自动剔除管理员行（A6）', async () => {
    // 操作者(1)是普通成员，alice(2) 是管理员 → 2 被剔除，仅剩 bob(3)。
    vi.mocked(getWorkspaceMemberList).mockResolvedValue([member(1), member(2, 'admin'), member(3)])
    const manager = usePeopleManager()
    await manager.loadAll(3)
    manager.selectedIds.value = ['1', '2', '3']
    expect(manager.safeSelectedIds.value).toEqual(['3'])
    expect(manager.selectedTotal.value).toBe(1)
  })

  it('已知词过滤后分页切片（A5）', async () => {
    const manager = usePeopleManager()
    await manager.loadAll(3)
    manager.state.keyword = 'al'
    manager.state.pageSize = 10
    expect(manager.total.value).toBe(1)
    expect(manager.pagedItems.value.map((row) => row.id)).toEqual([2])
  })
})
