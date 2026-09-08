import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ApiError } from '@/http'
import {
  createGroup,
  createGroupMemberInvite,
  createGroupMembership,
  deleteCurrentGroupMembership,
  deleteGroup,
  deleteGroupMember,
  deleteGroupMemberRequest,
  getGroupDetail,
  getGroupList,
  getGroupMemberList,
  getMyGroupList,
  updateGroup,
  updateGroupMemberApproval,
  updateGroupMemberRole,
  updateGroupOwner,
} from '@/http/group'
import type {
  GroupCreateRequest,
  GroupMemberRoleUpdateRequest,
  GroupUpdateRequest,
} from '@/interfaces/group/api'
import type { GroupMemberResponse, GroupResponse } from '@/interfaces/group/model'

/**
 * 其余 store（agents / workflows / orchestrationPlans / memories 等）在 p1 / p2 按此迁移：
 * 增加 `pageState: { items, total, page, pageSize, keyword, isEnabled }` 与 `loadPage(params)`，
 * 请求带 generation 计数防旧响应覆盖，`upsert / remove` 维护 `pageState.total`。
 * 注：group 列表接口当前只回全量数组（无 limit/offset），故 loadPage 仍拉全量并在
 * 调用方（useGroupManager）按页切片；具备服务端分页的资源按其接口接入真实 offset。
 */

interface GroupsPageState {
  items: GroupResponse[]
  total: number
  page: number
  pageSize: number
  keyword: string
  isEnabled: 'all' | 'enabled' | 'disabled'
}

interface GroupsState {
  workspaceId: number | null
  items: GroupResponse[]
  myGroups: GroupResponse[]
  selectedId: number | null
  detail: GroupResponse | null
  members: GroupMemberResponse[]
  loading: boolean
  detailLoading: boolean
  saving: boolean
  pageState: GroupsPageState
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export const useGroupsStore = defineStore('groups', () => {
  let dataGeneration = 0
  // loadPage 专用：同页内快速连发只保留最新（区别于跨工作区的 dataGeneration）。
  let pageGeneration = 0
  const state = reactive<GroupsState>({
    workspaceId: null,
    items: [],
    myGroups: [],
    selectedId: null,
    detail: null,
    members: [],
    loading: false,
    detailLoading: false,
    saving: false,
    pageState: {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      keyword: '',
      isEnabled: 'all',
    },
  })

  function resetGroups(workspaceId: number | null = null) {
    dataGeneration += 1
    state.workspaceId = workspaceId
    state.items = []
    state.myGroups = []
    state.selectedId = null
    state.detail = null
    state.members = []
    state.loading = false
    state.detailLoading = false
    state.saving = false
    state.pageState.items = []
    state.pageState.total = 0
  }

  function clearSelection() {
    state.selectedId = null
    state.detail = null
    state.members = []
    state.detailLoading = false
  }

  async function loadGroups(workspaceId: number, search?: string): Promise<string | null> {
    if (state.workspaceId !== workspaceId) resetGroups(workspaceId)
    const generation = dataGeneration
    state.loading = true
    try {
      const [items, myGroups] = await Promise.all([
        getGroupList(workspaceId, search ? { search } : undefined),
        getMyGroupList(),
      ])
      if (generation !== dataGeneration) return null
      state.items = items
      state.myGroups = myGroups.filter((group) => group.workspace_id === workspaceId)
      if (state.selectedId && !items.some((item) => item.id === state.selectedId)) {
        clearSelection()
      }
      return null
    } catch (error) {
      if (generation === dataGeneration) {
        state.items = []
        state.myGroups = []
      }
      return errorMessage(error, '群组目录加载失败')
    } finally {
      if (generation === dataGeneration) state.loading = false
    }
  }

  /**
   * 分页加载：写入 pageState（items/total 并在成功后按页切片），generation 计数
   * 丢弃旧响应（快速连续两次 loadPage 只保留后一次结果）。兼容编辑器依赖的全量 items。
   */
  async function loadPage(params: {
    /** 显式绑定的工作区；缺省用 state.workspaceId，未绑定时先 reset 绑定。 */
    workspaceId?: number
    page?: number
    pageSize?: number
    keyword?: string
    isEnabled?: GroupsPageState['isEnabled']
  } = {}): Promise<string | null> {
    const workspaceId = params.workspaceId ?? state.workspaceId
    if (!workspaceId) return '请先选择工作区'
    if (state.workspaceId !== workspaceId) resetGroups(workspaceId)
    const generation = dataGeneration
    const page = Math.max(1, params.page ?? state.pageState.page)
    const pageSize = Math.max(1, params.pageSize ?? state.pageState.pageSize)
    const keyword = params.keyword ?? state.pageState.keyword
    const isEnabled = params.isEnabled ?? state.pageState.isEnabled

    state.loading = true
    const requestGeneration = ++pageGeneration
    try {
      const items = await getGroupList(workspaceId, keyword ? { search: keyword } : undefined)
      if (generation !== dataGeneration || requestGeneration !== pageGeneration) return null
      // 后端无 limit/offset：存全量并在调用方切片；total 取全量长度。
      state.items = items  // 保持编辑器 / 全量依赖一致
      state.pageState.items = items
      state.pageState.total = items.length
      state.pageState.page = page
      state.pageState.pageSize = pageSize
      state.pageState.keyword = keyword
      state.pageState.isEnabled = isEnabled
      return null
    } catch (error) {
      if (generation === dataGeneration && requestGeneration === pageGeneration) {
        state.pageState.items = []
        state.pageState.total = 0
      }
      return errorMessage(error, '群组列表加载失败')
    } finally {
      if (generation === dataGeneration && requestGeneration === pageGeneration) state.loading = false
    }
  }

  async function selectGroup(groupId: number): Promise<string | null> {
    const workspaceId = state.workspaceId
    if (!workspaceId) return '请先选择工作区'
    const generation = dataGeneration
    state.selectedId = groupId
    state.detailLoading = true
    try {
      const membersPromise = getGroupMemberList(workspaceId, groupId, { include_pending: true })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 403) {
            return getGroupMemberList(workspaceId, groupId)
          }
          throw error
        })
      const [detail, members] = await Promise.all([
        getGroupDetail(workspaceId, groupId),
        membersPromise,
      ])
      if (generation !== dataGeneration || state.selectedId !== groupId) return null
      state.detail = detail
      state.members = members
      return null
    } catch (error) {
      if (generation === dataGeneration && state.selectedId === groupId) {
        state.detail = null
        state.members = []
      }
      return errorMessage(error, '群组详情加载失败')
    } finally {
      if (generation === dataGeneration && state.selectedId === groupId) {
        state.detailLoading = false
      }
    }
  }

  async function saveGroup(
    payload: GroupCreateRequest | GroupUpdateRequest,
    groupId?: number,
  ): Promise<string | null> {
    const workspaceId = state.workspaceId
    if (!workspaceId) return '请先选择工作区'
    const generation = dataGeneration
    state.saving = true
    try {
      const saved = groupId
        ? await updateGroup(workspaceId, groupId, payload as GroupUpdateRequest)
        : await createGroup(workspaceId, payload as GroupCreateRequest)
      if (generation !== dataGeneration) return null
      upsertInto(state.items, saved)
      upsertInto(state.pageState.items, saved)
      state.pageState.total = state.pageState.items.length
      await loadGroups(workspaceId)
      await selectGroup(saved.id)
      return null
    } catch (error) {
      return errorMessage(error, groupId ? '群组更新失败' : '群组创建失败')
    } finally {
      if (generation === dataGeneration) state.saving = false
    }
  }

  async function removeGroup(groupId: number): Promise<string | null> {
    const workspaceId = state.workspaceId
    if (!workspaceId) return '请先选择工作区'
    try {
      await deleteGroup(workspaceId, groupId)
      if (state.selectedId === groupId) clearSelection()
      removeFrom(state.items, groupId)
      removeFrom(state.pageState.items, groupId)
      state.pageState.total = state.pageState.items.length
      return await loadGroups(workspaceId)
    } catch (error) {
      return errorMessage(error, '群组删除失败')
    }
  }

  function upsertInto(list: GroupResponse[], group: GroupResponse) {
    const index = list.findIndex((item) => item.id === group.id)
    if (index >= 0) list[index] = group
    else list.unshift(group)
  }

  function removeFrom(list: GroupResponse[], id: number) {
    const index = list.findIndex((item) => item.id === id)
    if (index >= 0) list.splice(index, 1)
  }

  async function mutateMembers(action: () => Promise<unknown>, fallback: string) {
    try {
      await action()
      if (state.selectedId) await selectGroup(state.selectedId)
      if (state.workspaceId) await loadGroups(state.workspaceId)
      return null
    } catch (error) {
      return errorMessage(error, fallback)
    }
  }

  const inviteMember = (userId: number, role: 'admin' | 'member' = 'member') => {
    if (!state.workspaceId || !state.selectedId) return Promise.resolve('请先选择群组')
    return mutateMembers(
      () => createGroupMemberInvite(state.workspaceId!, state.selectedId!, { user_id: userId, role }),
      '成员邀请失败',
    )
  }
  const joinGroup = (groupId: number) => {
    if (!state.workspaceId) return Promise.resolve('请先选择工作区')
    return mutateMembers(() => createGroupMembership(state.workspaceId!, groupId), '加入群组失败')
  }
  const leaveGroup = (groupId: number) => {
    if (!state.workspaceId) return Promise.resolve('请先选择工作区')
    return mutateMembers(() => deleteCurrentGroupMembership(state.workspaceId!, groupId), '退出群组失败')
  }
  const approveMember = (userId: number) => {
    if (!state.workspaceId || !state.selectedId) return Promise.resolve('请先选择群组')
    return mutateMembers(
      () => updateGroupMemberApproval(state.workspaceId!, state.selectedId!, userId),
      '申请批准失败',
    )
  }
  const rejectMember = (userId: number) => {
    if (!state.workspaceId || !state.selectedId) return Promise.resolve('请先选择群组')
    return mutateMembers(
      () => deleteGroupMemberRequest(state.workspaceId!, state.selectedId!, userId),
      '申请拒绝失败',
    )
  }
  const changeMemberRole = (userId: number, payload: GroupMemberRoleUpdateRequest) => {
    if (!state.workspaceId || !state.selectedId) return Promise.resolve('请先选择群组')
    return mutateMembers(
      () => updateGroupMemberRole(state.workspaceId!, state.selectedId!, userId, payload),
      '成员角色更新失败',
    )
  }
  const removeMember = (userId: number) => {
    if (!state.workspaceId || !state.selectedId) return Promise.resolve('请先选择群组')
    return mutateMembers(
      () => deleteGroupMember(state.workspaceId!, state.selectedId!, userId),
      '成员移除失败',
    )
  }
  const transferOwner = (userId: number) => {
    if (!state.workspaceId || !state.selectedId) return Promise.resolve('请先选择群组')
    return mutateMembers(
      () => updateGroupOwner(state.workspaceId!, state.selectedId!, { user_id: userId }),
      '负责人转让失败',
    )
  }

  return {
    state,
    resetGroups,
    loadGroups,
    loadPage,
    selectGroup,
    clearSelection,
    saveGroup,
    removeGroup,
    inviteMember,
    joinGroup,
    leaveGroup,
    approveMember,
    rejectMember,
    changeMemberRole,
    removeMember,
    transferOwner,
  }
})
