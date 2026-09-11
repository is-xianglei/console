<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FilterPanel, ListCard, ResourcePagination, ResourceTable } from '@/components'
import { useAgentManager, type AgentEnabledFilter } from '@/hooks/useAgentManager'
import { useHighlightFromQuery } from '@/hooks/useSaveFeedback'
import type { AgentResponse } from '@/interfaces/agent/api'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'AgentResourceList' })

const styles = useCssModule()
const manager = useAgentManager()
const authStore = useAuthStore()
const router = useRouter()

const highlight = useHighlightFromQuery()

const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
] as { value: AgentEnabledFilter; label: string }[]

/** 模型筛选：后端不支持模型维度查询（prd「接口不支持留在前端」），前端收集唯一模型名做选项。 */
const modelOptions = computed<Array<{ value: string; label: string }>>(() => {
  const models = new Set(manager.agents.value.map((agent) => agent.model_name ?? '').filter(Boolean))
  return [{ value: 'all', label: '全部模型' }, ...[...models].sort().map((value) => ({ value, label: value }))]
})

/** 列宽由 table-baseline.module.css 的语义列类给出：同类列全站同宽。
 * 名称 / 时间 / 枚举 / 操作走 col-* 定宽，模型与能力绑定两列不设宽，自动占剩余。
 * 原先本页用 :nth-child 百分比定宽（7 档 4~25%），是另一套体系，已废弃。 */
const columns: TableColumn<AgentResponse>[] = [
  { id: 'name', header: '名称', meta: { class: { th: styles['col-name'], td: styles['col-name'] } } },
  { id: 'state', header: '状态', meta: { class: { th: styles['col-status'], td: styles['col-status'] } } },
  { id: 'model', header: '模型' },
  { id: 'capabilities', header: '能力绑定' },
  { id: 'createdAt', header: '创建时间', meta: { class: { th: styles['col-time'], td: styles['col-time'] } } },
  { id: 'actions', header: '操作', meta: { class: { th: styles['col-actions'], td: styles['col-actions'] } } },
]

const deleteTitle = computed(() => manager.pendingDelete.value ? `删除 ${manager.pendingDelete.value.name}？` : '删除 Agent？')

function agentCode(id: number) {
  return `AGT-${String(id).padStart(4, '0')}`
}

function capabilitySummary(agent: AgentResponse) {
  return `${agent.skill_ids?.length ?? 0} Skills · ${agent.tool_ids?.length ?? 0} Tools`
}

function goToCreate() {
  void router.push({ name: 'agent-create', params: { module: 'build', resource: 'agents' } })
}

function goToDetail(agent: AgentResponse) {
  void router.push({ name: 'agent-detail', params: { id: String(agent.id) } })
}

function goToEdit(agent: AgentResponse) {
  void router.push({ name: 'agent-edit', params: { id: String(agent.id) } })
}

function goToDuplicate(agent: AgentResponse) {
  void router.push({ name: 'agent-create', params: { module: 'build', resource: 'agents' }, query: { duplicate: String(agent.id) } })
}

async function onRefresh() {
  await manager.loadAll()
  if (!manager.loadingError.value) manager.showToast('Agents 与能力目录已刷新')
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
      <UFormField label="关键字"><UInput v-model="manager.state.keyword" icon="i-lucide-search" placeholder="搜索名称、ID、描述或模型" aria-label="搜索 Agent" @keydown.enter="onApplyFilters" /></UFormField>
      <UFormField label="启用状态"><USelect :model-value="manager.state.enabled" :items="enabledOptions" aria-label="启用状态筛选" @update:model-value="(value: unknown) => { manager.state.enabled = String(value ?? 'all') as AgentEnabledFilter }" /></UFormField>
      <UFormField label="模型"><USelect :model-value="manager.state.model" :items="modelOptions" aria-label="模型筛选" @update:model-value="(value: unknown) => { manager.state.model = String(value ?? 'all') }" /></UFormField>
      <UFormField label="创建时间">
        <div :class="styles.dateRange">
          <UInput :model-value="manager.state.dateRange[0]" type="date" aria-label="开始日期" @update:model-value="(value: unknown) => { manager.state.dateRange = [String(value ?? ''), manager.state.dateRange[1]] }" />
          <span>~</span>
          <UInput :model-value="manager.state.dateRange[1]" type="date" aria-label="结束日期" @update:model-value="(value: unknown) => { manager.state.dateRange = [manager.state.dateRange[0], String(value ?? '')] }" />
        </div>
      </UFormField>
    </FilterPanel>

    <ListCard title="Agents" :description="`管理当前工作区的系统提示词、模型与能力绑定；已启用 ${manager.stats.value.enabled}，未绑定能力 ${manager.stats.value.unbound}。`" :total="manager.total.value">
      <template #toolbar>
        <UButton label="新建 Agent" icon="i-lucide-plus" color="primary" @click="goToCreate" />
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
        :row-key="(agent: AgentResponse) => String(agent.id)"
        :table-class="styles.table"
        :selectable="true"
        :selected="manager.selectedIds.value"
        :pin-actions="true"
        :highlight-id="highlight"
        :empty-mode="manager.filteredAgents.value.length ? 'filtered' : 'never'"
        :resource-name="'Agent'"
        @update:selected="(ids: string[]) => { manager.selectedIds.value = ids }"
        @select="goToDetail"
        @clear-filters="onResetFilters"
      >
        <template #name-cell="{ row }">
          <div :class="styles['primary-cell']">
            <span :class="styles['entity-icon']"><UIcon name="i-lucide-bot" /></span>
            <span>
              <strong>{{ row.original.name }}</strong>
              <small class="mono">{{ agentCode(row.original.id) }}</small>
            </span>
          </div>
        </template>
        <template #state-cell="{ row }">
          <UBadge :color="row.original.is_enabled ? 'success' : 'neutral'" variant="subtle" size="xs" :class="styles.statusBadge">{{ row.original.is_enabled ? '已启用' : '已停用' }}</UBadge>
        </template>
        <template #model-cell="{ row }"><span :class="styles.modeText">{{ row.original.model_name || '平台默认模型' }}</span></template>
        <template #capabilities-cell="{ row }"><span :class="styles.memberText">{{ capabilitySummary(row.original) }}</span><small>服务端数字 ID 绑定</small></template>
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

    <UModal :open="Boolean(manager.pendingDelete.value)" :title="deleteTitle" description="删除后该 Agent 将从当前工作区移除，已有会话记录不会被改绑。" @update:open="(open) => { if (!open) manager.cancelDelete() }">
      <template #body><p :class="styles.modalCopy">此操作会调用 Agents 删除接口，无法在前端撤销。</p></template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.cancelDelete" />
        <UButton label="确认删除" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="manager.confirmDelete" />
      </template>
    </UModal>
  </main>
  <Transition name="ag-toast"><div v-if="manager.toast.value" :class="styles.toast" role="status"><UIcon name="i-lucide-circle-check-big" />{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
