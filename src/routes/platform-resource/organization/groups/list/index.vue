<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, ref, useCssModule, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DateRangeInput, FilterPanel, ListCard, ResourcePagination, ResourceTable } from '@/components'
import GroupFormModal from '../components/group-form-modal/index.vue'
import { groupJoinModeLabel, groupTypeLabel, groupVisibilityLabel } from '@/hooks/useGroupEditor'
import { useGroupManager, type GroupEnabledFilter } from '@/hooks/useGroupManager'
import { useHighlightFromQuery } from '@/hooks/useSaveFeedback'
import type { GroupResponse } from '@/interfaces/group/model'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'GroupResourceList' })

const styles = useCssModule()
const manager = useGroupManager()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const highlight = useHighlightFromQuery()

const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
] as { value: GroupEnabledFilter; label: string }[]

const typeOptions = [
  { value: 'all', label: '全部类型' },
  { value: 'team', label: '团队' },
  { value: 'community', label: '社区' },
  { value: 'region', label: '区域' },
  { value: 'custom', label: '自定义' },
]

/** 列宽由 table-baseline.module.css 的语义列类给出（col-name / col-status / col-time /
 * col-actions 随 ../shared 的 @import 进入本页），其余未标注的列自动分摊剩余宽度。 */
const columns: TableColumn<GroupResponse>[] = [
  { id: 'name', header: '群组', meta: { class: { th: styles['col-name'], td: styles['col-name'] } } },
  { id: 'type', header: '类型', meta: { class: { th: styles['col-status'], td: styles['col-status'] } } },
  { id: 'visibility', header: '可见性', meta: { class: { th: styles['col-status'], td: styles['col-status'] } } },
  // 本页 7 列若全部标语义类，fixed 布局下的盈余会按比例摊回所有列，把 220/104/150/112
  // 全部等比放大（1440 视口实测 265.1/125.3/180.7/135），语义列宽就不再是全站唯一值。
  // 留「加入方式」不标类作为自适应列吸收盈余——它文案最长，也最该吃剩余宽度。
  { id: 'joinMode', header: '加入方式' },
  { id: 'state', header: '状态', meta: { class: { th: styles['col-status'], td: styles['col-status'] } } },
  { id: 'createdAt', header: '创建时间', meta: { class: { th: styles['col-time'], td: styles['col-time'] } } },
  { id: 'actions', header: '操作', meta: { class: { th: styles['col-actions'], td: styles['col-actions'] } } },
]

const workspaceId = computed(() => authStore.currentWorkspaceId ?? authStore.currentWorkspace?.id ?? null)
const deleteTitle = computed(() => manager.pendingDelete.value ? `删除群组「${manager.pendingDelete.value.name}」？` : '删除群组？')
const deleteConfirmDisabled = computed(() => Boolean(manager.deleteBlockers.value && manager.deleteBlockers.value.memberCount > 0))

const formOpen = ref(false)
const formGroupId = ref<number | null>(null)

function goToCreate() {
  formGroupId.value = null
  formOpen.value = true
}

function goToDetail(item: GroupResponse) {
  void router.push({ name: 'group-detail', params: { id: String(item.id) } })
}

function goToEdit(item: GroupResponse) {
  formGroupId.value = item.id
  formOpen.value = true
}

/** 保存成功：按当前筛选重拉列表；保留当前 query（筛选 / 分页）只合并 highlight，高亮刚保存的行。 */
function onSaved(id: number | null) {
  void manager.loadAll(workspaceId.value)
  if (id != null) void router.replace({ query: { ...route.query, highlight: String(id) } })
}

function goToDeleteDetail() {
  const target = manager.pendingDelete.value
  if (target) goToDetail(target)
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
  // 搜索/筛选：只更新 keyword 与 type 等；page 由 useListUrlState 复位。
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
      storage-key="groups"
      @search="onApplyFilters"
      @reset="onResetFilters"
    >
      <UFormField label="群组名称"><UInput v-model="manager.state.keyword" icon="i-lucide-search" placeholder="搜索群组名称、标识或描述" aria-label="搜索群组" /></UFormField>
      <UFormField label="类型">
        <USelect :model-value="manager.state.groupType" :items="typeOptions" aria-label="类型" @update:model-value="(value: unknown) => { manager.state.groupType = String(value ?? 'all') }" />
      </UFormField>
      <UFormField label="创建时间">
        <DateRangeInput v-model="manager.state.dateRange" />
      </UFormField>
      <!-- 原为状态 Tabs：v-model 与选项值不变。与同页「类型」下拉一致，改动即写 state，
           由 manager 的 state 深度监听（300ms 防抖）触发重拉。 -->
      <UFormField label="状态">
        <USelect :model-value="manager.state.enabledFilter" :items="enabledOptions" aria-label="启用状态筛选" @update:model-value="(value: unknown) => { manager.state.enabledFilter = String(value ?? 'all') as GroupEnabledFilter }" />
      </UFormField>
    </FilterPanel>

    <ListCard title="群组列表" description="组织跨部门协作：维护群组类型、可见性、加入方式与成员审批。">
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
          <div :class="styles['primary-cell']">
            <span :class="styles['entity-icon']"><UIcon name="i-lucide-users-round" /></span>
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
        <template #createdAt-cell="{ row }"><RelativeTime :value="row.original.created_at" /></template>
        <template #actions-cell="{ row }">
          <div :class="styles.rowActions">
            <UTooltip text="编辑"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" square :aria-label="`编辑 ${row.original.name}`" @click.stop="goToEdit(row.original)" /></UTooltip>
            <UTooltip :text="manager.isMine(row.original.id) ? '退出群组' : '加入群组'"><UButton :icon="manager.isMine(row.original.id) ? 'i-lucide-log-out' : 'i-lucide-log-in'" color="neutral" variant="ghost" square :aria-label="`${manager.isMine(row.original.id) ? '退出' : '加入'} ${row.original.name}`" :loading="manager.membershipBusyId.value === row.original.id" :disabled="manager.membershipBusyId.value != null" @click.stop="toggleMembership(row.original)" /></UTooltip>
            <UDropdownMenu :items="[
              { label: '查看详情', icon: 'i-lucide-eye', onSelect: () => goToDetail(row.original) },
              { label: '删除', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => manager.requestDelete(row.original) },
            ]">
              <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="`${row.original.name} 更多操作`" />
            </UDropdownMenu>
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
      <template #body>
        <div v-if="manager.blockerBusyId.value != null" :class="styles.blockerBusy">
          <UIcon name="i-lucide-loader-circle" class="animate-spin" />
          <span>正在检查群组成员…</span>
        </div>
        <UAlert v-else-if="manager.deleteBlockers.value" color="error" variant="subtle" icon="i-lucide-triangle-alert" title="该群组仍有成员，无法删除">
          <template #description>
            <ul :class="styles.blockerList">
              <li v-if="manager.deleteBlockers.value.memberCount > 0">存在成员 {{ manager.deleteBlockers.value.memberCount }} 人</li>
              <li v-if="manager.deleteBlockers.value.reason">{{ manager.deleteBlockers.value.reason }}</li>
            </ul>
            <UButton label="前往群组详情处理" color="neutral" variant="link" size="sm" @click="goToDeleteDetail" />
          </template>
        </UAlert>
        <UAlert v-else color="error" variant="subtle" icon="i-lucide-triangle-alert" title="删除后该群组的成员关系与引用一并失效，请确认没有仍需保留的引用。" />
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.cancelDelete" />
        <UButton label="确认删除" icon="i-lucide-trash-2" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value || deleteConfirmDisabled" @click="manager.confirmDelete" />
      </template>
    </UModal>

    <GroupFormModal v-model:open="formOpen" :group-id="formGroupId" @saved="onSaved" />
  </main>
  <Transition name="dept-toast"><div v-if="manager.toast.value" :class="styles.toast" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
