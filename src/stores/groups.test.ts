import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  deleteGroup,
  getGroupList,
  getMyGroupList,
} from '../http/group'
import { useGroupsStore } from './groups'

vi.mock('../http/group', () => ({
  createGroup: vi.fn(),
  createGroupMemberInvite: vi.fn(),
  createGroupMembership: vi.fn(),
  deleteCurrentGroupMembership: vi.fn(),
  deleteGroup: vi.fn(),
  deleteGroupMember: vi.fn(),
  deleteGroupMemberRequest: vi.fn(),
  getGroupDetail: vi.fn(),
  getGroupList: vi.fn(),
  getGroupMemberList: vi.fn(),
  getMyGroupList: vi.fn(),
  updateGroup: vi.fn(),
  updateGroupMemberApproval: vi.fn(),
  updateGroupMemberRole: vi.fn(),
  updateGroupOwner: vi.fn(),
}))

function group(id: number, name: string) {
  return {
    id,
    workspace_id: 3,
    name,
    slug: `slug-${id}`,
    group_type: 'team',
    created_by: 1,
    owner_id: 1,
    visibility: 'workspace',
    join_mode: 'invite',
    is_active: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-02T00:00:00Z',
  }
}

const all = [group(1, '团队A'), group(2, '团队B'), group(3, '团队C')]

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  vi.mocked(getGroupList).mockResolvedValue(all)
  vi.mocked(getMyGroupList).mockResolvedValue([group(1, '团队A')])
})

describe('groups store pageState / loadPage', () => {
  it('loadPage 写入 pageState 并更新 total', async () => {
    const store = useGroupsStore()
    store.state.workspaceId = 3
    const error = await store.loadPage({ page: 1, pageSize: 20, keyword: '' })
    expect(error).toBeNull()
    expect(store.state.pageState.total).toBe(3)
    expect(store.state.pageState.items).toHaveLength(3)
    expect(store.state.pageState.page).toBe(1)
  })

  it('快速连续两次 loadPage 只保留后一次结果（generation 丢弃旧响应）', async () => {
    const store = useGroupsStore()
    store.state.workspaceId = 3

    let resolveFirst!: (value: typeof all) => void
    vi.mocked(getGroupList).mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))

    const first = store.loadPage({ page: 1 })
    // 第二次请求立即返回。
    const second = store.loadPage({ page: 2 })

    // 旧响应此时才回来，应被丢弃。
    resolveFirst(all)
    await first

    // 第二次已用 mockResolvedValue(all)，也完成。
    await second
    expect(store.state.pageState.page).toBe(2)
    // 旧响应不会把 page 覆盖回 1。
    expect(store.state.pageState.page).not.toBe(1)
  })
})

describe('remove 维护 pageState.total', () => {
  it('remove 后 total 减 1', async () => {
    vi.mocked(deleteGroup).mockResolvedValue({ deleted: true })
    const store = useGroupsStore()
    store.state.workspaceId = 3
    await store.loadPage({ page: 1 })
    expect(store.state.pageState.total).toBe(3)

    const error = await store.removeGroup(2)
    expect(error).toBeNull()
    expect(store.state.pageState.total).toBe(2)
    expect(store.state.pageState.items.some((g) => g.id === 2)).toBe(false)
  })
})
