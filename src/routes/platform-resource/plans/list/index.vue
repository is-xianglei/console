<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FilterPanel, ListCard, ResourcePagination, ResourceTable } from '@/components'
import { PLAN_MODE_LABEL, useOrchestrationPlanManager, type PlanEnabledFilter } from '@/hooks/useOrchestrationPlanManager'
import { useHighlightFromQuery } from '@/hooks/useSaveFeedback'
import type { PlanResponse } from '@/interfaces/orchestration-plan/api'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'PlanResourceList' })

const styles = useCssModule()
const manager = useOrchestrationPlanManager()
const authStore = useAuthStore()
const router = useRouter()

const highlight = useHighlightFromQuery()

const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
] as { value: PlanEnabledFilter; label: string }[]

const modeOptions: Array<{ value: 'all' | PlanResponse['mode']; label: string }> = [
  { value: 'all', label: '全部模式' },
  { value: 'sequential', label: '顺序执行' },
  { value: 'parallel', label: '并行执行' },
  { value: 'routing', label: '智能路由' },
  { value: 'loop', label: '循环迭代' },
]

const columns: TableColumn<PlanResponse>[] = [
  { id: 'plan', header: '方案', meta: { class: { th: styles['col-name'], td: styles['col-name'] } } },
  { id: 'state', header: '状态', meta: { class: { th: styles['col-status'], td: styles['col-status'] } } },
  { id: 'mode', header: '编排模式', meta: { class: { th: styles['col-status'], td: styles['col-status'] } } },
  { id: 'members', header: '成员' },
  { id: 'createdAt', header: '创建时间', meta: { class: { th: styles['col-time'], td: styles['col-time'] } } },
  { id: 'actions', header: '操作', meta: { class: { th: styles['col-actions'], td: styles['col-actions'] } } },
]

const deleteTitle = computed(() => manager.pendingDelete.value ? `删除 ${manager.pendingDelete.value.name}？` : '删除编排方案？')

function planCode(id: number) {
  return `PLAN-${String(id).padStart(4, '0')}`
}

function sortedMembers(plan: PlanResponse) {
  return [...plan.members].sort((left, right) => left.position - right.position)
}

function hasUnavailableMember(plan: PlanResponse) {
  return plan.members.some((member) => !member.is_available)
}

function goToCreate() {
  void router.push({ name: 'plan-create', params: { module: 'build', resource: 'plans' } })
}

function goToDetail(plan: PlanResponse) {
  void router.push({ name: 'plan-detail', params: { id: String(plan.id) } })
}

function goToEdit(plan: PlanResponse) {
  void router.push({ name: 'plan-edit', params: { id: String(plan.id) } })
}

function goToDuplicate(plan: PlanResponse) {
  void router.push({ name: 'plan-create', params: { module: 'build', resource: 'plans' }, query: { duplicate: String(plan.id) } })
}

async function onRefresh() {
  await manager.loadAll()
  if (!manager.loadingError.value) manager.showToast('编排方案与 Agent 目录已刷新')
}

function onApplyFilters() {
  void manager.loadAll()
}

function onResetFilters() {
  manager.resetView()
  void manager.loadAll()
}

function onPage(page: number) {
  manager.page.value = page
}

function onPageSize(size: number) {
  manager.pageSize.value = size
}

watch(
  () => authStore.currentWorkspaceId,
  (workspaceId) => {
    if (workspaceId) void manager.loadAll()
  },
  { immediate: true },
)
</script>

<template>
  <main :class="styles.page">
    <FilterPanel
      title="筛选条件"
      :collapsible="true"
      :columns="4"
      @search="onApplyFilters"
      @reset="onResetFilters"
    >
      <UFormField label="关键字"><UInput v-model="manager.state.keyword" icon="i-lucide-search" placeholder="搜索名称、ID、描述或成员" aria-label="搜索编排方案" @keydown.enter="onApplyFilters" /></UFormField>
      <UFormField label="启用状态"><USelect :model-value="manager.state.enabled" :items="enabledOptions" aria-label="启用状态筛选" @update:model-value="(value: unknown) => { manager.state.enabled = String(value ?? 'all') as PlanEnabledFilter }" /></UFormField>
      <UFormField label="编排模式"><USelect :model-value="manager.state.mode" :items="modeOptions" aria-label="编排模式筛选" @update:model-value="(value: unknown) => { manager.state.mode = value as ('all' | PlanResponse['mode']) }" /></UFormField>
      <UFormField label="创建时间">
        <div :class="styles.dateRange">
          <UInput :model-value="manager.state.dateRange[0]" type="date" aria-label="开始日期" @update:model-value="(value: unknown) => { manager.state.dateRange = [String(value ?? ''), manager.state.dateRange[1]] }" />
          <span>~</span>
          <UInput :model-value="manager.state.dateRange[1]" type="date" aria-label="结束日期" @update:model-value="(value: unknown) => { manager.state.dateRange = [manager.state.dateRange[0], String(value ?? '')] }" />
        </div>
      </UFormField>
    </FilterPanel>

    <ListCard title="编排方案" :description="`勾选 2-5 个 Agent 组成方案；已启用 ${manager.stats.value.enabled}，含失效成员 ${manager.stats.value.broken}。`" :total="manager.total.value">
      <template #toolbar>
        <UButton label="新建方案" icon="i-lucide-plus" color="primary" @click="goToCreate" />
        <UTooltip :text="manager.selectedCount.value ? '批量启用' : '请先勾选至少一行'">
          <UButton label="启用" icon="i-lucide-power" color="neutral" variant="outline" :disabled="!manager.selectedCount.value || manager.batchBusy.value" :aria-label="'批量启用'" @click="manager.batchEnable" />
        </UTooltip>
        <UTooltip :text="manager.selectedCount.value ? '批量停用' : '请先勾选至少一行'">
          <UButton label="停用" icon="i-lucide-power-off" color="neutral" variant="outline" :disabled="!manager.selectedCount.value || manager.batchBusy.value" :aria-label="'批量停用'" @click="manager.batchDisable" />
        </UTooltip>
        <UTooltip :text="manager.selectedCount.value ? '批量删除' : '请先勾选至少一行'">
          <UButton label="删除" icon="i-lucide-trash-2" color="error" variant="outline" :disabled="!manager.selectedCount.value || manager.batchBusy.value" :aria-label="'批量删除'" @click="manager.batchDelete" />
        </UTooltip>
        <UDropdownMenu :items="[[
          { label: '刷新', icon: 'i-lucide-refresh-cw', onSelect: () => { void onRefresh() } },
        ]]">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="'更多操作'" />
        </UDropdownMenu>
      </template>
      <template #tools>
        <span :class="styles.workspaceName"><UIcon name="i-lucide-panels-top-left" />{{ authStore.currentWorkspace?.display_name || authStore.currentWorkspace?.name || '未选择工作区' }}</span>
      </template>

      <UAlert v-if="manager.loadingError.value" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadingError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: onRefresh }]" />

      <ResourceTable
        :columns="columns"
        :data="manager.pagedItems.value"
        :loading="manager.loading.value"
        :row-key="(plan: PlanResponse) => String(plan.id)"
        :table-class="styles.table"
        :selectable="true"
        :selected="manager.selectedIds.value"
        :pin-actions="true"
        :highlight-id="highlight"
        :empty-mode="manager.filteredPlans.value.length ? 'filtered' : 'never'"
        :resource-name="'编排方案'"
        @update:selected="(ids: string[]) => { manager.selectedIds.value = ids }"
        @select="goToDetail"
        @clear-filters="onResetFilters"
      >
        <template #plan-cell="{ row }">
          <div :class="styles['primary-cell']">
            <span :class="styles['entity-icon']"><UIcon name="i-lucide-workflow" /></span>
            <span>
              <strong>{{ row.original.name }}</strong>
              <small class="mono">{{ planCode(row.original.id) }}</small>
            </span>
          </div>
        </template>
        <template #state-cell="{ row }">
          <UBadge :color="row.original.is_enabled ? 'success' : 'neutral'" variant="subtle" size="xs" :class="styles.statusBadge">{{ row.original.is_enabled ? '已启用' : '已停用' }}</UBadge>
        </template>
        <template #mode-cell="{ row }"><span :class="styles.modeText">{{ PLAN_MODE_LABEL[row.original.mode] }}</span></template>
        <template #members-cell="{ row }">
          <span :class="styles.memberText">{{ row.original.members.length }} 个成员</span>
          <small v-if="hasUnavailableMember(row.original)" :class="styles.memberAlert"><UIcon name="i-lucide-triangle-alert" />成员已停用</small>
          <small v-else>{{ sortedMembers(row.original).slice(0, 3).map((member) => member.agent_name).join(' → ') }}</small>
        </template>
        <template #createdAt-cell="{ row }"><RelativeTime :value="row.original.created_at" /></template>
        <template #actions-cell="{ row }">
          <div :class="styles.rowActions">
            <UTooltip text="编辑"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" square :aria-label="`编辑 ${row.original.name}`" @click.stop="goToEdit(row.original)" /></UTooltip>
            <UDropdownMenu :items="[[
              { label: '查看详情', icon: 'i-lucide-eye', onSelect: () => goToDetail(row.original) },
              { label: '复制', icon: 'i-lucide-copy', onSelect: () => goToDuplicate(row.original) },
              row.original.is_enabled ? { label: '停用', icon: 'i-lucide-power-off', onSelect: () => { void manager.toggleEnabled(row.original) } } : { label: '启用', icon: 'i-lucide-power', onSelect: () => { void manager.toggleEnabled(row.original) } },
              { label: '删除', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => manager.requestDelete(row.original) },
            ]]">
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

    <UModal :open="Boolean(manager.pendingDelete.value)" :title="deleteTitle" description="删除后该方案将从当前工作区移除，已绑定的会话需要重新选择编排。" @update:open="(open) => { if (!open) manager.cancelDelete() }">
      <template #body><p :class="styles.modalCopy">此操作会调用编排方案删除接口，无法在前端撤销。</p></template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.cancelDelete" />
        <UButton label="确认删除" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="manager.confirmDelete" />
      </template>
    </UModal>
  </main>
  <Transition name="pl-toast"><div v-if="manager.toast.value" :class="styles.toast" role="status"><UIcon name="i-lucide-circle-check-big" />{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
