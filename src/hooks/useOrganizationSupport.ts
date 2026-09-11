import { computed, ref } from 'vue'
import { ApiError } from '@/http'
import { getUserList } from '@/http/user'
import { getWorkspaceMemberList } from '@/http/workspace'
import type { UserResponse } from '@/interfaces/user/model'
import type { WorkspaceMemberDetailResponse } from '@/interfaces/workspace/model'
import { useDepartmentsStore } from '@/stores/departments'
import { useGroupsStore } from '@/stores/groups'

export interface SelectOption {
  value: string
  label: string
}

/** Radix Select 不允许 SelectItem 使用空字符串，使用哨兵值表示“未选择”。 */
export const SELECT_NONE_VALUE = '__none__'

/**
 * 组织资源支持数据：拉取用户目录与工作区成员，
 * 派生负责人下拉、上级部门下拉、可加入部门的成员下拉、可邀请入群的用户下拉、人员工作区归属，
 * 供 departments / groups / people 列表/详情/表单页共用。
 */
export function useOrganizationSupport() {
  const departmentsStore = useDepartmentsStore()
  const groupsStore = useGroupsStore()
  const users = ref<UserResponse[]>([])
  const workspaceMembers = ref<WorkspaceMemberDetailResponse[]>([])
  const loading = ref(false)
  let loadRequest = 0

  /** 负责人下拉：全部用户。 */
  const userOptions = computed<SelectOption[]>(() => users.value.map((user) => ({
    value: String(user.id),
    label: `${user.full_name || user.username} · ${user.email}`,
  })))

  /** 详情页「加入部门」下拉：工作区成员中尚未直属于当前部门的人。 */
  const availableMemberUsers = computed<SelectOption[]>(() => {
    const usedIds = new Set(departmentsStore.state.members.map((member) => member.user_id))
    return workspaceMembers.value
      .filter((member) => !usedIds.has(member.user_id))
      .map((member) => ({ value: String(member.user_id), label: member.full_name || member.username }))
  })

  /** 群组详情页「邀请成员」下拉：用户目录中尚未在当前群组(含待审批/已邀请)的人。 */
  const invitableGroupUsers = computed<SelectOption[]>(() => {
    const usedIds = new Set(groupsStore.state.members.map((member) => member.user_id))
    return users.value
      .filter((user) => !usedIds.has(user.id))
      .map((user) => ({ value: String(user.id), label: user.full_name || user.username }))
  })

  /** 人员归属下拉：全部部门(含「未分配」)。 */
  const departmentOptions = computed<SelectOption[]>(() => [
    { value: SELECT_NONE_VALUE, label: '未分配部门' },
    ...departmentsStore.state.items.map((item) => ({ value: String(item.id), label: item.name })),
  ])

  /** 上级部门下拉：排除自身及其全部后代，避免成环。 */
  function parentDepartmentOptions(selfId: number | null): SelectOption[] {
    const excluded = new Set<number>()
    if (selfId != null) {
      excluded.add(selfId)
      const byParent = new Map<number, number[]>()
      for (const item of departmentsStore.state.items) {
        if (item.parent_id == null) continue
        const list = byParent.get(item.parent_id) ?? []
        list.push(item.id)
        byParent.set(item.parent_id, list)
      }
      const stack = [selfId]
      while (stack.length) {
        const current = stack.pop()!
        for (const child of byParent.get(current) ?? []) {
          if (!excluded.has(child)) {
            excluded.add(child)
            stack.push(child)
          }
        }
      }
    }
    return [
      { value: SELECT_NONE_VALUE, label: '无上级部门' },
      ...departmentsStore.state.items
        .filter((item) => !excluded.has(item.id))
        .map((item) => ({ value: String(item.id), label: item.name })),
    ]
  }

  function userName(id?: number | null): string {
    if (id == null) return '—'
    const user = users.value.find((item) => item.id === id)
    return user ? (user.full_name || user.username) : `#${id}`
  }

  function departmentName(id?: number | null): string {
    return departmentsStore.state.items.find((item) => item.id === id)?.name ?? '未分配'
  }

  /** 人员在当前工作区的成员关系(部门/角色/岗位)；非成员返回 null。 */
  function membershipOf(userId?: number | null): WorkspaceMemberDetailResponse | null {
    if (userId == null) return null
    return workspaceMembers.value.find((member) => member.user_id === userId) ?? null
  }

  /** 拉取用户目录 + 工作区成员。返回错误文案或 null(失败时数据被清空)。 */
  async function loadSupportData(workspaceId: number | null): Promise<string | null> {
    const request = ++loadRequest
    if (!workspaceId) {
      users.value = []
      workspaceMembers.value = []
      return null
    }
    loading.value = true
    try {
      const [nextUsers, nextMembers] = await Promise.all([
        getUserList({ limit: 200, offset: 0 }),
        getWorkspaceMemberList(workspaceId),
      ])
      if (request !== loadRequest) return null
      users.value = nextUsers
      workspaceMembers.value = nextMembers
      return null
    } catch (error) {
      if (request !== loadRequest) return null
      users.value = []
      workspaceMembers.value = []
      return error instanceof ApiError ? error.message : '人员目录加载失败'
    } finally {
      if (request === loadRequest) loading.value = false
    }
  }

  function reset() {
    loadRequest += 1
    users.value = []
    workspaceMembers.value = []
    loading.value = false
  }

  return {
    users,
    workspaceMembers,
    loading,
    userOptions,
    availableMemberUsers,
    invitableGroupUsers,
    departmentOptions,
    parentDepartmentOptions,
    userName,
    departmentName,
    membershipOf,
    loadSupportData,
    reset,
  }
}
