<script setup lang="ts">
import { computed, ref, useCssModule } from 'vue'
import { useRouter } from 'vue-router'
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import { FilterPanel, ListCard, RelativeTime, ResourcePagination, ResourceTable } from '@/components'
import { useHighlightFromQuery } from '@/hooks/useSaveFeedback'
import { useMemoryListManager } from '@/hooks/useMemoryListManager'
import type { MemoryStatus, MemorySummary, MemoryType } from '@/interfaces/memory/model'
import { useMemoriesStore } from '@/stores/memories'

defineOptions({ name: 'MemoryListPanel' })

const styles = useCssModule()
const router = useRouter()
const toast = useToast()
const manager = useMemoryListManager()
const store = useMemoriesStore()
const highlight = useHighlightFromQuery()

const pendingDelete = ref<MemorySummary | null>(null)
const deleting = ref(false)
const deleteOpen = computed({
  get: () => pendingDelete.value !== null,
  set: (open: boolean) => { if (!open) pendingDelete.value = null },
})
const typeItems: Array<{ label: string; value: MemoryType | 'all' }> = [
  { label: '全部类型', value: 'all' },
  { label: '用户', value: 'user' },
  { label: '反馈', value: 'feedback' },
  { label: '项目', value: 'project' },
  { label: '参考', value: 'reference' },
]
const typeLabel: Record<MemoryType, string> = {
  user: '用户',
  feedback: '反馈',
  project: '项目',
  reference: '参考',
}
const statusLabel: Record<MemoryStatus, string> = {
  active: '生效中',
  superseded: '已替代',
  archived: '已归档',
}
const columns: TableColumn<MemorySummary>[] = [
  { accessorKey: 'name', header: 'Memory', meta: { class: { th: styles.nameColumn, td: styles.nameColumn } } },
  { accessorKey: 'memory_key', header: '稳定标识', meta: { class: { th: styles.keyColumn, td: styles.keyColumn } } },
  { accessorKey: 'memory_type', header: '类型', meta: { class: { th: styles.typeColumn, td: styles.typeColumn } } },
  { accessorKey: 'status', header: '状态', meta: { class: { th: styles.statusColumn, td: styles.statusColumn } } },
  { accessorKey: 'version', header: '版本', meta: { class: { th: styles.versionColumn, td: styles.versionColumn } } },
  { accessorKey: 'use_count', header: '使用次数', meta: { class: { th: styles.usageColumn, td: styles.usageColumn } } },
  { accessorKey: 'updated_at', header: '最近更新', meta: { class: { th: styles.updatedColumn, td: styles.updatedColumn } } },
  { id: 'actions', header: '', meta: { class: { th: styles.actionsColumn, td: styles.actionsColumn } } },
]

/** 空态分型：有筛选条件 →「筛选无结果」；否则 →「从未创建」。 */
const emptyMode = computed<'never' | 'filtered'>(() =>
  manager.hasActiveFilter.value ? 'filtered' : 'never',
)

/** 删除弹窗标题含记忆名（超过 30 字截断）。 */
const deleteTitle = computed(() => {
  const name = pendingDelete.value?.name ?? ''
  const truncated = name.length > 30 ? `${name.slice(0, 30)}…` : name
  return truncated ? `删除 Memory「${truncated}」？` : '删除 Memory？'
})

function goToDetail(id: number) {
  void router.push({ name: 'memory-detail', params: { id: String(id) } })
}

function goToEdit(id: number) {
  void router.push({ name: 'memory-edit', params: { id: String(id) } })
}

function goToCreate() {
  void router.push({ name: 'memory-create' })
}

function onApplyFilters() {
  void manager.load()
}

function onResetFilters() {
  manager.resetFilters()
  void manager.load()
}

function onPage(page: number) {
  manager.page.value = page
  void manager.load()
}

function onPageSize(size: number) {
  manager.pageSize.value = size
  void manager.load()
}

function onRetry() {
  void manager.load()
}

function statusColor(status: MemoryStatus): 'success' | 'warning' | 'neutral' {
  if (status === 'active') return 'success'
  if (status === 'superseded') return 'warning'
  return 'neutral'
}

function rowMenuItems(item: MemorySummary): DropdownMenuItem[][] {
  return [[
    { label: '查看详情', icon: 'i-lucide-panel-right-open', onSelect: () => { goToDetail(item.id) } },
    { label: '编辑', icon: 'i-lucide-pencil', onSelect: () => { goToEdit(item.id) } },
  ], [
    { label: '删除', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { pendingDelete.value = item } },
  ]]
}

/** ResourceTable 不透传 @keydown，在面板外层保留上/下/回车键盘导航。 */
function onKeydown(event: KeyboardEvent) {
  if (!manager.items.value.length) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const current = manager.items.value.findIndex((item) => item.id === manager.selectedId.value)
    const next = current < 0 ? (delta > 0 ? 0 : manager.items.value.length - 1) : current + delta
    const clamped = Math.max(0, Math.min(manager.items.value.length - 1, next))
    event.preventDefault()
    manager.selectedId.value = manager.items.value[clamped].id
    return
  }
  if (event.key === 'Enter' && manager.selectedId.value != null) {
    event.preventDefault()
    goToDetail(manager.selectedId.value)
  }
}

async function onDelete() {
  const item = pendingDelete.value
  if (!item || deleting.value) return
  deleting.value = true
  const message = await store.deleteMemory(item.id, item.version)
  deleting.value = false
  if (message) {
    manager.loadError.value = message
    return
  }
  pendingDelete.value = null
  toast.add({ title: `Memory「${item.name}」已删除`, color: 'success', icon: 'i-lucide-trash-2' })
  // 删除成功后若当前页已无数据：回退到上一页并重拉（store 的本地 page 也被 URL 覆盖）。
  // 此处以 URL 的 page 为准，避免与 state.page 双份递减造成错位。
  if (manager.items.value.length === 0 && manager.page.value > 1) {
    manager.page.value -= 1
    void manager.load()
  }
}
</script>

<template>
  <section :class="styles.panel" aria-label="Memory 列表" @keydown="onKeydown">
    <FilterPanel title="筛选条件" :collapsible="false" @search="onApplyFilters" @reset="onResetFilters">
      <template #default>
        <UInput :model-value="manager.search.value" :class="styles.search" icon="i-lucide-search" placeholder="搜索名称、标识或正文" aria-label="搜索 Memory" @update:model-value="(v: unknown) => { manager.search.value = String(v ?? '') }" @keydown.enter="onApplyFilters">
          <template v-if="manager.search.value" #trailing>
            <UButton color="neutral" variant="ghost" square size="xs" icon="i-lucide-x" aria-label="清空搜索" @click="manager.search.value = ''; onApplyFilters()" />
          </template>
        </UInput>
        <UFormField label="类型">
          <USelect :model-value="manager.memoryType.value" :class="styles.typeFilter" :items="typeItems" aria-label="Memory 类型" @update:model-value="(v: unknown) => { manager.memoryType.value = String(v ?? 'all') as MemoryType | 'all'; onApplyFilters() }" />
        </UFormField>
      </template>
      <template #actions>
        <UButton label="搜索" icon="i-lucide-search" color="primary" @click="onApplyFilters" />
        <UButton v-if="manager.hasActiveFilter.value" label="重置" icon="i-lucide-rotate-ccw" color="neutral" variant="outline" @click="onResetFilters" />
        <UTooltip text="刷新列表">
          <UButton color="neutral" variant="outline" square icon="i-lucide-refresh-cw" aria-label="刷新列表" :loading="manager.loading.value" @click="onRetry" />
        </UTooltip>
      </template>
    </FilterPanel>

    <ListCard title="Memory 列表" description="管理当前工作区中的长期记忆、修订历史与来源证据。" :total="manager.total.value">
      <UAlert v-if="manager.loadError.value" color="error" variant="subtle" icon="i-lucide-circle-alert" :class="styles.alert" role="alert" :title="manager.loadError.value" />

      <div :class="styles.tableWrap">
        <ResourceTable
          :columns="columns"
          :data="manager.items.value"
          :loading="manager.loading.value"
          :row-key="(item: MemorySummary) => String(item.id)"
          :active-id="manager.selectedId.value != null ? String(manager.selectedId.value) : null"
          :table-class="styles.table"
          :empty-mode="emptyMode"
          :resource-name="'Memory'"
          :highlight-id="highlight"
          @select="(item: MemorySummary) => goToDetail(item.id)"
          @clear-filters="onResetFilters"
        >
          <template #loading>
            <div :class="styles.skeletonRow">
              <template v-for="r in 5" :key="r">
                <USkeleton :class="styles.skeletonCell" />
              </template>
            </div>
          </template>
          <template #name-cell="{ row }">
            <UButton color="neutral" variant="ghost" :class="styles.memoryName" :aria-label="`查看 ${row.original.name} 详情`" @click.stop="goToDetail(row.original.id)">
              <span :class="styles.memoryIcon"><UIcon name="i-lucide-brain" /></span>
              <span :class="styles.memoryCopy">
                <strong>{{ row.original.name }}</strong>
                <small>
                  <UTooltip v-if="row.original.description" :text="row.original.description || '—'">
                    <span :class="styles.descriptionText">
                      <template v-if="row.original.description.length > 200">{{ row.original.description.slice(0, 200) }}…</template>
                      <template v-else>{{ row.original.description }}</template>
                    </span>
                  </UTooltip>
                  <UButton v-if="row.original.description.length > 200" color="neutral" variant="link" size="xs" class="mono" :class="styles.expandBtn" aria-label="展开描述" @click.stop="goToDetail(row.original.id)">展开</UButton>
                </small>
              </span>
            </UButton>
          </template>
          <template #memory_key-cell="{ row }">
            <UTooltip :text="row.original.memory_key">
              <span :class="[styles.key, 'mono']">{{ row.original.memory_key }}</span>
            </UTooltip>
          </template>
          <template #memory_type-cell="{ row }"><UBadge :label="typeLabel[row.original.memory_type]" color="neutral" variant="subtle" size="xs" /></template>
          <template #status-cell="{ row }"><UBadge :label="statusLabel[row.original.status]" :color="statusColor(row.original.status)" variant="subtle" size="xs" /></template>
          <template #version-cell="{ row }"><span class="mono">v{{ row.original.version }}</span></template>
          <template #use_count-cell="{ row }">{{ row.original.use_count }} 次</template>
          <template #updated_at-cell="{ row }"><RelativeTime :value="row.original.updated_at" /></template>
          <template #actions-cell="{ row }">
            <div :class="styles.rowActions">
              <div :class="styles.desktopActions">
                <UTooltip text="编辑"><UButton color="neutral" variant="ghost" square icon="i-lucide-pencil" :aria-label="`编辑 ${row.original.name}`" @click.stop="goToEdit(row.original.id)" /></UTooltip>
                <UTooltip text="删除"><UButton color="error" variant="ghost" square icon="i-lucide-trash-2" :aria-label="`删除 ${row.original.name}`" @click.stop="pendingDelete = row.original" /></UTooltip>
              </div>
              <UDropdownMenu :items="rowMenuItems(row.original)">
                <UButton :class="styles.mobileActions" color="neutral" variant="ghost" square icon="i-lucide-ellipsis" :aria-label="`${row.original.name} 更多操作`" @click.stop />
              </UDropdownMenu>
            </div>
          </template>
          <template #empty>
            <UEmpty variant="naked" :icon="emptyMode === 'filtered' ? 'i-lucide-search' : 'i-lucide-database'" :title="emptyMode === 'filtered' ? '没有匹配的结果' : '暂无 Memory'" :description="emptyMode === 'filtered' ? '调整关键词或筛选条件后再试。' : '创建 Memory 后会显示在这里。'">
              <template #actions>
                <UButton v-if="emptyMode === 'filtered'" icon="i-lucide-rotate-ccw" label="清除筛选" @click="onResetFilters" />
                <UButton v-else icon="i-lucide-plus" label="新建 Memory" @click="goToCreate" />
              </template>
            </UEmpty>
          </template>
        </ResourceTable>
      </div>

      <template #footer>
        <ResourcePagination :shown="manager.items.value.length" :total="manager.total.value" :page="manager.page.value" :items-per-page="manager.pageSize.value" @update:page="onPage" @update:items-per-page="onPageSize" />
      </template>
    </ListCard>

    <UModal :open="deleteOpen" class="mem-confirm-modal" :title="deleteTitle" description="此操作将软删除，仅移出当前活动目录，回滚后可恢复。" @update:open="(open) => { if (!open) pendingDelete = null }">
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="deleting" @click="pendingDelete = null" /><UButton label="确认删除" color="error" :loading="deleting" :disabled="deleting" @click="onDelete" /></template>
    </UModal>
  </section>
</template>

<style module src="./index.module.css"></style>
