<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ResourcePagination, ResourceTable } from '@/components'
import { USER_LIST_LIMIT, type PersonRow, usePeopleManager, workspaceRoleLabel } from '@/hooks/usePeopleManager'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'PeopleResourceList' })

const styles = useCssModule()
const manager = usePeopleManager()
const authStore = useAuthStore()
const router = useRouter()

const membershipOptions = [
  { value: 'all', label: '全部' },
  { value: 'member', label: '工作区成员' },
  { value: 'admin', label: '管理员' },
  { value: 'non-member', label: '非成员' },
]
const columns: TableColumn<PersonRow>[] = [
  { id: 'name', header: '人员' },
  { id: 'email', header: '邮箱' },
  { id: 'role', header: '角色' },
  { id: 'department', header: '部门' },
  { id: 'jobTitle', header: '岗位' },
  { id: 'actions', header: '操作' },
]
const workspaceId = computed(() => authStore.currentWorkspaceId ?? authStore.currentWorkspace?.id ?? null)
const workspaceName = computed(() => authStore.currentWorkspace?.display_name || authStore.currentWorkspace?.name || '未选择工作区')
const deleteTitle = computed(() => {
  const target = manager.pendingDelete.value
  return target ? `删除用户「${target.full_name || target.username}」？` : '删除用户？'
})

function personName(item: PersonRow) {
  return item.full_name || item.username
}

function goToCreate() {
  void router.push({ name: 'person-create' })
}

function goToDetail(item: PersonRow) {
  void router.push({ name: 'person-detail', params: { id: String(item.id) } })
}

function goToEdit(item: PersonRow) {
  void router.push({ name: 'person-edit', params: { id: String(item.id) } })
}

async function onRefresh() {
  await manager.loadAll(workspaceId.value)
  if (!manager.loadingError.value) manager.showToast('人员目录已刷新')
}

function clearFilters() {
  manager.search.value = ''
  manager.membershipFilter.value = 'all'
}

watch(
  workspaceId,
  (id) => {
    manager.resetView()
    void manager.loadAll(id)
  },
  { immediate: true },
)
</script>

<template>
  <main :class="styles.page">
    <header :class="styles.header">
      <div :class="styles.heading">
        <nav :class="styles.breadcrumb" aria-label="面包屑"><span>组织管理</span><i class="icon icon-chevron-right"></i><strong>组织目录</strong></nav>
        <div :class="styles.titleRow">
          <span :class="styles.titleIcon"><UIcon name="i-lucide-user-round" /></span>
          <div><h1>人员</h1><p>查看用户目录与其在当前工作区的部门、角色、岗位归属；点击行进入人员详情页，在详情页调整归属。</p></div>
          <UBadge label="LIVE API" color="success" variant="subtle" size="xs" />
        </div>
      </div>
      <div :class="styles.headerActions"><UButton label="邀请人员" icon="i-lucide-user-plus" @click="goToCreate" /></div>
    </header>

    <section :class="styles.metrics" aria-label="人员统计">
      <div><span>全部用户</span><strong class="mono">{{ manager.stats.value.all }}</strong></div>
      <div><span>工作区成员</span><strong class="mono">{{ manager.stats.value.members }}</strong></div>
      <div><span>已分配部门</span><strong class="mono">{{ manager.stats.value.assigned }}</strong></div>
      <div><span>管理员</span><strong class="mono">{{ manager.stats.value.admins }}</strong></div>
    </section>

    <section :class="styles.workspace">
      <div :class="styles.toolbar">
        <UInput v-model="manager.search.value" :class="styles.search" icon="i-lucide-search" placeholder="搜索用户名、邮箱、姓名或手机号" aria-label="搜索人员">
          <template v-if="manager.search.value" #trailing><UButton icon="i-lucide-x" color="neutral" variant="ghost" square size="xs" aria-label="清空搜索" @click="manager.search.value = ''" /></template>
        </UInput>
        <UTabs v-model="manager.membershipFilter.value" :class="styles.filterTabs" :items="membershipOptions" :content="false" size="sm" aria-label="工作区归属筛选" />
        <span :class="styles.workspaceName"><UIcon name="i-lucide-panels-top-left" />{{ workspaceName }}</span>
        <UTooltip text="刷新目录"><UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" square :loading="manager.loading.value" aria-label="刷新目录" @click="onRefresh" /></UTooltip>
      </div>

      <UAlert v-if="manager.loadingError.value" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadingError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: onRefresh }]" />
      <UAlert v-if="manager.userLimitReached.value" :class="styles.limitAlert" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="`仅显示前 ${USER_LIST_LIMIT} 名用户`" description="用户目录已达单次拉取上限，超出部分暂不展示，可用搜索精确定位。" />

      <div :class="styles.listPane">
        <ResourceTable :columns="columns" :data="manager.filteredPeople.value" :loading="manager.loading.value" :row-key="(item: PersonRow) => String(item.id)" :table-class="styles.table" @select="goToDetail">
          <template #name-cell="{ row }"><div :class="styles.primaryCell"><UAvatar :alt="personName(row.original)" :src="row.original.avatar_url || undefined" size="sm" /><span><strong>{{ personName(row.original) }}<UBadge v-if="manager.isSelf(row.original.id)" :class="styles.mineBadge" label="我" color="primary" variant="subtle" size="xs" /></strong><small class="mono">@{{ row.original.username }} · #{{ row.original.id }}</small></span></div></template>
          <template #email-cell="{ row }"><span :class="styles.emailText">{{ row.original.email }}</span></template>
          <template #role-cell="{ row }"><UBadge :class="styles.statusBadge" :color="row.original.membership ? (row.original.membership.role === 'admin' ? 'primary' : 'success') : 'neutral'" variant="subtle" size="xs">{{ workspaceRoleLabel(row.original.membership?.role) }}</UBadge></template>
          <template #department-cell="{ row }">{{ row.original.membership ? manager.departmentName(row.original.membership.department_id) : '—' }}</template>
          <template #jobTitle-cell="{ row }">{{ row.original.membership?.job_title || '—' }}</template>
          <template #actions-cell="{ row }"><div :class="styles.rowActions"><UTooltip text="详情"><UButton icon="i-lucide-eye" color="neutral" variant="ghost" square :aria-label="`查看 ${personName(row.original)} 详情`" @click.stop="goToDetail(row.original)" /></UTooltip><UTooltip text="编辑"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" square :aria-label="`编辑 ${personName(row.original)}`" @click.stop="goToEdit(row.original)" /></UTooltip><UTooltip :text="manager.isSelf(row.original.id) ? '不能删除当前登录用户' : '删除'"><UButton icon="i-lucide-trash-2" color="error" variant="ghost" square :aria-label="`删除 ${personName(row.original)}`" :disabled="manager.isSelf(row.original.id)" @click.stop="manager.requestDelete(row.original)" /></UTooltip></div></template>
          <template #empty><UEmpty icon="i-lucide-user-round" :title="manager.loading.value ? '正在加载人员' : (manager.people.value.length ? '没有匹配的人员' : '暂无人员')" :description="manager.loading.value ? '正在读取用户目录与当前工作区成员。' : (manager.people.value.length ? '调整关键词或归属筛选后再试。' : '创建用户或邀请成员加入当前工作区。')" variant="naked"><template v-if="!manager.loading.value && (manager.people.value.length || manager.search.value)" #actions><UButton label="清除筛选" variant="link" @click="clearFilters" /></template></UEmpty></template>
        </ResourceTable>
      </div>
      <ResourcePagination :shown="manager.filteredPeople.value.length" :total="manager.stats.value.all" :items-per-page="0" footer-extra="LIVE API" />
    </section>

    <UModal :open="Boolean(manager.pendingDelete.value)" :title="deleteTitle" description="此操作会直接调用后端删除接口，无法在当前页面撤销。" @update:open="(open) => { if (!open) manager.cancelDelete() }">
      <template #body><UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" title="删除后该用户的工作区成员关系与归属一并失效，请确认没有仍需保留的引用。" /></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.cancelDelete" /><UButton label="确认删除" icon="i-lucide-trash-2" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="manager.confirmDelete" /></template>
    </UModal>
  </main>
  <Transition name="dept-toast"><div v-if="manager.toast.value" :class="styles.toast" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
