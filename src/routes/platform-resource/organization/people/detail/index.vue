<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/http'
import { getUserDetail } from '@/http/user'
import { WORKSPACE_ROLE_OPTIONS, usePeopleManager, workspaceRoleLabel } from '@/hooks/usePeopleManager'
import { SELECT_NONE_VALUE } from '@/hooks/useOrganizationSupport'
import type { UserResponse } from '@/interfaces/user/model'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'PeopleResourceDetail' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const manager = usePeopleManager()

const person = ref<UserResponse | null>(null)
const detailLoading = ref(false)
const loadingError = ref('')
const pendingDelete = ref(false)
let loadRequest = 0

const userId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})
const workspaceId = computed(() => authStore.currentWorkspaceId ?? authStore.currentWorkspace?.id ?? null)
const workspaceName = computed(() => authStore.currentWorkspace?.display_name || authStore.currentWorkspace?.name || '当前工作区')
const loading = computed(() => detailLoading.value || manager.loading.value)
const isSelf = computed(() => manager.isSelf(userId.value))
/** 工作区归属来自 workspaceMembers(随 manager 刷新)，非成员为 null。 */
const membership = computed(() => manager.membershipOf(userId.value))
const personName = computed(() => person.value ? (person.value.full_name || person.value.username) : '')

function formatTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}

function goToList() {
  void router.push({ name: 'platform-resource', params: { module: 'organization', resource: 'people' } })
}

function goToEdit() {
  void router.push({ name: 'person-edit', params: { id: String(userId.value) }, query: { from: 'detail' } })
}

/** getUserDetail 失败时返回错误文案，便于与 manager.loadAll 并行。 */
async function fetchDetail(id: number): Promise<UserResponse | string> {
  try {
    return await getUserDetail(id)
  } catch (error) {
    return error instanceof ApiError ? error.message : '用户详情加载失败'
  }
}

/** 用户详情(users 接口)与 users + workspaceMembers + 部门目录(manager.loadAll)并行拉取。 */
async function load() {
  const request = ++loadRequest
  loadingError.value = ''
  const id = workspaceId.value
  if (!id) {
    loadingError.value = '当前账号没有可用工作区'
    return
  }
  detailLoading.value = true
  try {
    const [detail] = await Promise.all([fetchDetail(userId.value), manager.loadAll(id)])
    if (request !== loadRequest) return
    if (typeof detail === 'string') {
      person.value = null
      loadingError.value = detail
      return
    }
    person.value = detail
    if (manager.loadingError.value) loadingError.value = manager.loadingError.value
  } finally {
    if (request === loadRequest) detailLoading.value = false
  }
}

/** 部门变更：departmentsStore.setMemberDepartment → 重拉 workspaceMembers。 */
async function onDepartmentChange(value: unknown) {
  if (!membership.value) return
  const departmentId = value === SELECT_NONE_VALUE ? '' : String(value ?? '')
  if (departmentId === String(membership.value.department_id ?? '')) return
  const error = await manager.updateDepartment(userId.value, departmentId)
  if (error) {
    loadingError.value = error
    return
  }
  loadingError.value = ''
  manager.showToast(`${personName.value} 的部门已更新为「${manager.departmentName(departmentId ? Number(departmentId) : null)}」`)
}

/** 角色变更：updateWorkspaceMemberRole → 重拉 workspaceMembers；自己不可降级。 */
async function onRoleChange(value: unknown) {
  if (!membership.value) return
  const role = String(value ?? '')
  if (!role || role === membership.value.role) return
  const error = await manager.updateRole(userId.value, role)
  if (error) {
    loadingError.value = error
    return
  }
  loadingError.value = ''
  manager.showToast(`${personName.value} 的工作区角色已更新为「${workspaceRoleLabel(role)}」`)
}

async function confirmDelete() {
  if (!person.value || manager.deleting.value) return
  if (isSelf.value) {
    pendingDelete.value = false
    loadingError.value = '不能删除当前登录用户'
    return
  }
  manager.requestDelete({ ...person.value, membership: membership.value })
  const ok = await manager.confirmDelete()
  pendingDelete.value = false
  if (!ok) {
    if (manager.loadingError.value) loadingError.value = manager.loadingError.value
    return
  }
  goToList()
}

watch(
  () => [userId.value, workspaceId.value] as const,
  () => { void load() },
  { immediate: true },
)
</script>

<template>
  <main :class="styles.page">
    <header :class="styles.header">
      <div :class="styles.heading">
        <nav :class="styles.breadcrumb" aria-label="面包屑"><span>组织管理</span><i class="icon icon-chevron-right"></i><span>人员</span><i class="icon icon-chevron-right"></i><strong>详情</strong></nav>
        <div :class="styles.titleRow">
          <span :class="styles.titleIcon"><UIcon name="i-lucide-user-round" /></span>
          <div><h1>{{ personName || '人员详情' }}</h1><p v-if="person">USER-{{ person.id }} · <span class="mono">@{{ person.username }}</span> · {{ person.email }}</p><p v-else>查看人员身份信息与当前工作区的部门、角色、岗位归属。</p></div>
          <UBadge v-if="person" :class="styles.roleBadge" :color="membership ? (membership.role === 'admin' ? 'primary' : 'success') : 'neutral'" variant="subtle" size="xs">{{ membership ? `工作区${workspaceRoleLabel(membership.role)}` : '非工作区成员' }}</UBadge>
          <UBadge v-if="person && isSelf" color="primary" variant="subtle" size="xs">我</UBadge>
        </div>
      </div>
      <div :class="styles.headerActions">
        <UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="goToList" />
        <UButton icon="i-lucide-pencil" label="编辑人员" :disabled="!person" @click="goToEdit" />
      </div>
    </header>

    <UAlert v-if="loadingError" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="loadingError" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: load }]" />
    <UAlert v-else-if="!loading && !person" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" title="未找到该用户" description="可能已被删除或工作区已切换。" :actions="[{ label: '返回列表', color: 'neutral', variant: 'outline', onClick: goToList }]" />

    <section v-if="person" :class="styles.detailShell" aria-label="人员详情">
      <div :class="styles.card">
        <div :class="styles.stateRow"><span class="mono">USER-{{ person.id }}</span><span>更新于 {{ formatTime(person.updated_at) }}</span></div>
        <div :class="styles.personHero" style="margin-top: 12px"><UAvatar :alt="personName" :src="person.avatar_url || undefined" size="xl" /><div><strong>{{ personName }}</strong><span>{{ person.email }}</span></div></div>
        <div :class="styles.sectionHeader"><div><span>IDENTITY</span><h3>身份信息</h3></div><UBadge :color="person.suspended ? 'error' : 'success'" variant="subtle" size="xs">{{ person.suspended ? '已停用' : '正常' }}</UBadge></div>
        <dl :class="styles.meta">
          <div><dt>用户名</dt><dd class="mono">@{{ person.username }}</dd></div>
          <div><dt>邮箱</dt><dd>{{ person.email }}<template v-if="person.email_verified"> · 已验证</template></dd></div>
          <div><dt>手机号</dt><dd>{{ person.phone || '—' }}</dd></div>
          <div><dt>认证来源</dt><dd class="mono">{{ person.auth_provider || 'local' }}</dd></div>
          <div><dt>最近登录</dt><dd>{{ formatTime(person.last_login_at) }}</dd></div>
          <div><dt>创建时间</dt><dd>{{ formatTime(person.created_at) }}</dd></div>
        </dl>

        <footer :class="styles.detailActions">
          <UTooltip :text="isSelf ? '不能删除当前登录用户' : '删除用户'"><UButton icon="i-lucide-trash-2" color="error" variant="ghost" square aria-label="删除当前用户" :disabled="isSelf" @click="pendingDelete = true" /></UTooltip>
          <UButton icon="i-lucide-pencil" label="编辑人员" @click="goToEdit" />
        </footer>
      </div>

      <!-- 工作区归属：部门走 departmentsStore.setMemberDepartment，角色走 updateWorkspaceMemberRole，变更后重拉 workspaceMembers。 -->
      <aside :class="styles.card" aria-label="工作区归属">
        <div :class="styles.sectionHeader" style="margin-top: 0"><div><span>WORKSPACE</span><h3>工作区归属</h3></div><div :class="styles.badgeGroup"><UBadge :class="styles.roleBadge" :color="membership ? 'success' : 'neutral'" variant="subtle">{{ membership ? '已加入' : '非成员' }}</UBadge></div></div>
        <template v-if="membership">
          <div :class="styles.assignmentForm">
            <UFormField label="部门" :description="`归属于 ${workspaceName} 的部门；选择「未分配部门」即移出当前部门。`"><USelect :model-value="String(membership.department_id ?? SELECT_NONE_VALUE)" :items="manager.departmentOptions.value" :loading="manager.assigning.value" :disabled="manager.assigning.value" aria-label="部门" @update:model-value="onDepartmentChange" /></UFormField>
            <UFormField label="工作区角色" :description="isSelf ? '不能修改自己的工作区角色。' : undefined"><USelect :model-value="membership.role" :items="WORKSPACE_ROLE_OPTIONS" :loading="manager.assigning.value" :disabled="manager.assigning.value || isSelf" aria-label="工作区角色" @update:model-value="onRoleChange" /></UFormField>
            <UFormField label="岗位" description="岗位随部门成员关系维护，可在部门详情页调整。"><UInput :model-value="membership.job_title || ''" placeholder="未填写" disabled aria-label="岗位" /></UFormField>
          </div>
          <dl :class="styles.meta">
            <div><dt>加入时间</dt><dd>{{ formatTime(membership.joined_at) }}</dd></div>
            <div><dt>邀请时间</dt><dd>{{ formatTime(membership.invited_at) }}</dd></div>
          </dl>
        </template>
        <template v-else>
          <UAlert style="margin-top: 10px" color="neutral" variant="subtle" icon="i-lucide-user-round-x" title="该用户尚未加入当前工作区" :description="`加入 ${workspaceName} 后才能分配部门与角色。`" />
          <p :class="styles.assignmentHint">可在新建人员时开启「邀请加入当前工作区」，或由工作区管理员发送邀请。</p>
        </template>
      </aside>
    </section>

    <UModal :open="pendingDelete" :title="`删除用户「${personName}」？`" description="此操作会直接调用后端删除接口，无法在当前页面撤销。" @update:open="(open) => { if (!open) pendingDelete = false }">
      <template #body><UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" title="删除后该用户的工作区成员关系与归属一并失效，请确认没有仍需保留的引用。" /></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="pendingDelete = false" /><UButton label="确认删除" icon="i-lucide-trash-2" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="confirmDelete" /></template>
    </UModal>
  </main>
  <Transition name="dept-toast"><div v-if="manager.toast.value" :class="styles.toast" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
