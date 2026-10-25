<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, useCssModule } from 'vue'
import { useRouter } from 'vue-router'
import { FilterPanel, ListCard, ResourcePagination, ResourceTable, RelativeTime } from '@/components'
import { useTeamList } from '@/hooks/useTeamEditor'
import { useHighlightFromQuery } from '@/hooks/useSaveFeedback'
import type { ResourceStatus } from '@/interfaces/platform/model'
import {
  MIN_TEAM_MEMBERS,
  TEAM_MODE_LABEL,
  type TeamFormModel,
} from '@/interfaces/platform-team/model'

defineOptions({ name: 'TeamResourceList' })

const styles = useCssModule()
const manager = useTeamList()
const router = useRouter()
const highlight = useHighlightFromQuery()

/** 列表页只读展示：成员数、入口 Agent 都从结构化成员推导，不再依赖目录里的展示串。
 *
 * 列宽由 table-baseline.module.css 的语义列类给出（col-name / col-time / col-status /
 * col-actions），同类列全站同宽；页面不再自己写 px，也就不再有 220/230/260/290 的分叉。 */
const columns: TableColumn<TeamFormModel>[] = [
  { id: 'name', header: '名称', meta: { class: { th: styles['col-name'], td: styles['col-name'] } } },
  { id: 'status', header: '状态', meta: { class: { th: styles['col-status'], td: styles['col-status'] } } },
  { id: 'mode', header: '编排模式', meta: { class: { th: styles['col-status'], td: styles['col-status'] } } },
  { id: 'entry', header: '入口 Agent' },
  { id: 'members', header: '成员数' },
  { id: 'owner', header: '负责人' },
  { id: 'updatedAt', header: '最近变更', meta: { class: { th: styles['col-time'], td: styles['col-time'] } } },
  { id: 'actions', header: '操作', meta: { class: { th: styles['col-actions'], td: styles['col-actions'] } } },
]

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'nominal', label: '正常' },
  { value: 'warning', label: '需关注' },
  { value: 'idle', label: '未启用' },
  { value: 'error', label: '异常' },
] as { value: ResourceStatus | 'all'; label: string }[]

const sortOptions = [
  { value: 'name', label: '按名称' },
  { value: 'status', label: '按状态' },
  { value: 'owner', label: '按负责人' },
] as { value: 'name' | 'status' | 'owner'; label: string }[]

const ownerOptions = computed(() => [
  { value: 'all', label: '全部负责人' },
  ...manager.owners.value.map((owner) => ({ value: owner, label: owner })),
])

/** ResourceTable 的选中列要数组形态，manager 内部用 Set 去重。 */
const selectedTeamIds = computed({
  get: () => [...manager.selectedIds.value],
  set: (ids: string[]) => { manager.selectedIds.value = new Set(ids) },
})

/** 四种运行状态各自映射到徽章颜色与中文标签（旧实现把 error 误归为 neutral，这里修正）。 */
const STATUS_BADGE: Record<ResourceStatus, { color: 'success' | 'warning' | 'neutral' | 'error'; label: string }> = {
  nominal: { color: 'success', label: '正常' },
  warning: { color: 'warning', label: '需关注' },
  idle: { color: 'neutral', label: '未启用' },
  error: { color: 'error', label: '异常' },
}

function entryName(team: TeamFormModel) {
  return team.members[team.entryIndex]?.agentName ?? team.members[0]?.agentName ?? '未指定'
}

function goToCreate() {
  void router.push({ name: 'team-create', params: { module: 'build', resource: 'teams' } })
}

function goToDetail(team: TeamFormModel) {
  void router.push({ name: 'team-detail', params: { id: team.id } })
}

function goToEdit(team: TeamFormModel) {
  void router.push({ name: 'team-edit', params: { id: team.id } })
}

function goToDuplicate(team: TeamFormModel) {
  void router.push({ name: 'team-create', params: { module: 'build', resource: 'teams' }, query: { duplicate: team.id } })
}

function onSearch() {
  manager.pageNumber.value = 1
}

function onPage(number: number) {
  manager.pageNumber.value = number
}

function onPageSize(size: number) {
  manager.pageSize.value = size
  manager.pageNumber.value = 1
}
</script>

<template>
  <main :class="styles.page">
    <FilterPanel title="筛选条件" :collapsible="true" storage-key="teams" @search="onSearch" @reset="manager.resetView">
      <UFormField label="关键字"><UInput v-model="manager.search.value" icon="i-lucide-search" placeholder="搜索名称、ID、负责人或标签" aria-label="搜索 Team" /></UFormField>
      <UFormField label="状态"><USelect v-model="manager.statusFilter.value" :items="statusOptions" aria-label="Team 状态筛选" /></UFormField>
      <UFormField label="负责人"><USelect v-model="manager.ownerFilter.value" :items="ownerOptions" aria-label="Team 负责人筛选" /></UFormField>
      <UFormField label="排序"><USelect v-model="manager.sortBy.value" :items="sortOptions" aria-label="Team 排序方式" /></UFormField>
    </FilterPanel>

    <ListCard title="Teams" description="编排多个 Agent 的职责、交接关系、共享上下文与审批节点。">
      <template #toolbar>
        <UButton label="创建 Team" icon="i-lucide-plus" color="primary" @click="goToCreate" />
        <UTooltip text="刷新"><UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" square aria-label="刷新 Teams" @click="manager.resetView" /></UTooltip>
        <UTooltip text="导出 CSV"><UButton icon="i-lucide-download" color="neutral" variant="outline" square aria-label="导出 Teams" @click="manager.exportCsv" /></UTooltip>
        <UDropdownMenu :items="[[
          { label: '批量删除', icon: 'i-lucide-trash-2', color: 'error' as const, disabled: !manager.selectedCount.value, onSelect: () => manager.requestDelete([...manager.selectedIds.value]) },
        ]]">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" square aria-label="更多操作" />
        </UDropdownMenu>
      </template>

      <ResourceTable
        :columns="columns"
        :data="manager.visibleRows.value"
        :loading="false"
        :row-key="(team: TeamFormModel) => team.id"
        :table-class="styles.table"
        :selectable="true"
        :selected="selectedTeamIds"
        :pin-actions="true"
        :highlight-id="highlight"
        :empty-mode="manager.hasFilters.value ? 'filtered' : 'never'"
        :resource-name="'Team'"
        @update:selected="(ids: string[]) => { manager.selectedIds.value = new Set(ids) }"
        @select="goToDetail"
        @clear-filters="manager.resetView"
      >
        <template #name-cell="{ row }">
          <div :class="styles['primary-cell']">
            <span :class="styles['entity-icon']"><UIcon name="i-lucide-network" /></span>
            <span>
              <strong>{{ row.original.name }}</strong>
              <small class="mono">{{ row.original.id }}</small>
            </span>
          </div>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="STATUS_BADGE[row.original.status].color" variant="subtle" size="xs" :class="styles.statusBadge">{{ STATUS_BADGE[row.original.status].label }}</UBadge>
        </template>
        <template #mode-cell="{ row }"><span :class="styles.cellText">{{ TEAM_MODE_LABEL[row.original.mode] }}</span></template>
        <template #entry-cell="{ row }"><span :class="styles.cellText">{{ entryName(row.original) }}</span></template>
        <template #members-cell="{ row }">
          <span :class="styles.cellText">{{ row.original.members.length }} Agents</span>
          <small v-if="row.original.members.length < MIN_TEAM_MEMBERS" :class="styles.memberAlert"><UIcon name="i-lucide-triangle-alert" />成员不足</small>
        </template>
        <template #owner-cell="{ row }"><span :class="styles.cellText">{{ row.original.owner }}</span></template>
        <template #updatedAt-cell="{ row }"><RelativeTime :value="row.original.updatedAt || row.original.createdAt" /></template>
        <template #actions-cell="{ row }">
          <div :class="styles.rowActions">
            <UTooltip text="编辑"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" square :aria-label="`编辑 ${row.original.name}`" @click.stop="goToEdit(row.original)" /></UTooltip>
            <UDropdownMenu :items="[[
              { label: '查看详情', icon: 'i-lucide-eye', onSelect: () => goToDetail(row.original) },
              { label: '复制', icon: 'i-lucide-copy', onSelect: () => goToDuplicate(row.original) },
              row.original.status === 'idle'
                ? { label: '启用', icon: 'i-lucide-power', onSelect: () => manager.updateStatus([row.original.id], 'nominal') }
                : { label: '停用', icon: 'i-lucide-power-off', onSelect: () => manager.updateStatus([row.original.id], 'idle') },
              { label: '删除', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => manager.requestDelete([row.original.id]) },
            ]]">
              <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="`${row.original.name} 更多操作`" />
            </UDropdownMenu>
          </div>
        </template>
      </ResourceTable>

      <template #footer>
        <ResourcePagination
          :shown="manager.visibleRows.value.length"
          :total="manager.filteredRows.value.length"
          :page="manager.pageNumber.value"
          :items-per-page="manager.pageSize.value"
          @update:page="onPage"
          @update:items-per-page="onPageSize"
        />
      </template>
    </ListCard>

    <UModal
      :open="manager.pendingDeleteIds.value.length > 0"
      :title="manager.deleteTitle.value"
      description="删除后该 Team 将从当前工作区移除，已绑定的会话需要重新选择编排。"
      @update:open="(open: boolean) => { if (!open) manager.cancelDelete() }"
    >
      <template #body><p :class="styles.modalCopy">此操作会移除所选 Team，无法在前端撤销。</p></template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" @click="manager.cancelDelete" />
        <UButton label="确认删除" color="error" @click="manager.confirmDelete" />
      </template>
    </UModal>
  </main>
  <Transition name="tm-toast"><div v-if="manager.toast.value" :class="styles.toast" role="status"><UIcon name="i-lucide-circle-check-big" />{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
