import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ApiError } from '@/http'
import {
  acceptWorkspaceInvite,
  createWorkspace,
  deleteWorkspace,
  deleteWorkspaceMember,
  getWorkspaceDetail,
  getWorkspaceMemberList,
  inviteWorkspaceMember,
  updateWorkspace,
  updateWorkspaceMemberRole,
} from '@/http/workspace'
import type {
  WorkspaceCreateRequest,
  WorkspaceMemberInviteRequest,
  WorkspaceMemberRoleUpdateRequest,
  WorkspaceUpdateRequest,
} from '@/interfaces/workspace/api'
import type {
  WorkspaceMemberDetailResponse,
  WorkspaceResponse,
} from '@/interfaces/workspace/model'

interface WorkspacesState {
  workspaceId: number | null
  detail: WorkspaceResponse | null
  members: WorkspaceMemberDetailResponse[]
  loading: boolean
  mutating: boolean
}

interface WorkspaceContext {
  workspaceId: number
  generation: number
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export const useWorkspacesStore = defineStore('workspaces', () => {
  let dataGeneration = 0
  let mutationCount = 0
  const state = reactive<WorkspacesState>({
    workspaceId: null,
    detail: null,
    members: [],
    loading: false,
    mutating: false,
  })

  function currentContext(): WorkspaceContext | null {
    return state.workspaceId
      ? { workspaceId: state.workspaceId, generation: dataGeneration }
      : null
  }

  function isCurrentContext(context: WorkspaceContext): boolean {
    return context.generation === dataGeneration && context.workspaceId === state.workspaceId
  }

  function beginMutation() {
    mutationCount += 1
    state.mutating = true
  }

  function endMutation() {
    mutationCount = Math.max(0, mutationCount - 1)
    state.mutating = mutationCount > 0
  }

  function resetWorkspaces(workspaceId: number | null = null) {
    dataGeneration += 1
    state.workspaceId = workspaceId
    state.detail = null
    state.members = []
    state.loading = false
  }

  async function loadWorkspace(workspaceId: number): Promise<string | null> {
    if (state.workspaceId !== workspaceId) resetWorkspaces(workspaceId)
    const generation = dataGeneration
    state.loading = true
    try {
      const [detail, members] = await Promise.all([
        getWorkspaceDetail(workspaceId),
        getWorkspaceMemberList(workspaceId),
      ])
      if (generation !== dataGeneration) return null
      state.detail = detail
      state.members = members
      return null
    } catch (error) {
      if (generation !== dataGeneration) return null
      state.detail = null
      state.members = []
      return errorMessage(error, '工作区详情加载失败')
    } finally {
      if (generation === dataGeneration) state.loading = false
    }
  }

  async function reloadMembers(context = currentContext()): Promise<string | null> {
    if (!context) return '请先选择工作区'
    if (!isCurrentContext(context)) return null
    try {
      const members = await getWorkspaceMemberList(context.workspaceId)
      if (isCurrentContext(context)) state.members = members
      return null
    } catch (error) {
      if (!isCurrentContext(context)) return null
      return errorMessage(error, '成员列表加载失败')
    }
  }

  async function createWorkspaceAction(payload: WorkspaceCreateRequest) {
    beginMutation()
    try {
      await createWorkspace(payload)
      return null
    } catch (error) {
      return errorMessage(error, '工作区创建失败')
    } finally {
      endMutation()
    }
  }

  async function updateWorkspaceAction(payload: WorkspaceUpdateRequest) {
    const context = currentContext()
    if (!context) return '请先选择工作区'
    beginMutation()
    try {
      const detail = await updateWorkspace(context.workspaceId, payload)
      if (isCurrentContext(context)) state.detail = detail
      return null
    } catch (error) {
      if (!isCurrentContext(context)) return null
      return errorMessage(error, '工作区更新失败')
    } finally {
      endMutation()
    }
  }

  async function inviteMember(payload: WorkspaceMemberInviteRequest) {
    const context = currentContext()
    if (!context) return '请先选择工作区'
    beginMutation()
    try {
      await inviteWorkspaceMember(context.workspaceId, payload)
      return await reloadMembers(context)
    } catch (error) {
      if (!isCurrentContext(context)) return null
      return errorMessage(error, '成员邀请失败')
    } finally {
      endMutation()
    }
  }

  async function acceptInvite(workspaceId: number) {
    beginMutation()
    try {
      await acceptWorkspaceInvite(workspaceId)
      return null
    } catch (error) {
      return errorMessage(error, '接受邀请失败')
    } finally {
      endMutation()
    }
  }

  async function changeMemberRole(
    userId: number,
    payload: WorkspaceMemberRoleUpdateRequest,
  ) {
    const context = currentContext()
    if (!context) return '请先选择工作区'
    beginMutation()
    try {
      await updateWorkspaceMemberRole(context.workspaceId, userId, payload)
      return await reloadMembers(context)
    } catch (error) {
      if (!isCurrentContext(context)) return null
      return errorMessage(error, '成员角色更新失败')
    } finally {
      endMutation()
    }
  }

  async function removeMember(userId: number) {
    const context = currentContext()
    if (!context) return '请先选择工作区'
    beginMutation()
    try {
      await deleteWorkspaceMember(context.workspaceId, userId)
      return await reloadMembers(context)
    } catch (error) {
      if (!isCurrentContext(context)) return null
      return errorMessage(error, '成员移除失败')
    } finally {
      endMutation()
    }
  }

  async function removeWorkspace(workspaceId: number) {
    beginMutation()
    try {
      await deleteWorkspace(workspaceId)
      return null
    } catch (error) {
      return errorMessage(error, '工作区删除失败')
    } finally {
      endMutation()
    }
  }

  return {
    state,
    resetWorkspaces,
    loadWorkspace,
    reloadMembers,
    createWorkspace: createWorkspaceAction,
    updateWorkspace: updateWorkspaceAction,
    inviteMember,
    acceptInvite,
    changeMemberRole,
    removeMember,
    removeWorkspace,
  }
})
