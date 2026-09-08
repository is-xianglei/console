<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ResourcePagination, ResourceTable } from '@/components'
import { groupJoinModeLabel, groupTypeLabel, groupVisibilityLabel } from '@/hooks/useGroupEditor'
import { useGroupManager } from '@/hooks/useGroupManager'
import type { GroupResponse } from '@/interfaces/group/model'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'GroupResourceList' })

const styles = useCssModule()
const manager = useGroupManager()
const authStore = useAuthStore()
const router = useRouter()

const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
]
const columns: TableColumn<GroupResponse>[] = [
  { id: 'name', header: '群组' },
  { id: 'type', header: '类型' },
  { id: 'visibility', header: '可见性' },
  { id: 'joinMode', header: '加入方式' },
  { id: 'state', header: '状态' },
  { id: 'actions', header: '操作' },
]
const workspaceId = computed(() => authStore.currentWorkspaceId ?? authStore.currentWorkspace?.id ?? null)
const workspaceName = computed(() => authStore.currentWorkspace?.display_name || authStore.currentWorkspace?.name || '未选择工作区')
const deleteTitle = computed(() => manager.pendingDelete.value ? `删除群组「${manager.pendingDelete.value.name}」？` : '删除群组？')

function goToCreate() {
  void router.push({ name: 'group-create' })
}

function goToDetail(item: GroupResponse) {
  void router.push({ name: 'group-detail', params: { id: String(item.id) } })
}

function goToEdit(item: GroupResponse) {
  void router.push({ name: 'group-edit', params: { id: String(item.id) } })
}

/** 行操作「加入/退出」按 isMine 切换，loading 绑定到 manager.membershipBusyId 对应行。 */
function toggleMembership(item: GroupResponse) {
  if (manager.isMine(item.id)) void manager.leaveGroup(item.id)
  else void manager.joinGroup(item.id)
}

async function onRefresh() {
  await manager.loadAll(workspaceId.value)
  if (!manager.loadingError.value) manager.showToast('群组目录已刷新')
}

function clearFilters() {
  manager.search.value = ''
  manager.enabledFilter.value = 'all'
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
          <span :class="styles.titleIcon"><UIcon name="i-lucide-users-round" /></span>
          <div><h1>群组</h1><p>组织跨部门协作：维护群组类型、可见性、加入方式与成员审批。点击行进入群组详情页。</p></div>
          <UBadge label="LIVE API" color="success" variant="subtle" size="xs" />
        </div>
      </div>
      <div :class="styles.headerActions"><UButton label="新建群组" icon="i-lucide-plus" @click="goToCreate" /></div>
    </header>

    <section :class="styles.metrics" aria-label="群组统计">
      <div><span>全部群组</span><strong class="mono">{{ manager.stats.value.all }}</strong></div>
      <div><span>我已加入</span><strong class="mono">{{ manager.stats.value.mine }}</strong></div>
      <div><span>开放加入</span><strong class="mono">{{ manager.stats.value.open }}</strong></div>
      <div><span>已启用</span><strong class="mono">{{ manager.stats.value.enabled }}</strong></div>
    </section>

    <section :class="styles.workspace">
      <div :class="styles.toolbar">
        <UInput v-model="manager.search.value" :class="styles.search" icon="i-lucide-search" placeholder="搜索群组名称、标识或描述（服务端搜索）" aria-label="搜索群组">
          <template v-if="manager.search.value" #trailing><UButton icon="i-lucide-x" color="neutral" variant="ghost" square size="xs" aria-label="清空搜索" @click="manager.search.value = ''" /></template>
        </UInput>
        <UTabs v-model="manager.enabledFilter.value" :class="styles.filterTabs" :items="enabledOptions" :content="false" size="sm" aria-label="启用状态筛选" />
        <span :class="styles.workspaceName"><UIcon name="i-lucide-panels-top-left" />{{ workspaceName }}</span>
        <UTooltip text="刷新目录"><UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" square :loading="manager.loading.value" aria-label="刷新目录" @click="onRefresh" /></UTooltip>
      </div>

      <UAlert v-if="manager.loadingError.value" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadingError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: onRefresh }]" />

      <div :class="styles.listPane">
        <ResourceTable :columns="columns" :data="manager.filteredGroups.value" :loading="manager.loading.value" :row-key="(item: GroupResponse) => String(item.id)" :table-class="styles.table" @select="goToDetail">
          <template #name-cell="{ row }"><div :class="styles.primaryCell"><span :class="styles.entityIcon"><UIcon name="i-lucide-users-round" /></span><span><strong>{{ row.original.name }}<UBadge v-if="manager.isMine(row.original.id)" :class="styles.mineBadge" label="我已加入" color="primary" variant="subtle" size="xs" /></strong><small class="mono">{{ row.original.slug }}</small></span></div></template>
          <template #type-cell="{ row }">{{ groupTypeLabel(row.original.group_type) }}</template>
          <template #visibility-cell="{ row }"><UBadge color="neutral" variant="subtle" size="xs" :class="styles.statusBadge">{{ groupVisibilityLabel(row.original.visibility) }}</UBadge></template>
          <template #joinMode-cell="{ row }"><span :class="styles.joinModeText">{{ groupJoinModeLabel(row.original.join_mode) }}</span></template>
          <template #state-cell="{ row }"><UBadge :class="styles.statusBadge" :color="row.original.is_active ? 'success' : 'neutral'" variant="subtle" size="xs">{{ row.original.is_active ? '启用' : '停用' }}</UBadge></template>
          <template #actions-cell="{ row }"><div :class="styles.rowActions"><UTooltip text="详情"><UButton icon="i-lucide-eye" color="neutral" variant="ghost" square :aria-label="`查看 ${row.original.name} 详情`" @click.stop="goToDetail(row.original)" /></UTooltip><UTooltip text="编辑"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" square :aria-label="`编辑 ${row.original.name}`" @click.stop="goToEdit(row.original)" /></UTooltip><UTooltip :text="manager.isMine(row.original.id) ? '退出群组' : '加入群组'"><UButton :icon="manager.isMine(row.original.id) ? 'i-lucide-log-out' : 'i-lucide-log-in'" color="neutral" variant="ghost" square :aria-label="`${manager.isMine(row.original.id) ? '退出' : '加入'} ${row.original.name}`" :loading="manager.membershipBusyId.value === row.original.id" :disabled="manager.membershipBusyId.value != null" @click.stop="toggleMembership(row.original)" /></UTooltip><UTooltip text="删除"><UButton icon="i-lucide-trash-2" color="error" variant="ghost" square :aria-label="`删除 ${row.original.name}`" @click.stop="manager.requestDelete(row.original)" /></UTooltip></div></template>
          <template #empty><UEmpty icon="i-lucide-users-round" :title="manager.loading.value ? '正在加载群组' : (manager.groups.value.length ? '没有匹配的群组' : '暂无群组')" :description="manager.loading.value ? '正在读取当前工作区群组目录。' : (manager.groups.value.length ? '调整关键词或启用状态筛选后再试。' : '创建群组来组织跨部门协作。')" variant="naked"><template v-if="!manager.loading.value && (manager.groups.value.length || manager.search.value)" #actions><UButton label="清除筛选" variant="link" @click="clearFilters" /></template></UEmpty></template>
        </ResourceTable>
      </div>
      <ResourcePagination :shown="manager.filteredGroups.value.length" :total="manager.stats.value.all" :items-per-page="0" footer-extra="LIVE API" />
    </section>

    <UModal :open="Boolean(manager.pendingDelete.value)" :title="deleteTitle" description="此操作会直接调用后端删除接口，无法在当前页面撤销。" @update:open="(open) => { if (!open) manager.cancelDelete() }">
      <template #body><UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" title="请确认该群组没有仍需保留的成员或引用。" /></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.cancelDelete" /><UButton label="确认删除" icon="i-lucide-trash-2" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="manager.confirmDelete" /></template>
    </UModal>
  </main>
  <Transition name="dept-toast"><div v-if="manager.toast.value" :class="styles.toast" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
