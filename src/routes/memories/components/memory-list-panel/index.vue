<script setup lang="ts">
import { computed, onMounted, ref, useCssModule } from 'vue'
import { useRouter } from 'vue-router'
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import { ResourcePagination, ResourceTable } from '@/components'
import type { MemoryStatus, MemorySummary, MemoryType } from '@/interfaces/memory/model'
import { useMemoriesStore } from '@/stores/memories'

defineOptions({ name: 'MemoryListPanel' })

const styles = useCssModule()
const router = useRouter()
const toast = useToast()
const { state, loadMemories, loadMemoriesPage, deleteMemory } = useMemoriesStore()
const loadError = ref('')
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
const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

async function onLoad() {
  loadError.value = await loadMemories() ?? ''
}

onMounted(() => {
  void onLoad()
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
  if (!state.items.length) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const current = state.items.findIndex((item) => item.id === state.selectedId)
    const next = current < 0 ? (delta > 0 ? 0 : state.items.length - 1) : current + delta
    const clamped = Math.max(0, Math.min(state.items.length - 1, next))
    event.preventDefault()
    state.selectedId = state.items[clamped].id
    return
  }
  if (event.key === 'Enter' && state.selectedId != null) {
    event.preventDefault()
    goToDetail(state.selectedId)
  }
}

async function onDelete() {
  const item = pendingDelete.value
  if (!item || deleting.value) return
  deleting.value = true
  const message = await deleteMemory(item.id, item.version)
  deleting.value = false
  if (message) {
    loadError.value = message
    return
  }
  pendingDelete.value = null
  toast.add({ title: 'Memory 已删除', color: 'success', icon: 'i-lucide-trash-2' })
}
</script>

<template>
  <section :class="styles.panel" aria-label="Memory 列表" @keydown="onKeydown">
    <header :class="styles.toolbar">
      <UInput v-model="state.query" :class="styles.search" icon="i-lucide-search" placeholder="搜索名称、标识或正文" aria-label="搜索 Memory" @keydown.enter="onLoad">
        <template v-if="state.query" #trailing>
          <UButton color="neutral" variant="ghost" square size="xs" icon="i-lucide-x" aria-label="清空搜索" @click="state.query = ''; onLoad()" />
        </template>
      </UInput>
      <USelect v-model="state.memoryType" :class="styles.typeFilter" :items="typeItems" aria-label="Memory 类型" @update:model-value="onLoad" />
      <UTooltip text="刷新列表">
        <UButton :class="styles.refreshButton" color="neutral" variant="outline" square icon="i-lucide-refresh-cw" aria-label="刷新列表" :loading="state.loading" @click="onLoad" />
      </UTooltip>
    </header>

    <UAlert v-if="loadError" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="loadError" :class="styles.alert" role="alert" />

    <div :class="styles.tableWrap">
      <ResourceTable
        :columns="columns"
        :data="state.items"
        :loading="state.loading"
        :row-key="(item: MemorySummary) => String(item.id)"
        :active-id="state.selectedId != null ? String(state.selectedId) : null"
        :table-class="styles.table"
        @select="(item) => goToDetail(item.id)"
      >
        <template #name-cell="{ row }">
          <UButton color="neutral" variant="ghost" :class="styles.memoryName" :aria-label="`查看 ${row.original.name} 详情`" @click.stop="goToDetail(row.original.id)">
            <span :class="styles.memoryIcon"><UIcon name="i-lucide-brain" /></span>
            <span :class="styles.memoryCopy">
              <strong>{{ row.original.name }}</strong>
              <small>{{ row.original.description }}</small>
            </span>
          </UButton>
        </template>
        <template #memory_key-cell="{ row }"><span :class="[styles.key, 'mono']">{{ row.original.memory_key }}</span></template>
        <template #memory_type-cell="{ row }"><UBadge :label="typeLabel[row.original.memory_type]" color="neutral" variant="subtle" size="xs" /></template>
        <template #status-cell="{ row }"><UBadge :label="statusLabel[row.original.status]" :color="statusColor(row.original.status)" variant="subtle" size="xs" /></template>
        <template #version-cell="{ row }"><span class="mono">v{{ row.original.version }}</span></template>
        <template #use_count-cell="{ row }">{{ row.original.use_count }} 次</template>
        <template #updated_at-cell="{ row }"><span :class="styles.updated">{{ dateFormatter.format(new Date(row.original.updated_at)) }}</span></template>
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
          <UEmpty variant="naked" icon="i-lucide-database" title="暂无 Memory">
            <template #actions><UButton icon="i-lucide-plus" label="新建 Memory" @click="goToCreate" /></template>
          </UEmpty>
        </template>
      </ResourceTable>
    </div>

    <ResourcePagination :shown="state.items.length" :total="state.total" :page="state.page" :items-per-page="state.pageSize" :on-page="(p) => { state.page = p; void loadMemoriesPage(p) }" />

    <UModal :open="deleteOpen" class="mem-confirm-modal" title="删除 Memory？" description="此操作将软删除，仅移出当前活动目录，回滚后可恢复。" @update:open="(open) => { if (!open) pendingDelete = null }">
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="deleting" @click="pendingDelete = null" /><UButton label="确认删除" color="error" :loading="deleting" :disabled="deleting" @click="onDelete" /></template>
    </UModal>
  </section>
</template>

<style module src="./index.module.css"></style>
