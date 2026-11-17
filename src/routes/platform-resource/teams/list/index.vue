<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FilterPanel, ListCard, RelativeTime, ResourcePagination, ResourceTable } from '@/components'
import { useHighlightFromQuery } from '@/hooks/useSaveFeedback'
import { useTeamWriteAccess } from '@/hooks/useTeamEditor'
import { hasDeletedTeamAgent, useTeamActions, useTeamManager, type TeamEnabledFilter } from '@/hooks/useTeamManager'
import type { TeamDefinitionResponse } from '@/interfaces/team-definition/api'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'TeamResourceList' })

const styles = useCssModule()
const manager = useTeamManager()
const actions = useTeamActions()
const canManage = useTeamWriteAccess()
const authStore = useAuthStore()
const router = useRouter()
const highlight = useHighlightFromQuery()

const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
] as { value: TeamEnabledFilter; label: string }[]

const columns: TableColumn<TeamDefinitionResponse>[] = [
  { id: 'name', header: '名称', meta: { class: { th: styles['col-name'], td: styles['col-name'] } } },
  { id: 'state', header: '状态', meta: { class: { th: styles['col-status'], td: styles['col-status'] } } },
  { id: 'members', header: '成员' },
  { id: 'updatedAt', header: '更新时间', meta: { class: { th: styles['col-time'], td: styles['col-time'] } } },
  { id: 'actions', header: '操作', meta: { class: { th: styles['col-actions'], td: styles['col-actions'] } } },
]

const deleteTitle = computed(() => actions.pendingDelete.value ? `删除 ${actions.pendingDelete.value.name}？` : '删除 Team？')

/** 成员列副标题：前三个成员名。 */
function memberPreview(team: TeamDefinitionResponse) {
  const names = team.members.slice(0, 3).map((member) => member.name)
  return team.members.length > 3 ? `${names.join('、')} 等` : names.join('、')
}

function rowMenu(team: TeamDefinitionResponse) {
  const items: { label: string; icon: string; color?: 'error'; disabled?: boolean; onSelect: () => void }[] = [
    { label: '查看详情', icon: 'i-lucide-eye', onSelect: () => goToDetail(team) },
  ]
  if (canManage.value) {
    items.push(
      { label: '复制', icon: 'i-lucide-copy', onSelect: () => goToDuplicate(team) },
      team.is_enabled
        ? { label: '停用', icon: 'i-lucide-power-off', disabled: actions.isToggling(team.id), onSelect: () => { void actions.toggleEnabled(team, false) } }
        : { label: '启用', icon: 'i-lucide-power', disabled: actions.isToggling(team.id), onSelect: () => { void actions.toggleEnabled(team, true) } },
      { label: '删除', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => actions.requestDelete(team) },
    )
  }
  return [items]
}

function goToCreate() {
  void router.push({ name: 'team-create' })
}

function goToDetail(team: TeamDefinitionResponse) {
  void router.push({ name: 'team-detail', params: { id: String(team.id) } })
}

function goToEdit(team: TeamDefinitionResponse) {
  void router.push({ name: 'team-edit', params: { id: String(team.id) } })
}

function goToDuplicate(team: TeamDefinitionResponse) {
  void router.push({ name: 'team-create', query: { duplicate: String(team.id) } })
}

function onApplyFilters() {
  void manager.loadAll()
}

function onResetFilters() {
  manager.resetView()
  void manager.loadAll()
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
    <FilterPanel title="筛选条件" :collapsible="true" storage-key="teams" @search="onApplyFilters" @reset="onResetFilters">
      <UFormField label="关键字"><UInput v-model="manager.state.keyword" icon="i-lucide-search" placeholder="搜索名称、描述、成员或角色" aria-label="搜索 Team" /></UFormField>
      <UFormField label="启用状态"><USelect :model-value="manager.state.enabled" :items="enabledOptions" aria-label="启用状态筛选" @update:model-value="(value: unknown) => { manager.state.enabled = String(value ?? 'all') as TeamEnabledFilter }" /></UFormField>
    </FilterPanel>

    <ListCard title="Teams">
      <template #toolbar>
        <UButton v-if="canManage" label="新建 Team" icon="i-lucide-plus" color="primary" @click="goToCreate" />
        <UTooltip text="刷新"><UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" square aria-label="刷新 Teams" :loading="manager.loading.value" @click="manager.loadAll" /></UTooltip>
      </template>

      <UAlert v-if="manager.loadingError.value" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadingError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: manager.loadAll }]" />

      <ResourceTable
        :columns="columns"
        :data="manager.pagedItems.value"
        :loading="manager.loading.value"
        :row-key="(team: TeamDefinitionResponse) => String(team.id)"
        :table-class="styles.table"
        :pin-actions="true"
        :highlight-id="highlight"
        :empty-mode="manager.isDefault.value ? 'never' : 'filtered'"
        resource-name="Team"
        @select="goToDetail"
        @clear-filters="onResetFilters"
      >
        <template #name-cell="{ row }">
          <div :class="styles['primary-cell']">
            <span :class="styles['entity-icon']"><UIcon name="i-lucide-users-round" /></span>
            <span>
              <strong>{{ row.original.name }}</strong>
              <small v-if="row.original.description" :class="styles.primaryDesc">{{ row.original.description }}</small>
            </span>
          </div>
        </template>
        <template #state-cell="{ row }">
          <UBadge :color="row.original.is_enabled ? 'success' : 'neutral'" variant="subtle" size="xs" :class="styles.statusBadge">{{ row.original.is_enabled ? '已启用' : '已停用' }}</UBadge>
        </template>
        <template #members-cell="{ row }">
          <span :class="styles.memberText">{{ row.original.members.length }} 个成员</span>
          <small v-if="hasDeletedTeamAgent(row.original)" :class="styles.memberAlert"><UIcon name="i-lucide-triangle-alert" />Agent 已删除</small>
          <small v-else>{{ memberPreview(row.original) }}</small>
        </template>
        <template #updatedAt-cell="{ row }"><RelativeTime :value="row.original.updated_at" /></template>
        <template #actions-cell="{ row }">
          <div :class="styles.rowActions">
            <UTooltip v-if="canManage" text="编辑"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" square :aria-label="`编辑 ${row.original.name}`" @click.stop="goToEdit(row.original)" /></UTooltip>
            <UDropdownMenu :items="rowMenu(row.original)">
              <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="`${row.original.name} 更多操作`" @click.stop />
            </UDropdownMenu>
          </div>
        </template>
      </ResourceTable>

      <template #footer>
        <ResourcePagination
          :shown="manager.pagedItems.value.length"
          :total="manager.total.value"
          :page="manager.clampedPage.value"
          :items-per-page="manager.state.pageSize"
          @update:page="(page: number) => { manager.state.page = page }"
          @update:items-per-page="(size: number) => { manager.state.pageSize = size }"
        />
      </template>
    </ListCard>

    <UModal
      :open="actions.pendingDelete.value !== null"
      :title="deleteTitle"
      description="删除后无法恢复，已经用它建好的会话不受影响。"
      @update:open="(open: boolean) => { if (!open) actions.cancelDelete() }"
    >
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="actions.deleting.value" @click="actions.cancelDelete" />
        <UButton label="删除" color="error" :loading="actions.deleting.value" :disabled="actions.deleting.value" @click="actions.confirmDelete" />
      </template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
