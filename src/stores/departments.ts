import { defineStore } from 'pinia'
import { reactive } from 'vue'
import {
  createDepartment,
  deleteDepartment,
  getDepartmentAncestorList,
  getDepartmentDescendantList,
  getDepartmentDetail,
  getDepartmentList,
  getDepartmentMemberList,
  getDepartmentTree,
  updateDepartment,
  updateMemberDepartment,
} from '@/http/department'
import { ApiError } from '@/http'
import type {
  DepartmentCreateRequest,
  DepartmentSetMemberRequest,
  DepartmentUpdateRequest,
} from '@/interfaces/department/api'
import type {
  DepartmentMemberResponse,
  DepartmentResponse,
  DepartmentTreeResponse,
} from '@/interfaces/department/model'

interface DepartmentsState {
  workspaceId: number | null
  items: DepartmentResponse[]
  tree: DepartmentTreeResponse[]
  selectedId: number | null
  detail: DepartmentResponse | null
  ancestors: DepartmentResponse[]
  descendants: DepartmentResponse[]
  members: DepartmentMemberResponse[]
  loading: boolean
  detailLoading: boolean
  saving: boolean
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export const useDepartmentsStore = defineStore('departments', () => {
  let dataGeneration = 0
  const state = reactive<DepartmentsState>({
    workspaceId: null,
    items: [],
    tree: [],
    selectedId: null,
    detail: null,
    ancestors: [],
    descendants: [],
    members: [],
    loading: false,
    detailLoading: false,
    saving: false,
  })

  function resetDepartments(workspaceId: number | null = null) {
    dataGeneration += 1
    state.workspaceId = workspaceId
    state.items = []
    state.tree = []
    state.selectedId = null
    state.detail = null
    state.ancestors = []
    state.descendants = []
    state.members = []
    state.loading = false
    state.detailLoading = false
    state.saving = false
  }

  async function loadDepartments(workspaceId: number): Promise<string | null> {
    if (state.workspaceId !== workspaceId) resetDepartments(workspaceId)
    const generation = dataGeneration
    state.loading = true
    try {
      const [items, tree] = await Promise.all([
        getDepartmentList(workspaceId),
        getDepartmentTree(workspaceId),
      ])
      if (generation !== dataGeneration) return null
      state.items = items
      state.tree = tree
      if (state.selectedId && !items.some((item) => item.id === state.selectedId)) {
        clearSelection()
      }
      return null
    } catch (error) {
      if (generation === dataGeneration) {
        state.items = []
        state.tree = []
      }
      return errorMessage(error, '部门目录加载失败')
    } finally {
      if (generation === dataGeneration) state.loading = false
    }
  }

  function clearSelection() {
    state.selectedId = null
    state.detail = null
    state.ancestors = []
    state.descendants = []
    state.members = []
    state.detailLoading = false
  }

  async function selectDepartment(departmentId: number): Promise<string | null> {
    const workspaceId = state.workspaceId
    if (!workspaceId) return '请先选择工作区'
    const generation = dataGeneration
    state.selectedId = departmentId
    state.detailLoading = true
    try {
      const [detail, ancestors, descendants, members] = await Promise.all([
        getDepartmentDetail(workspaceId, departmentId),
        getDepartmentAncestorList(workspaceId, departmentId),
        getDepartmentDescendantList(workspaceId, departmentId),
        getDepartmentMemberList(workspaceId, departmentId, { include_descendants: false }),
      ])
      if (generation !== dataGeneration || state.selectedId !== departmentId) return null
      state.detail = detail
      state.ancestors = ancestors
      state.descendants = descendants
      state.members = members
      return null
    } catch (error) {
      if (generation === dataGeneration && state.selectedId === departmentId) {
        state.detail = null
        state.ancestors = []
        state.descendants = []
        state.members = []
      }
      return errorMessage(error, '部门详情加载失败')
    } finally {
      if (generation === dataGeneration && state.selectedId === departmentId) {
        state.detailLoading = false
      }
    }
  }

  async function saveDepartment(
    payload: DepartmentCreateRequest | DepartmentUpdateRequest,
    departmentId?: number,
  ): Promise<string | null> {
    const workspaceId = state.workspaceId
    if (!workspaceId) return '请先选择工作区'
    const generation = dataGeneration
    state.saving = true
    try {
      const saved = departmentId
        ? await updateDepartment(workspaceId, departmentId, payload as DepartmentUpdateRequest)
        : await createDepartment(workspaceId, payload as DepartmentCreateRequest)
      if (generation !== dataGeneration) return null
      await loadDepartments(workspaceId)
      await selectDepartment(saved.id)
      return null
    } catch (error) {
      return errorMessage(error, departmentId ? '部门更新失败' : '部门创建失败')
    } finally {
      if (generation === dataGeneration) state.saving = false
    }
  }

  async function removeDepartment(departmentId: number): Promise<string | null> {
    const workspaceId = state.workspaceId
    if (!workspaceId) return '请先选择工作区'
    try {
      await deleteDepartment(workspaceId, departmentId)
      if (state.selectedId === departmentId) clearSelection()
      return await loadDepartments(workspaceId)
    } catch (error) {
      return errorMessage(error, '部门删除失败')
    }
  }

  async function setMemberDepartment(
    userId: number,
    payload: DepartmentSetMemberRequest,
  ): Promise<string | null> {
    const workspaceId = state.workspaceId
    if (!workspaceId) return '请先选择工作区'
    try {
      await updateMemberDepartment(workspaceId, userId, payload)
      if (state.selectedId) await selectDepartment(state.selectedId)
      return null
    } catch (error) {
      return errorMessage(error, '成员部门更新失败')
    }
  }

  return {
    state,
    resetDepartments,
    loadDepartments,
    selectDepartment,
    clearSelection,
    saveDepartment,
    removeDepartment,
    setMemberDepartment,
  }
})
