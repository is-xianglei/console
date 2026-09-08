<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useOrganizationSupport } from '@/hooks/useOrganizationSupport'
import type { DepartmentMemberResponse } from '@/interfaces/department/model'
import { useAuthStore } from '@/stores/auth'
import { useDepartmentsStore } from '@/stores/departments'

defineOptions({ name: 'DepartmentResourceDetail' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const departmentsStore = useDepartmentsStore()
const support = useOrganizationSupport()

const loadingError = ref('')
const pendingDelete = ref(false)
const deleting = ref(false)
const memberUserId = ref('')
const memberJobTitle = ref('')
const memberBusy = ref(false)
const removingUserId = ref<number | null>(null)
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
let loadRequest = 0

const departmentId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})
const workspaceId = computed(() => authStore.currentWorkspaceId ?? authStore.currentWorkspace?.id ?? null)
const department = computed(() => (
  departmentsStore.state.detail?.id === departmentId.value ? departmentsStore.state.detail : null
))
const loading = computed(() => departmentsStore.state.loading || departmentsStore.state.detailLoading)
const ancestors = computed(() => departmentsStore.state.ancestors)
const descendants = computed(() => departmentsStore.state.descendants)
const members = computed<DepartmentMemberResponse[]>(() => departmentsStore.state.members)

function formatTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}

function showToast(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2600)
}

function goToList() {
  void router.push({ name: 'platform-resource', params: { module: 'organization', resource: 'departments' } })
}

function goToEdit() {
  void router.push({ name: 'department-edit', params: { id: String(departmentId.value) } })
}

function goToCreateChild() {
  void router.push({ name: 'department-create', query: { parent: String(departmentId.value) } })
}

function goToDepartment(id: number) {
  void router.push({ name: 'department-detail', params: { id: String(id) } })
}

async function load() {
  const request = ++loadRequest
  loadingError.value = ''
  const id = workspaceId.value
  if (!id) {
    loadingError.value = '当前账号没有可用工作区'
    return
  }
  if (departmentsStore.state.workspaceId !== id || !departmentsStore.state.items.length) {
    const listError = await departmentsStore.loadDepartments(id)
    if (request !== loadRequest) return
    if (listError) {
      loadingError.value = listError
      return
    }
  }
  const [detailError] = await Promise.all([
    departmentsStore.selectDepartment(departmentId.value),
    support.loadSupportData(id),
  ])
  if (request !== loadRequest) return
  if (detailError) loadingError.value = detailError
}

/** 成员子表格「加入」行：选工作区成员 + 岗位 → setMemberDepartment(user, { department_id: 当前部门 })。 */
async function assignMember() {
  const userId = Number(memberUserId.value)
  if (!userId || !department.value || memberBusy.value) return
  memberBusy.value = true
  try {
    const error = await departmentsStore.setMemberDepartment(userId, {
      department_id: department.value.id,
      job_title: memberJobTitle.value.trim() || null,
    })
    if (error) {
      loadingError.value = error
      return
    }
    memberUserId.value = ''
    memberJobTitle.value = ''
    loadingError.value = ''
    showToast('成员已加入部门')
    await support.loadSupportData(workspaceId.value)
  } finally {
    memberBusy.value = false
  }
}

/** 成员行「移出部门」：setMemberDepartment(user, { department_id: null, job_title: null })。 */
async function removeMember(member: DepartmentMemberResponse) {
  if (removingUserId.value != null) return
  removingUserId.value = member.user_id
  try {
    const error = await departmentsStore.setMemberDepartment(member.user_id, { department_id: null, job_title: null })
    if (error) {
      loadingError.value = error
      return
    }
    loadingError.value = ''
    showToast(`${member.full_name || member.username} 已移出部门`)
    await support.loadSupportData(workspaceId.value)
  } finally {
    removingUserId.value = null
  }
}

async function confirmDelete() {
  if (!department.value || deleting.value) return
  deleting.value = true
  try {
    const error = await departmentsStore.removeDepartment(department.value.id)
    if (error) {
      loadingError.value = error
      return
    }
    goToList()
  } finally {
    deleting.value = false
    pendingDelete.value = false
  }
}

watch(
  () => [departmentId.value, workspaceId.value] as const,
  () => { void load() },
  { immediate: true },
)
</script>

<template>
  <main :class="styles.page">
    <header :class="styles.header">
      <div :class="styles.heading">
        <nav :class="styles.breadcrumb" aria-label="面包屑"><span>组织管理</span><i class="icon icon-chevron-right"></i><span>部门</span><i class="icon icon-chevron-right"></i><strong>详情</strong></nav>
        <div :class="styles.titleRow">
          <span :class="styles.titleIcon"><UIcon name="i-lucide-building-2" /></span>
          <div><h1>{{ department?.name ?? '部门详情' }}</h1><p v-if="department">DEPT-{{ department.id }} · {{ department.description || '未填写部门描述。' }}</p><p v-else>查看部门的层级、负责人与直属成员。</p></div>
          <UBadge v-if="department" :color="department.is_active ? 'success' : 'neutral'" variant="subtle" size="xs">{{ department.is_active ? '启用' : '停用' }}</UBadge>
        </div>
      </div>
      <div :class="styles.headerActions"><UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="goToList" /><UButton icon="i-lucide-pencil" label="编辑部门" :disabled="!department" @click="goToEdit" /></div>
    </header>

    <UAlert v-if="loadingError" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="loadingError" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: load }]" />
    <UAlert v-else-if="!loading && !department" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" title="未找到该部门" description="可能已被删除或工作区已切换。" :actions="[{ label: '返回列表', color: 'neutral', variant: 'outline', onClick: goToList }]" />

    <section v-if="department" :class="styles.detailShell" aria-label="部门详情">
      <div :class="styles.card">
        <div :class="styles.stateRow"><span class="mono">DEPT-{{ department.id }}</span><span>更新于 {{ formatTime(department.updated_at) }}</span></div>
        <dl :class="styles.meta">
          <div><dt>编码</dt><dd class="mono">{{ department.code || '—' }}</dd></div>
          <div><dt>上级部门</dt><dd>{{ department.parent_id == null ? '无（一级部门）' : support.departmentName(department.parent_id) }}</dd></div>
          <div><dt>负责人</dt><dd>{{ support.userName(department.manager_id) }}</dd></div>
          <div><dt>排序</dt><dd class="mono">{{ department.sort_order }}</dd></div>
          <div><dt>祖先层级</dt><dd>{{ ancestors.length }}</dd></div>
          <div><dt>下级部门</dt><dd>{{ descendants.length }}</dd></div>
          <div><dt>创建时间</dt><dd>{{ formatTime(department.created_at) }}</dd></div>
        </dl>

        <div :class="styles.sectionHeader"><div><span>ANCESTORS</span><h3>祖先路径</h3></div></div>
        <div :class="styles.hierarchy"><template v-if="ancestors.length"><span v-for="item in ancestors" :key="item.id" role="link" tabindex="0" @click="goToDepartment(item.id)" @keydown.enter="goToDepartment(item.id)">{{ item.name }}</span></template><em v-else>当前为一级部门</em></div>

        <div :class="styles.sectionHeader"><div><span>DESCENDANTS</span><h3>下级部门</h3></div><UButton icon="i-lucide-plus" label="新建下级" color="neutral" variant="ghost" size="xs" @click="goToCreateChild" /></div>
        <div :class="styles.hierarchy"><template v-if="descendants.length"><span v-for="item in descendants" :key="item.id" role="link" tabindex="0" @click="goToDepartment(item.id)" @keydown.enter="goToDepartment(item.id)">{{ item.name }}</span></template><em v-else>暂无下级部门</em></div>

        <footer :class="styles.detailActions">
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" square aria-label="删除当前部门" @click="pendingDelete = true" />
          <UButton icon="i-lucide-pencil" label="编辑部门" @click="goToEdit" />
        </footer>
      </div>

      <aside :class="styles.card" aria-label="部门成员">
        <div :class="styles.sectionHeader" style="margin-top: 0"><div><span>MEMBERS</span><h3>直属成员</h3></div><UBadge :label="String(members.length)" color="neutral" variant="subtle" /></div>
        <div :class="styles.inlineForm"><USelect v-model="memberUserId" :items="support.availableMemberUsers.value" placeholder="选择工作区成员" aria-label="选择工作区成员" :disabled="memberBusy" /><UInput v-model="memberJobTitle" placeholder="岗位（可选）" aria-label="岗位" :disabled="memberBusy" /><UTooltip text="加入部门"><UButton icon="i-lucide-user-plus" aria-label="加入部门" :loading="memberBusy" :disabled="!memberUserId" @click="assignMember" /></UTooltip></div>
        <div :class="styles.memberTable" role="table" aria-label="部门成员列表">
          <div v-for="member in members" :key="member.user_id" :class="styles.memberRow" role="row">
            <UAvatar :alt="member.full_name || member.username" :src="member.avatar_url || undefined" size="sm" />
            <span role="cell"><strong>{{ member.full_name || member.username }}</strong><small>{{ member.job_title || member.email }}</small></span>
            <UBadge :class="styles.memberRole" :color="member.role === 'admin' ? 'primary' : 'neutral'" variant="subtle" size="xs">{{ member.role }}</UBadge>
            <div :class="styles.memberActions" role="cell"><UTooltip text="移出部门"><UButton icon="i-lucide-user-minus" color="error" variant="ghost" square :aria-label="`将 ${member.full_name || member.username} 移出部门`" :loading="removingUserId === member.user_id" :disabled="removingUserId != null" @click="removeMember(member)" /></UTooltip></div>
          </div>
          <UEmpty v-if="!members.length" icon="i-lucide-users" title="暂无直属成员" description="从上方选择工作区成员加入本部门。" variant="naked" />
        </div>
      </aside>
    </section>

    <UModal :open="pendingDelete" :title="`删除部门「${department?.name ?? ''}」？`" description="此操作会直接调用后端删除接口，无法在当前页面撤销。" @update:open="(open) => { if (!open) pendingDelete = false }">
      <template #body><UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" title="请确认该部门没有仍需保留的成员或下级部门。" /></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="deleting" @click="pendingDelete = false" /><UButton label="确认删除" icon="i-lucide-trash-2" color="error" :loading="deleting" :disabled="deleting" @click="confirmDelete" /></template>
    </UModal>
  </main>
  <Transition name="dept-toast"><div v-if="toast" :class="styles.toast" role="status"><i class="icon icon-circle-check-big"></i>{{ toast }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
