<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FilterPanel, ListCard, ResourcePagination, ResourceTable } from '@/components'
import { WORKFLOW_MODE_LABEL, WORKFLOW_MODE_OPTIONS } from '@/constants/workflow'
import { useHighlightFromQuery } from '@/hooks/useSaveFeedback'
import { useWorkflowManager, type WorkflowEnabledFilter } from '@/hooks/useWorkflowManager'
import type { WorkflowResponse } from '@/interfaces/workflow/api'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'WorkflowResourceList' })

const styles = useCssModule()
const manager = useWorkflowManager()
const authStore = useAuthStore()
const router = useRouter()

const highlight = useHighlightFromQuery()

const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
] as { value: WorkflowEnabledFilter; label: string }[]

const modeOptions: Array<{ value: 'all' | WorkflowResponse['mode']; label: string }> = [
  { value: 'all', label: '全部模式' },
  ...WORKFLOW_MODE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
]

const columns: TableColumn<WorkflowResponse>[] = [
  { id: 'name', header: '名称' },
  { id: 'state', header: '状态' },
  { id: 'mode', header: '编排模式' },
  { id: 'members', header: '成员' },
  { id: 'createdAt', header: '创建时间' },
  { id: 'actions', header: '操作' },
]

const deleteTitle = computed(() => manager.pendingDelete.value ? `删除 ${manager.pendingDelete.value.name}？` : '删除 Workflow？')

function memberNames(workflow: WorkflowResponse) {
  return [...workflow.agents]
    .sort((left, right) => left.sort_order - right.sort_order || left.agent_id - right.agent_id)
    .map((member) => member.agent_name ?? '已删除的 Agent')
}

function goToCreate() {
  void router.push({ name: 'workflow-create', params: { module: 'build', resource: 'workflows' } })
}

function goToDetail(workflow: WorkflowResponse) {
  void router.push({ name: 'workflow-detail', params: { id: String(workflow.id) } })
}

function goToEdit(workflow: WorkflowResponse) {
  void router.push({ name: 'workflow-edit', params: { id: String(workflow.id) } })
}

function goToDuplicate(workflow: WorkflowResponse) {
  void router.push({ name: 'workflow-create', params: { module: 'build', resource: 'workflows' }, query: { duplicate: String(workflow.id) } })
}

async function onRefresh() {
  await manager.loadAll()
  if (!manager.loadingError.value) manager.showToast('Workflow 与 Agent 目录已刷新')
}

function onApplyFilters() {
  // 搜索/筛选：page 由 useListUrlState 复位，这里只负责刷新数据源。
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
      :columns="2"
      @search="onApplyFilters"
      @reset="onResetFilters"
    >
      <UFormField label="关键字"><UInput v-model="manager.state.keyword" icon="i-lucide-search" placeholder="搜索名称、ID、描述或成员" aria-label="搜索 Workflow" @keydown.enter="onApplyFilters" /></UFormField>
      <UFormField label="启用状态"><USelect :model-value="manager.state.enabled" :items="enabledOptions" aria-label="启用状态筛选" @update:model-value="(value: unknown) => { manager.state.enabled = String(value ?? 'all') as WorkflowEnabledFilter }" /></UFormField>
      <UFormField label="编排模式"><USelect :model-value="manager.state.mode" :items="modeOptions" aria-label="编排模式筛选" @update:model-value="(value: unknown) => { manager.state.mode = value as ('all' | WorkflowResponse['mode']) }" /></UFormField>
      <UFormField label="创建时间">
        <div :class="styles.dateRange">
          <UInput :model-value="manager.state.dateRange[0]" type="date" aria-label="开始日期" @update:model-value="(value: unknown) => { manager.state.dateRange = [String(value ?? ''), manager.state.dateRange[1]] }" />
          <span>~</span>
          <UInput :model-value="manager.state.dateRange[1]" type="date" aria-label="结束日期" @update:model-value="(value: unknown) => { manager.state.dateRange = [manager.state.dateRange[0], String(value ?? '')] }" />
        </div>
      </UFormField>
    </FilterPanel>

    <ListCard title="Workflows" :description="`把多个 Agent 组合成顺序、并行或智能路由的 Workflow；已启用 ${manager.stats.value.enabled}，含失效成员 ${manager.stats.value.broken}。`" :total="manager.total.value">
      <template #toolbar>
        <UButton label="新建 Workflow" icon="i-lucide-plus" color="primary" @click="goToCreate" />
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
        :row-key="(workflow: WorkflowResponse) => String(workflow.id)"
        :table-class="styles.table"
        :selectable="true"
        :selected="manager.selectedIds.value"
        :pin-actions="true"
        :highlight-id="highlight"
        :empty-mode="manager.filteredWorkflows.value.length ? 'filtered' : 'never'"
        :resource-name="'Workflow'"
        @update:selected="(ids: string[]) => { manager.selectedIds.value = ids }"
        @select="goToDetail"
        @clear-filters="onResetFilters"
      >
        <template #name-cell="{ row }">
          <div :class="styles.primaryCell">
            <span :class="styles.entityIcon"><UIcon name="i-lucide-workflow" /></span>
            <span>
              <strong>{{ row.original.name }}</strong>
              <small v-if="row.original.description" :class="styles.primaryDesc">{{ row.original.description }}</small>
              <small v-else class="mono">WF-{{ String(row.original.id).padStart(4, '0') }}</small>
            </span>
          </div>
        </template>
        <template #state-cell="{ row }">
          <UBadge :color="row.original.is_enabled ? 'success' : 'neutral'" variant="subtle" size="xs" :class="styles.statusBadge">{{ row.original.is_enabled ? '已启用' : '已停用' }}</UBadge>
        </template>
        <template #mode-cell="{ row }"><span :class="styles.modeText">{{ WORKFLOW_MODE_LABEL[row.original.mode] }}</span></template>
        <template #members-cell="{ row }">
          <span :class="styles.memberText">{{ row.original.agents.length }} 个成员</span>
          <small v-if="manager.hasBrokenMember(row.original)" :class="styles.memberAlert"><UIcon name="i-lucide-triangle-alert" />成员失效</small>
          <small v-else>{{ memberNames(row.original).slice(0, 3).join(' → ') }}</small>
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

    <UModal :open="Boolean(manager.pendingDelete.value)" :title="deleteTitle" description="删除后不可恢复，请确认是否继续。" @update:open="(open) => { if (!open) manager.cancelDelete() }">
      <template #body><p :class="styles.modalCopy">此操作会调用 Workflow 删除接口，删除后该 Workflow 将从当前工作区移除，无法在前端撤销。</p></template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.cancelDelete" />
        <UButton label="确认删除" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="manager.confirmDelete" />
      </template>
    </UModal>
  </main>
  <Transition name="wf-toast"><div v-if="manager.toast.value" :class="styles.toast" role="status"><UIcon name="i-lucide-circle-check-big" />{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
