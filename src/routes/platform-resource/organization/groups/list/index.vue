<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FilterPanel, ListCard, ResourcePagination, ResourceTable } from '@/components'
import { groupJoinModeLabel, groupTypeLabel, groupVisibilityLabel } from '@/hooks/useGroupEditor'
import { useGroupManager, type GroupEnabledFilter } from '@/hooks/useGroupManager'
import { useHighlightFromQuery } from '@/hooks/useSaveFeedback'
import type { GroupResponse } from '@/interfaces/group/model'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'GroupResourceList' })

const styles = useCssModule()
const manager = useGroupManager()
const authStore = useAuthStore()
const router = useRouter()

const highlight = useHighlightFromQuery()

const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
] as { value: GroupEnabledFilter; label: string }[]

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

function onApplyFilters() {
  // 搜索/筛选：只更新 keyword 与 enabledFilter；page 由 useListUrlState 复位。
  void manager.loadAll(workspaceId.value)
}

function onResetFilters() {
  manager.resetView()
  void manager.loadAll(workspaceId.value)
}

function onPage(page: number) {
  manager.page.value = page
}

function onPageSize(size: number) {
  manager.pageSize.value = size
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
    <FilterPanel
      title="筛选条件"
      :collapsible="true"
      @search="onApplyFilters"
      @reset="onResetFilters"
    >
      <template #default>
        <div :class="styles.filterRow">
          <UInput
            v-model="manager.state.keyword"
            :class="styles.search"
            icon="i-lucide-search"
            placeholder="搜索群组名称、标识或描述（服务端搜索）"
            aria-label="搜索群组"
          >
            <template v-if="manager.state.keyword" #trailing>
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" square size="xs" aria-label="清空搜索" @click="manager.state.keyword = ''" />
            </template>
          </UInput>
          <UTabs
            v-model="manager.state.enabledFilter"
            :class="styles.filterTabs"
            :items="enabledOptions"
            :content="false"
            size="sm"
            aria-label="启用状态筛选"
          />
          <span :class="styles.workspaceName"><UIcon name="i-lucide-panels-top-left" />{{ workspaceName }}</span>
        </div>
      </template>
    </FilterPanel>

    <ListCard title="群组列表" description="组织跨部门协作：维护群组类型、可见性、加入方式与成员审批。点击行进入群组详情页。" :total="manager.total.value">
      <template #toolbar>
        <UButton label="新建群组" icon="i-lucide-plus" color="primary" @click="goToCreate" />
        <UTooltip text="刷新目录">
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" square :loading="manager.loading.value" aria-label="刷新目录" @click="onRefresh" />
        </UTooltip>
      </template>

      <UAlert v-if="manager.loadingError.value" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadingError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: onRefresh }]" />

      <ResourceTable
        :columns="columns"
        :data="manager.pagedItems.value"
        :loading="manager.loading.value"
        :row-key="(item: GroupResponse) => String(item.id)"
        :table-class="styles.table"
        :highlight-id="highlight"
        :empty-mode="'filtered'"
        :resource-name="'群组'"
        @select="goToDetail"
        @clear-filters="onResetFilters"
      >
        <template #name-cell="{ row }">
          <div :class="styles.primaryCell">
            <span :class="styles.entityIcon"><UIcon name="i-lucide-users-round" /></span>
            <span>
              <strong>{{ row.original.name }}<UBadge v-if="manager.isMine(row.original.id)" :class="styles.mineBadge" label="我已加入" color="primary" variant="subtle" size="xs" /></strong>
              <small class="mono">{{ row.original.slug }}</small>
            </span>
          </div>
        </template>
        <template #type-cell="{ row }">{{ groupTypeLabel(row.original.group_type) }}</template>
        <template #visibility-cell="{ row }"><UBadge color="neutral" variant="subtle" size="xs" :class="styles.statusBadge">{{ groupVisibilityLabel(row.original.visibility) }}</UBadge></template>
        <template #joinMode-cell="{ row }"><span :class="styles.joinModeText">{{ groupJoinModeLabel(row.original.join_mode) }}</span></template>
        <template #state-cell="{ row }"><UBadge :class="styles.statusBadge" :color="row.original.is_active ? 'success' : 'neutral'" variant="subtle" size="xs">{{ row.original.is_active ? '启用' : '停用' }}</UBadge></template>
        <template #actions-cell="{ row }">
          <div :class="styles.rowActions">
            <UTooltip text="详情"><UButton icon="i-lucide-eye" color="neutral" variant="ghost" square :aria-label="`查看 ${row.original.name} 详情`" @click.stop="goToDetail(row.original)" /></UTooltip>
            <UTooltip text="编辑"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" square :aria-label="`编辑 ${row.original.name}`" @click.stop="goToEdit(row.original)" /></UTooltip>
            <UTooltip :text="manager.isMine(row.original.id) ? '退出群组' : '加入群组'"><UButton :icon="manager.isMine(row.original.id) ? 'i-lucide-log-out' : 'i-lucide-log-in'" color="neutral" variant="ghost" square :aria-label="`${manager.isMine(row.original.id) ? '退出' : '加入'} ${row.original.name}`" :loading="manager.membershipBusyId.value === row.original.id" :disabled="manager.membershipBusyId.value != null" @click.stop="toggleMembership(row.original)" /></UTooltip>
            <UTooltip text="删除"><UButton icon="i-lucide-trash-2" color="error" variant="ghost" square :aria-label="`删除 ${row.original.name}`" @click.stop="manager.requestDelete(row.original)" /></UTooltip>
          </div>
        </template>
      </ResourceTable>

      <template #footer>
        <ResourcePagination
          :shown="manager.pagedItems.value.length"
          :total="manager.total.value"
          :page="manager.page.value"
          :items-per-page="manager.pageSize.value"
          @update:page="onPage"
          @update:items-per-page="onPageSize"
        />
      </template>
    </ListCard>

    <UModal :open="Boolean(manager.pendingDelete.value)" :title="deleteTitle" description="此操作会直接调用后端删除接口，无法在当前页面撤销。" @update:open="(open) => { if (!open) manager.cancelDelete() }">
      <template #body><UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" title="请确认该群组没有仍需保留的成员或引用。" /></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.cancelDelete" /><UButton label="确认删除" icon="i-lucide-trash-2" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="manager.confirmDelete" /></template>
    </UModal>
  </main>
  <Transition name="dept-toast"><div v-if="manager.toast.value" :class="styles.toast" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
