<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { FormError, TableColumn, TableRow } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import { ApiError } from '@/http'
import { createUser, deleteUser, getUserDetail, getUserList, updateUser } from '@/http/user'
import {
  getWorkspaceMemberList,
  inviteWorkspaceMember,
  updateWorkspaceMemberRole,
} from '@/http/workspace'
import type { DepartmentCreateRequest, DepartmentUpdateRequest } from '@/interfaces/department/api'
import type { DepartmentResponse } from '@/interfaces/department/model'
import type { GroupCreateRequest, GroupUpdateRequest } from '@/interfaces/group/api'
import type { GroupResponse } from '@/interfaces/group/model'
import type { ResourcePage } from '@/interfaces/platform/model'
import type { UserResponse } from '@/interfaces/user/model'
import type { WorkspaceMemberDetailResponse } from '@/interfaces/workspace/model'
import { useAuthStore } from '@/stores/auth'
import { useDepartmentsStore } from '@/stores/departments'
import { useGroupsStore } from '@/stores/groups'

defineOptions({ name: 'OrganizationResource' })

type OrganizationResourceKey = 'departments' | 'groups' | 'people'
type PersonRow = UserResponse & { membership?: WorkspaceMemberDetailResponse }

const props = defineProps<{ resource: OrganizationResourceKey; page: ResourcePage }>()
const authStore = useAuthStore()
const departmentsStore = useDepartmentsStore()
const groupsStore = useGroupsStore()
const toast = useToast()
const search = ref('')
const loadingError = ref('')
const formOpen = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const deleteOpen = ref(false)
const deleteLoading = ref(false)
const peopleLoading = ref(false)
const peopleSaving = ref(false)
const users = ref<UserResponse[]>([])
const workspaceMembers = ref<WorkspaceMemberDetailResponse[]>([])
const selectedUserId = ref<number | null>(null)
const selectedUser = ref<UserResponse | null>(null)
const memberUserId = ref('')
const memberRole = ref<'admin' | 'member'>('member')
const memberJobTitle = ref('')
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const departmentDraft = reactive({
  name: '',
  code: '',
  description: '',
  parentId: '',
  managerId: '',
  sortOrder: 0,
  isActive: true,
})
const groupDraft = reactive({
  name: '',
  slug: '',
  description: '',
  groupType: 'team',
  visibility: 'workspace',
  joinMode: 'invite',
  isActive: true,
})
const personDraft = reactive({
  username: '',
  email: '',
  password: '',
  fullName: '',
  avatarUrl: '',
  phone: '',
  addToWorkspace: true,
})

const workspaceId = computed(() => authStore.currentWorkspaceId ?? authStore.currentWorkspace?.id ?? null)
const currentUserId = computed(() => authStore.state.user?.id ?? null)
const selectedDepartment = computed(() => departmentsStore.state.detail)
const selectedGroup = computed(() => groupsStore.state.detail)
const selectedGroupIsMine = computed(() => (
  Boolean(selectedGroup.value && groupsStore.state.myGroups.some((group) => group.id === selectedGroup.value?.id))
))
const busy = computed(() => (
  departmentsStore.state.loading || groupsStore.state.loading || peopleLoading.value
))

const filteredDepartments = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return departmentsStore.state.items
  return departmentsStore.state.items.filter((item) => (
    [item.name, item.code, item.description].some((value) => value?.toLowerCase().includes(query))
  ))
})
const filteredGroups = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return groupsStore.state.items
  return groupsStore.state.items.filter((item) => (
    [item.name, item.slug, item.description, item.group_type].some((value) => value?.toLowerCase().includes(query))
  ))
})
const peopleRows = computed<PersonRow[]>(() => {
  const memberships = new Map(workspaceMembers.value.map((item) => [item.user_id, item]))
  return users.value.map((user) => ({ ...user, membership: memberships.get(user.id) }))
})
const filteredPeople = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return peopleRows.value
  return peopleRows.value.filter((item) => (
    [item.username, item.email, item.full_name, item.phone].some((value) => value?.toLowerCase().includes(query))
  ))
})
const selectedPersonMembership = computed(() => (
  workspaceMembers.value.find((item) => item.user_id === selectedUserId.value) ?? null
))
const availableMemberUsers = computed(() => {
  const usedIds = new Set(groupsStore.state.members.map((member) => member.user_id))
  return users.value
    .filter((user) => !usedIds.has(user.id))
    .map((user) => ({ value: String(user.id), label: user.full_name || user.username }))
})
const userOptions = computed(() => users.value.map((user) => ({
  value: String(user.id),
  label: `${user.full_name || user.username} · ${user.email}`,
})))
const parentDepartmentOptions = computed(() => [
  { value: '', label: '无上级部门' },
  ...departmentsStore.state.items
    .filter((item) => item.id !== selectedDepartment.value?.id)
    .map((item) => ({ value: String(item.id), label: item.name })),
])
const departmentOptions = computed(() => [
  { value: '', label: '未分配部门' },
  ...departmentsStore.state.items.map((item) => ({ value: String(item.id), label: item.name })),
])

const departmentColumns: TableColumn<DepartmentResponse>[] = [
  { accessorKey: 'name', header: '部门' },
  { accessorKey: 'code', header: '编码' },
  { accessorKey: 'sort_order', header: '顺序' },
  { accessorKey: 'is_active', header: '状态' },
  { id: 'actions', header: '' },
]
const groupColumns: TableColumn<GroupResponse>[] = [
  { accessorKey: 'name', header: '群组' },
  { accessorKey: 'group_type', header: '类型' },
  { accessorKey: 'visibility', header: '可见性' },
  { accessorKey: 'join_mode', header: '加入方式' },
  { id: 'actions', header: '' },
]
const peopleColumns: TableColumn<PersonRow>[] = [
  { accessorKey: 'username', header: '人员' },
  { accessorKey: 'email', header: '邮箱' },
  { accessorKey: 'membership.role', header: '角色' },
  { accessorKey: 'membership.department_id', header: '部门' },
  { id: 'actions', header: '' },
]

const metrics = computed(() => {
  if (props.resource === 'departments') {
    return [
      [departmentsStore.state.items.length, '全部部门'],
      [departmentsStore.state.items.filter((item) => item.parent_id == null).length, '一级部门'],
      [departmentsStore.state.items.filter((item) => item.is_active).length, '已启用'],
      [departmentsStore.state.tree.length, '目录根节点'],
    ]
  }
  if (props.resource === 'groups') {
    return [
      [groupsStore.state.items.length, '全部群组'],
      [groupsStore.state.myGroups.length, '我已加入'],
      [groupsStore.state.items.filter((item) => item.join_mode === 'open').length, '开放加入'],
      [groupsStore.state.items.filter((item) => item.is_active).length, '已启用'],
    ]
  }
  return [
    [users.value.length, '全部用户'],
    [workspaceMembers.value.length, '工作区成员'],
    [workspaceMembers.value.filter((item) => item.department_id != null).length, '已分配部门'],
    [workspaceMembers.value.filter((item) => item.role === 'admin').length, '管理员'],
  ]
})

const titleKicker = computed(() => `组织管理 / ${props.page.group}`)
const formTitle = computed(() => `${formMode.value === 'create' ? '新建' : '编辑'}${props.page.title}`)
const deleteTitle = computed(() => {
  if (props.resource === 'departments') return `删除部门「${selectedDepartment.value?.name ?? ''}」？`
  if (props.resource === 'groups') return `删除群组「${selectedGroup.value?.name ?? ''}」？`
  return `删除用户「${selectedUser.value?.full_name || selectedUser.value?.username || ''}」？`
})

function showResult(error: string | null, success: string) {
  if (error) {
    toast.add({ title: error, color: 'error', icon: 'i-lucide-circle-alert' })
    return false
  }
  toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' })
  return true
}

function unexpectedError(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

async function loadPeople() {
  if (!workspaceId.value) return
  peopleLoading.value = true
  try {
    const [nextUsers, nextMembers] = await Promise.all([
      getUserList({ limit: 200, offset: 0 }),
      getWorkspaceMemberList(workspaceId.value),
    ])
    users.value = nextUsers
    workspaceMembers.value = nextMembers
    if (selectedUserId.value && !nextUsers.some((user) => user.id === selectedUserId.value)) {
      selectedUserId.value = null
      selectedUser.value = null
    }
  } catch (error) {
    loadingError.value = unexpectedError(error, '人员目录加载失败')
  } finally {
    peopleLoading.value = false
  }
}

async function loadResource() {
  loadingError.value = ''
  const id = workspaceId.value
  if (!id) {
    loadingError.value = '当前账号没有可用工作区'
    return
  }
  let error: string | null = null
  if (props.resource === 'departments') error = await departmentsStore.loadDepartments(id)
  if (props.resource === 'groups') error = await groupsStore.loadGroups(id)
  if (props.resource === 'people') await loadPeople()
  if (error) loadingError.value = error
}

async function loadSupportData() {
  if (!workspaceId.value) return
  try {
    const [nextUsers, nextMembers] = await Promise.all([
      getUserList({ limit: 200, offset: 0 }),
      getWorkspaceMemberList(workspaceId.value),
    ])
    users.value = nextUsers
    workspaceMembers.value = nextMembers
  } catch {
    users.value = []
    workspaceMembers.value = []
  }
}

watch([() => props.resource, workspaceId], async () => {
  search.value = ''
  formOpen.value = false
  deleteOpen.value = false
  selectedUserId.value = null
  selectedUser.value = null
  await loadResource()
  if (props.resource !== 'people') await loadSupportData()
}, { immediate: true })

watch(search, (value) => {
  if (props.resource !== 'groups' || !workspaceId.value) return
  if (debounceTimer.value) clearTimeout(debounceTimer.value)
  debounceTimer.value = setTimeout(async () => {
    const error = await groupsStore.loadGroups(workspaceId.value!, value.trim())
    if (error) loadingError.value = error
  }, 300)
})

onBeforeUnmount(() => {
  if (debounceTimer.value) clearTimeout(debounceTimer.value)
})

async function selectDepartment(_event: Event, row: TableRow<DepartmentResponse>) {
  const error = await departmentsStore.selectDepartment(row.original.id)
  if (error) showResult(error, '')
}

async function selectGroup(_event: Event, row: TableRow<GroupResponse>) {
  const error = await groupsStore.selectGroup(row.original.id)
  if (error) showResult(error, '')
}

async function selectPerson(_event: Event, row: TableRow<PersonRow>) {
  selectedUserId.value = row.original.id
  try {
    selectedUser.value = await getUserDetail(row.original.id)
  } catch (error) {
    showResult(unexpectedError(error, '用户详情加载失败'), '')
  }
}

function resetDepartmentDraft(item?: DepartmentResponse | null) {
  departmentDraft.name = item?.name ?? ''
  departmentDraft.code = item?.code ?? ''
  departmentDraft.description = item?.description ?? ''
  departmentDraft.parentId = item?.parent_id == null ? '' : String(item.parent_id)
  departmentDraft.managerId = item?.manager_id == null ? '' : String(item.manager_id)
  departmentDraft.sortOrder = item?.sort_order ?? 0
  departmentDraft.isActive = item?.is_active ?? true
}

function resetGroupDraft(item?: GroupResponse | null) {
  groupDraft.name = item?.name ?? ''
  groupDraft.slug = item?.slug ?? ''
  groupDraft.description = item?.description ?? ''
  groupDraft.groupType = item?.group_type ?? 'team'
  groupDraft.visibility = item?.visibility ?? 'workspace'
  groupDraft.joinMode = item?.join_mode ?? 'invite'
  groupDraft.isActive = item?.is_active ?? true
}

function resetPersonDraft(item?: UserResponse | null) {
  personDraft.username = item?.username ?? ''
  personDraft.email = item?.email ?? ''
  personDraft.password = ''
  personDraft.fullName = item?.full_name ?? ''
  personDraft.avatarUrl = item?.avatar_url ?? ''
  personDraft.phone = item?.phone ?? ''
  personDraft.addToWorkspace = true
}

function openCreate() {
  formMode.value = 'create'
  if (props.resource === 'departments') resetDepartmentDraft()
  if (props.resource === 'groups') resetGroupDraft()
  if (props.resource === 'people') resetPersonDraft()
  formOpen.value = true
}

function openEdit() {
  formMode.value = 'edit'
  if (props.resource === 'departments' && selectedDepartment.value) resetDepartmentDraft(selectedDepartment.value)
  else if (props.resource === 'groups' && selectedGroup.value) resetGroupDraft(selectedGroup.value)
  else if (props.resource === 'people' && selectedUser.value) resetPersonDraft(selectedUser.value)
  else return
  formOpen.value = true
}

function validateForm(): FormError[] {
  if (props.resource === 'departments') {
    return departmentDraft.name.trim() ? [] : [{ name: 'name', message: '请输入部门名称' }]
  }
  if (props.resource === 'groups') {
    const errors: FormError[] = []
    if (!groupDraft.name.trim()) errors.push({ name: 'name', message: '请输入群组名称' })
    if (!/^[a-z0-9-]+$/.test(groupDraft.slug)) errors.push({ name: 'slug', message: '仅支持小写字母、数字和连字符' })
    return errors
  }
  const errors: FormError[] = []
  if (!personDraft.fullName.trim()) errors.push({ name: 'fullName', message: '请输入姓名' })
  if (formMode.value === 'create') {
    if (!personDraft.username.trim()) errors.push({ name: 'username', message: '请输入用户名' })
    if (!personDraft.email.trim()) errors.push({ name: 'email', message: '请输入邮箱' })
    if (personDraft.password.length < 8) errors.push({ name: 'password', message: '密码至少 8 位' })
  }
  return errors
}

async function saveForm() {
  let error: string | null = null
  if (props.resource === 'departments') {
    const payload: DepartmentCreateRequest | DepartmentUpdateRequest = {
      name: departmentDraft.name.trim(),
      code: departmentDraft.code.trim() || null,
      description: departmentDraft.description.trim() || null,
      parent_id: departmentDraft.parentId ? Number(departmentDraft.parentId) : null,
      manager_id: departmentDraft.managerId ? Number(departmentDraft.managerId) : null,
      sort_order: departmentDraft.sortOrder,
      is_active: departmentDraft.isActive,
    }
    error = await departmentsStore.saveDepartment(
      payload,
      formMode.value === 'edit' ? selectedDepartment.value?.id : undefined,
    )
  } else if (props.resource === 'groups') {
    const payload: GroupCreateRequest | GroupUpdateRequest = {
      name: groupDraft.name.trim(),
      slug: groupDraft.slug.trim(),
      description: groupDraft.description.trim() || null,
      group_type: groupDraft.groupType as GroupCreateRequest['group_type'],
      visibility: groupDraft.visibility as GroupCreateRequest['visibility'],
      join_mode: groupDraft.joinMode as GroupCreateRequest['join_mode'],
      ...(formMode.value === 'edit' ? { is_active: groupDraft.isActive } : {}),
    }
    error = await groupsStore.saveGroup(
      payload,
      formMode.value === 'edit' ? selectedGroup.value?.id : undefined,
    )
  } else {
    peopleSaving.value = true
    try {
      if (formMode.value === 'create') {
        const created = await createUser({
          username: personDraft.username.trim(),
          email: personDraft.email.trim(),
          password: personDraft.password,
          full_name: personDraft.fullName.trim(),
        })
        if (personDraft.addToWorkspace && workspaceId.value) {
          await inviteWorkspaceMember(workspaceId.value, { email: created.email, role: 'member' })
        }
        selectedUserId.value = created.id
        selectedUser.value = created
      } else if (selectedUserId.value) {
        selectedUser.value = await updateUser(selectedUserId.value, {
          full_name: personDraft.fullName.trim(),
          avatar_url: personDraft.avatarUrl.trim() || null,
          phone: personDraft.phone.trim() || null,
        })
      }
      await loadPeople()
    } catch (caught) {
      error = unexpectedError(caught, formMode.value === 'create' ? '用户创建失败' : '用户更新失败')
    } finally {
      peopleSaving.value = false
    }
  }
  if (showResult(error, `${props.page.title}已${formMode.value === 'create' ? '创建' : '更新'}`)) {
    formOpen.value = false
  }
}

async function confirmDelete() {
  deleteLoading.value = true
  let error: string | null = null
  if (props.resource === 'departments' && selectedDepartment.value) {
    error = await departmentsStore.removeDepartment(selectedDepartment.value.id)
  } else if (props.resource === 'groups' && selectedGroup.value) {
    error = await groupsStore.removeGroup(selectedGroup.value.id)
  } else if (props.resource === 'people' && selectedUserId.value) {
    try {
      await deleteUser(selectedUserId.value)
      selectedUserId.value = null
      selectedUser.value = null
      await loadPeople()
    } catch (caught) {
      error = unexpectedError(caught, '用户删除失败')
    }
  }
  deleteLoading.value = false
  if (showResult(error, `${props.page.title}已删除`)) deleteOpen.value = false
}

async function assignDepartment() {
  const userId = Number(memberUserId.value || selectedUserId.value)
  if (!userId) return
  const departmentId = props.resource === 'departments'
    ? selectedDepartment.value?.id ?? null
    : memberUserId.value ? Number(memberUserId.value) : null
  const error = await departmentsStore.setMemberDepartment(userId, {
    department_id: departmentId,
    job_title: memberJobTitle.value.trim() || null,
  })
  if (showResult(error, '成员部门已更新')) {
    memberUserId.value = ''
    memberJobTitle.value = ''
    await loadSupportData()
  }
}

async function updatePersonDepartment(departmentId: string) {
  if (!selectedUserId.value) return
  const error = await departmentsStore.setMemberDepartment(selectedUserId.value, {
    department_id: departmentId ? Number(departmentId) : null,
    job_title: selectedPersonMembership.value?.job_title ?? null,
  })
  if (showResult(error, '人员归属已更新')) await loadPeople()
}

async function updatePersonRole(role: string) {
  if (!workspaceId.value || !selectedUserId.value) return
  try {
    await updateWorkspaceMemberRole(workspaceId.value, selectedUserId.value, {
      role: role as 'admin' | 'member',
    })
    await loadPeople()
    showResult(null, '工作区角色已更新')
  } catch (error) {
    showResult(unexpectedError(error, '角色更新失败'), '')
  }
}

async function inviteGroupMember() {
  const userId = Number(memberUserId.value)
  if (!userId) return
  const error = await groupsStore.inviteMember(userId, memberRole.value)
  if (showResult(error, '群组邀请已发送')) memberUserId.value = ''
}

async function runGroupAction(action: () => Promise<string | null>, success: string) {
  showResult(await action(), success)
}

function departmentName(id?: number | null) {
  return departmentsStore.state.items.find((item) => item.id === id)?.name ?? '未分配'
}

function groupTypeLabel(value: string) {
  return { team: '团队', community: '社区', region: '区域', custom: '自定义' }[value] ?? value
}

function membershipStatusLabel(value: string) {
  return { active: '已加入', pending: '待审批', invited: '已邀请' }[value] ?? value
}
</script>

<template>
  <main :class="$style.page">
    <header :class="$style.header">
      <div :class="$style.heading">
        <nav :class="$style.breadcrumb" aria-label="面包屑">{{ titleKicker }}</nav>
        <div :class="$style.titleRow">
          <span :class="$style.titleIcon"><UIcon :name="`i-lucide-${page.icon}`" /></span>
          <div><h1>{{ page.title }}</h1><p>{{ page.description }}</p></div>
          <UBadge label="LIVE API" color="success" variant="subtle" size="xs" />
        </div>
      </div>
      <UButton :label="page.action" icon="i-lucide-plus" @click="openCreate" />
    </header>

    <section :class="$style.metrics" aria-label="目录统计">
      <div v-for="metric in metrics" :key="metric[1]"><span>{{ metric[1] }}</span><strong class="mono">{{ metric[0] }}</strong></div>
    </section>

    <section :class="$style.workspace">
      <div :class="$style.toolbar">
        <UInput v-model="search" :class="$style.search" icon="i-lucide-search" :placeholder="`搜索${page.title}名称、标识或描述`">
          <template v-if="search" #trailing><UButton icon="i-lucide-x" color="neutral" variant="ghost" square size="xs" aria-label="清空搜索" @click="search = ''" /></template>
        </UInput>
        <span :class="$style.workspaceName"><UIcon name="i-lucide-panels-top-left" />{{ authStore.currentWorkspace?.display_name || authStore.currentWorkspace?.name || '未选择工作区' }}</span>
        <UTooltip text="刷新目录"><UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" square :loading="busy" aria-label="刷新目录" @click="loadResource" /></UTooltip>
      </div>

      <UAlert v-if="loadingError" :class="$style.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="loadingError" />

      <div :class="$style.content">
        <section :class="$style.listPane">
          <UTable v-if="resource === 'departments'" :data="filteredDepartments" :columns="departmentColumns" :loading="departmentsStore.state.loading" :class="$style.table" :get-row-id="(row: DepartmentResponse) => String(row.id)" @select="selectDepartment">
            <template #name-cell="{ row }"><div :class="$style.primaryCell"><span :class="$style.entityIcon"><UIcon name="i-lucide-building-2" /></span><span><strong>{{ row.original.name }}</strong><small class="mono">#{{ row.original.id }}</small></span></div></template>
            <template #code-cell="{ row }"><span class="mono">{{ row.original.code || '—' }}</span></template>
            <template #is_active-cell="{ row }"><UBadge :color="row.original.is_active ? 'success' : 'neutral'" variant="subtle" size="xs">{{ row.original.is_active ? '启用' : '停用' }}</UBadge></template>
            <template #actions-cell="{ row }"><UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" square aria-label="查看部门" @click.stop="departmentsStore.selectDepartment(row.original.id)" /></template>
            <template #empty><UEmpty icon="i-lucide-building-2" title="暂无部门" description="创建第一个部门来建立组织层级。" variant="naked" /></template>
          </UTable>

          <UTable v-else-if="resource === 'groups'" :data="filteredGroups" :columns="groupColumns" :loading="groupsStore.state.loading" :class="$style.table" :get-row-id="(row: GroupResponse) => String(row.id)" @select="selectGroup">
            <template #name-cell="{ row }"><div :class="$style.primaryCell"><span :class="$style.entityIcon"><UIcon name="i-lucide-users-round" /></span><span><strong>{{ row.original.name }}</strong><small class="mono">{{ row.original.slug }}</small></span></div></template>
            <template #group_type-cell="{ row }">{{ groupTypeLabel(row.original.group_type) }}</template>
            <template #visibility-cell="{ row }"><UBadge color="neutral" variant="subtle" size="xs">{{ row.original.visibility }}</UBadge></template>
            <template #join_mode-cell="{ row }"><span class="mono">{{ row.original.join_mode }}</span></template>
            <template #actions-cell="{ row }"><UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" square aria-label="查看群组" @click.stop="groupsStore.selectGroup(row.original.id)" /></template>
            <template #empty><UEmpty icon="i-lucide-users-round" title="暂无群组" description="创建群组来组织跨部门协作。" variant="naked" /></template>
          </UTable>

          <UTable v-else :data="filteredPeople" :columns="peopleColumns" :loading="peopleLoading" :class="$style.table" :get-row-id="(row: PersonRow) => String(row.id)" @select="selectPerson">
            <template #username-cell="{ row }"><div :class="$style.primaryCell"><UAvatar :alt="row.original.full_name || row.original.username" :src="row.original.avatar_url || undefined" size="sm" /><span><strong>{{ row.original.full_name || row.original.username }}</strong><small class="mono">@{{ row.original.username }}</small></span></div></template>
            <template #membership_role-cell="{ row }"><UBadge :color="row.original.membership?.role === 'admin' ? 'primary' : 'neutral'" variant="subtle" size="xs">{{ row.original.membership?.role || '非成员' }}</UBadge></template>
            <template #membership_department_id-cell="{ row }">{{ departmentName(row.original.membership?.department_id) }}</template>
            <template #actions-cell="{ row }"><UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" square aria-label="查看人员" @click.stop="selectPerson($event, { original: row.original } as TableRow<PersonRow>)" /></template>
            <template #empty><UEmpty icon="i-lucide-user-round" title="暂无人员" description="创建用户或邀请成员加入当前工作区。" variant="naked" /></template>
          </UTable>
        </section>

        <aside :class="$style.inspector">
          <template v-if="resource === 'departments' && selectedDepartment">
            <header :class="$style.inspectorHeader"><div><span class="mono">DEPT-{{ selectedDepartment.id }}</span><h2>{{ selectedDepartment.name }}</h2></div><div :class="$style.headerActions"><UTooltip text="编辑部门"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" square aria-label="编辑部门" @click="openEdit" /></UTooltip><UTooltip text="删除部门"><UButton icon="i-lucide-trash-2" color="error" variant="ghost" square aria-label="删除部门" @click="deleteOpen = true" /></UTooltip></div></header>
            <div :class="$style.inspectorBody">
              <p :class="$style.description">{{ selectedDepartment.description || '未填写部门描述。' }}</p>
              <dl :class="$style.meta"><div><dt>编码</dt><dd class="mono">{{ selectedDepartment.code || '—' }}</dd></div><div><dt>上级部门</dt><dd>{{ departmentName(selectedDepartment.parent_id) }}</dd></div><div><dt>祖先层级</dt><dd>{{ departmentsStore.state.ancestors.length }}</dd></div><div><dt>下级部门</dt><dd>{{ departmentsStore.state.descendants.length }}</dd></div></dl>
              <div :class="$style.sectionHeader"><div><span>MEMBERS</span><h3>部门成员</h3></div><UBadge :label="String(departmentsStore.state.members.length)" color="neutral" variant="subtle" /></div>
              <div :class="$style.inlineForm"><USelect v-model="memberUserId" :items="userOptions" placeholder="选择工作区成员" /><UInput v-model="memberJobTitle" placeholder="岗位（可选）" /><UButton icon="i-lucide-user-plus" aria-label="加入部门" @click="assignDepartment" /></div>
              <div :class="$style.memberList"><div v-for="member in departmentsStore.state.members" :key="member.user_id" :class="$style.memberRow"><UAvatar :alt="member.full_name || member.username" :src="member.avatar_url || undefined" size="sm" /><span><strong>{{ member.full_name || member.username }}</strong><small>{{ member.job_title || member.email }}</small></span><UTooltip text="移出部门"><UButton icon="i-lucide-user-minus" color="error" variant="ghost" square aria-label="移出部门" @click="departmentsStore.setMemberDepartment(member.user_id, { department_id: null, job_title: null }).then((error) => showResult(error, '成员已移出部门'))" /></UTooltip></div><UEmpty v-if="!departmentsStore.state.members.length" icon="i-lucide-users" title="暂无直属成员" variant="naked" /></div>
            </div>
          </template>

          <template v-else-if="resource === 'groups' && selectedGroup">
            <header :class="$style.inspectorHeader"><div><span class="mono">GROUP-{{ selectedGroup.id }}</span><h2>{{ selectedGroup.name }}</h2></div><div :class="$style.headerActions"><UButton :label="selectedGroupIsMine ? '退出' : '加入'" :icon="selectedGroupIsMine ? 'i-lucide-log-out' : 'i-lucide-log-in'" color="neutral" variant="outline" size="xs" @click="selectedGroupIsMine ? runGroupAction(() => groupsStore.leaveGroup(selectedGroup!.id), '已退出群组') : runGroupAction(() => groupsStore.joinGroup(selectedGroup!.id), '加入请求已提交')" /><UTooltip text="编辑群组"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" square aria-label="编辑群组" @click="openEdit" /></UTooltip><UTooltip text="删除群组"><UButton icon="i-lucide-trash-2" color="error" variant="ghost" square aria-label="删除群组" @click="deleteOpen = true" /></UTooltip></div></header>
            <div :class="$style.inspectorBody">
              <p :class="$style.description">{{ selectedGroup.description || '未填写群组描述。' }}</p>
              <dl :class="$style.meta"><div><dt>类型</dt><dd>{{ groupTypeLabel(selectedGroup.group_type) }}</dd></div><div><dt>可见性</dt><dd class="mono">{{ selectedGroup.visibility }}</dd></div><div><dt>加入方式</dt><dd class="mono">{{ selectedGroup.join_mode }}</dd></div><div><dt>负责人</dt><dd class="mono">#{{ selectedGroup.owner_id }}</dd></div></dl>
              <div :class="$style.sectionHeader"><div><span>MEMBERS</span><h3>群组成员</h3></div><UBadge :label="String(groupsStore.state.members.length)" color="neutral" variant="subtle" /></div>
              <div :class="$style.inlineForm"><USelect v-model="memberUserId" :items="availableMemberUsers" placeholder="选择用户" /><USelect v-model="memberRole" :items="[{ value: 'member', label: '成员' }, { value: 'admin', label: '管理员' }]" /><UButton icon="i-lucide-send" aria-label="发送邀请" @click="inviteGroupMember" /></div>
              <div :class="$style.memberList"><div v-for="member in groupsStore.state.members" :key="member.id" :class="$style.memberRow"><UAvatar :alt="member.full_name || member.username" :src="member.avatar_url || undefined" size="sm" /><span><strong>{{ member.full_name || member.username }}</strong><small>{{ membershipStatusLabel(member.status) }} · {{ member.role }}</small></span><div :class="$style.memberActions"><template v-if="member.status === 'pending'"><UTooltip text="批准申请"><UButton icon="i-lucide-check" color="success" variant="ghost" square aria-label="批准申请" @click="runGroupAction(() => groupsStore.approveMember(member.user_id), '申请已批准')" /></UTooltip><UTooltip text="拒绝申请"><UButton icon="i-lucide-x" color="error" variant="ghost" square aria-label="拒绝申请" @click="runGroupAction(() => groupsStore.rejectMember(member.user_id), '申请已拒绝')" /></UTooltip></template><template v-else><UTooltip :text="member.role === 'admin' ? '设为成员' : '设为管理员'"><UButton :icon="member.role === 'admin' ? 'i-lucide-user' : 'i-lucide-shield-check'" color="neutral" variant="ghost" square aria-label="切换成员角色" @click="runGroupAction(() => groupsStore.changeMemberRole(member.user_id, { role: member.role === 'admin' ? 'member' : 'admin' }), '成员角色已更新')" /></UTooltip><UTooltip v-if="member.user_id !== selectedGroup.owner_id" text="转让负责人"><UButton icon="i-lucide-crown" color="neutral" variant="ghost" square aria-label="转让负责人" @click="runGroupAction(() => groupsStore.transferOwner(member.user_id), '群组负责人已转让')" /></UTooltip><UTooltip v-if="member.user_id !== currentUserId" text="移除成员"><UButton icon="i-lucide-user-minus" color="error" variant="ghost" square aria-label="移除成员" @click="runGroupAction(() => groupsStore.removeMember(member.user_id), '成员已移除')" /></UTooltip></template></div></div><UEmpty v-if="!groupsStore.state.members.length" icon="i-lucide-users" title="暂无成员" variant="naked" /></div>
            </div>
          </template>

          <template v-else-if="resource === 'people' && selectedUser">
            <header :class="$style.inspectorHeader"><div><span class="mono">USER-{{ selectedUser.id }}</span><h2>{{ selectedUser.full_name || selectedUser.username }}</h2></div><div :class="$style.headerActions"><UTooltip text="编辑人员"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" square aria-label="编辑人员" @click="openEdit" /></UTooltip><UTooltip text="删除用户"><UButton icon="i-lucide-trash-2" color="error" variant="ghost" square aria-label="删除用户" :disabled="selectedUser.id === currentUserId" @click="deleteOpen = true" /></UTooltip></div></header>
            <div :class="$style.inspectorBody"><div :class="$style.personHero"><UAvatar :alt="selectedUser.full_name || selectedUser.username" :src="selectedUser.avatar_url || undefined" size="xl" /><div><strong>{{ selectedUser.full_name || selectedUser.username }}</strong><span>{{ selectedUser.email }}</span></div></div><dl :class="$style.meta"><div><dt>用户名</dt><dd class="mono">@{{ selectedUser.username }}</dd></div><div><dt>手机号</dt><dd>{{ selectedUser.phone || '—' }}</dd></div><div><dt>认证来源</dt><dd class="mono">{{ selectedUser.auth_provider || 'local' }}</dd></div><div><dt>最近登录</dt><dd class="mono">{{ selectedUser.last_login_at || '—' }}</dd></div></dl><div :class="$style.sectionHeader"><div><span>WORKSPACE</span><h3>工作区归属</h3></div><UBadge :color="selectedPersonMembership ? 'success' : 'neutral'" variant="subtle">{{ selectedPersonMembership ? '已加入' : '非成员' }}</UBadge></div><div v-if="selectedPersonMembership" :class="$style.assignmentForm"><UFormField label="部门"><USelect :model-value="String(selectedPersonMembership.department_id ?? '')" :items="departmentOptions" @update:model-value="updatePersonDepartment(String($event))" /></UFormField><UFormField label="工作区角色"><USelect :model-value="selectedPersonMembership.role" :items="[{ value: 'member', label: '成员' }, { value: 'admin', label: '管理员' }]" @update:model-value="updatePersonRole(String($event))" /></UFormField><UFormField label="岗位"><UInput :model-value="selectedPersonMembership.job_title || ''" disabled /></UFormField></div><UAlert v-else color="neutral" variant="subtle" icon="i-lucide-user-round-x" title="该用户尚未加入当前工作区" /></div>
          </template>

          <div v-else :class="$style.emptyInspector"><UIcon :name="`i-lucide-${page.icon}`" /><h2>选择一项查看详情</h2><p>详情、成员和常用管理操作会显示在这里。</p></div>
        </aside>
      </div>
    </section>

    <USlideover v-model:open="formOpen" :title="formTitle" :description="formMode === 'create' ? '数据将直接写入当前后端服务。' : '保存后立即更新当前工作区目录。'" :ui="{ content: 'org-form-slideover' }">
      <template #body>
        <UForm id="organization-form" :state="resource === 'departments' ? departmentDraft : resource === 'groups' ? groupDraft : personDraft" :validate="validateForm" :class="$style.form" @submit="saveForm">
          <template v-if="resource === 'departments'"><UFormField label="部门名称" name="name" required><UInput v-model="departmentDraft.name" autofocus /></UFormField><UFormField label="部门编码" name="code"><UInput v-model="departmentDraft.code" class="mono" /></UFormField><UFormField label="上级部门" name="parentId"><USelect v-model="departmentDraft.parentId" :items="parentDepartmentOptions" /></UFormField><UFormField label="负责人" name="managerId"><USelect v-model="departmentDraft.managerId" :items="[{ value: '', label: '暂不设置' }, ...userOptions]" /></UFormField><UFormField label="排序" name="sortOrder"><UInputNumber v-model="departmentDraft.sortOrder" :min="0" /></UFormField><UFormField label="描述" name="description"><UTextarea v-model="departmentDraft.description" autoresize :maxrows="6" /></UFormField><div :class="$style.toggle"><span><strong>启用部门</strong><small>停用后仍保留组织与成员关系。</small></span><USwitch v-model="departmentDraft.isActive" /></div></template>
          <template v-else-if="resource === 'groups'"><UFormField label="群组名称" name="name" required><UInput v-model="groupDraft.name" autofocus /></UFormField><UFormField label="唯一标识" name="slug" required><UInput v-model="groupDraft.slug" class="mono" /></UFormField><UFormField label="类型" name="groupType"><USelect v-model="groupDraft.groupType" :items="[{ value: 'team', label: '团队' }, { value: 'community', label: '社区' }, { value: 'region', label: '区域' }, { value: 'custom', label: '自定义' }]" /></UFormField><UFormField label="可见性" name="visibility"><USelect v-model="groupDraft.visibility" :items="[{ value: 'workspace', label: '工作区' }, { value: 'private', label: '私有' }, { value: 'public', label: '公开' }]" /></UFormField><UFormField label="加入方式" name="joinMode"><USelect v-model="groupDraft.joinMode" :items="[{ value: 'invite', label: '仅邀请' }, { value: 'open', label: '开放加入' }, { value: 'approval', label: '申请审批' }]" /></UFormField><UFormField label="描述" name="description"><UTextarea v-model="groupDraft.description" autoresize :maxrows="6" /></UFormField><div v-if="formMode === 'edit'" :class="$style.toggle"><span><strong>启用群组</strong><small>停用后成员关系继续保留。</small></span><USwitch v-model="groupDraft.isActive" /></div></template>
          <template v-else><UFormField label="姓名" name="fullName" required><UInput v-model="personDraft.fullName" autofocus /></UFormField><UFormField label="用户名" name="username" :required="formMode === 'create'"><UInput v-model="personDraft.username" class="mono" :disabled="formMode === 'edit'" /></UFormField><UFormField label="邮箱" name="email" :required="formMode === 'create'"><UInput v-model="personDraft.email" type="email" :disabled="formMode === 'edit'" /></UFormField><UFormField v-if="formMode === 'create'" label="初始密码" name="password" required><UInput v-model="personDraft.password" type="password" autocomplete="new-password" /></UFormField><template v-else><UFormField label="头像 URL" name="avatarUrl"><UInput v-model="personDraft.avatarUrl" /></UFormField><UFormField label="手机号" name="phone"><UInput v-model="personDraft.phone" /></UFormField></template><div v-if="formMode === 'create'" :class="$style.toggle"><span><strong>邀请加入当前工作区</strong><small>创建用户后同步发送工作区邀请。</small></span><USwitch v-model="personDraft.addToWorkspace" /></div></template>
        </UForm>
      </template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" @click="formOpen = false" /><UButton type="submit" form="organization-form" label="保存" icon="i-lucide-save" :loading="departmentsStore.state.saving || groupsStore.state.saving || peopleSaving" /></template>
    </USlideover>

    <UModal v-model:open="deleteOpen" :title="deleteTitle" description="此操作会直接调用后端删除接口，无法在当前页面撤销。">
      <template #body><UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" title="请确认该资源没有仍需保留的成员或引用。" /></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" @click="deleteOpen = false" /><UButton label="确认删除" icon="i-lucide-trash-2" color="error" :loading="deleteLoading" @click="confirmDelete" /></template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
