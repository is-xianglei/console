<script setup lang="ts">
import { computed, onMounted, ref, useCssModule } from 'vue'
import type { DropdownMenuItem, TableColumn, TableRow } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import type { MemoryStatus, MemorySummary, MemoryType } from '@/interfaces/memory/model'
import { useMemoriesStore } from '@/stores/memories'

defineOptions({ name: 'MemoryListPanel' })

const emit = defineEmits<{
  create: []
  selected: [id: number]
  edit: [id: number]
}>()
const styles = useCssModule()
const toast = useToast()
const { state, loadMemories, selectMemory, deleteMemory } = useMemoriesStore()
const error = ref('')
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
const filteredCount = computed(() => state.items.length)
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
const tableMeta = computed(() => ({
  class: {
    tr: (row: TableRow<MemorySummary>) => (
      row.original.id === state.selectedId ? styles.active : ''
    ),
  },
}))
const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

async function onLoad() {
  error.value = await loadMemories() ?? ''
}

onMounted(() => {
  void onLoad()
})

async function onSelect(id: number) {
  error.value = await selectMemory(id) ?? ''
  if (!error.value) emit('selected', id)
}

async function onEdit(id: number) {
  error.value = await selectMemory(id) ?? ''
  if (!error.value) emit('edit', id)
}

function onTableSelect(_event: Event, row: TableRow<MemorySummary>) {
  void onSelect(row.original.id)
}

function onTableKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const row = event.target
  if (!(row instanceof HTMLTableRowElement)) return
  const body = row.parentElement
  if (!(body instanceof HTMLTableSectionElement)) return
  const index = Array.from(body.rows).indexOf(row)
  const item = state.items[index]
  if (!item) return
  event.preventDefault()
  void onSelect(item.id)
}

function statusColor(status: MemoryStatus): 'success' | 'warning' | 'neutral' {
  if (status === 'active') return 'success'
  if (status === 'superseded') return 'warning'
  return 'neutral'
}

function rowMenuItems(item: MemorySummary): DropdownMenuItem[][] {
  return [[
    { label: '查看详情', icon: 'i-lucide-panel-right-open', onSelect: () => { void onSelect(item.id) } },
    { label: '编辑', icon: 'i-lucide-pencil', onSelect: () => { void onEdit(item.id) } },
  ], [
    { label: '删除', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { pendingDelete.value = item } },
  ]]
}

async function onDelete() {
  const item = pendingDelete.value
  if (!item || deleting.value) return
  deleting.value = true
  const message = await deleteMemory(item.id, item.version)
  deleting.value = false
  if (message) {
    error.value = message
    return
  }
  pendingDelete.value = null
  toast.add({ title: 'Memory 已删除', color: 'success', icon: 'i-lucide-trash-2' })
}
</script>

<template>
  <section :class="$style.panel" aria-label="Memory 列表">
    <header :class="$style.toolbar">
      <UInput v-model="state.query" :class="$style.search" icon="i-lucide-search" placeholder="搜索名称、标识或正文" aria-label="搜索 Memory" @keydown.enter="onLoad">
        <template v-if="state.query" #trailing>
          <UButton color="neutral" variant="ghost" square size="xs" icon="i-lucide-x" aria-label="清空搜索" @click="state.query = ''; onLoad()" />
        </template>
      </UInput>
      <USelect v-model="state.memoryType" :class="$style.typeFilter" :items="typeItems" aria-label="Memory 类型" @update:model-value="onLoad" />
      <UTooltip text="刷新列表">
        <UButton :class="$style.refreshButton" color="neutral" variant="outline" square icon="i-lucide-refresh-cw" aria-label="刷新列表" :loading="state.loading" @click="onLoad" />
      </UTooltip>
    </header>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" :class="$style.alert" role="alert" />

    <div :class="$style.tableWrap">
      <UTable
        :class="$style.table"
        :data="state.items"
        :columns="columns"
        :loading="state.loading"
        :meta="tableMeta"
        sticky="header"
        :ui="{ empty: 'p-0' }"
        @select="onTableSelect"
        @keydown="onTableKeydown"
      >
        <template #name-cell="{ row }">
          <UButton color="neutral" variant="ghost" :class="$style.memoryName" @click.stop="onSelect(row.original.id)">
            <span :class="$style.memoryIcon"><UIcon name="i-lucide-brain" /></span>
            <span :class="$style.memoryCopy">
              <strong>{{ row.original.name }}</strong>
              <small>{{ row.original.description }}</small>
            </span>
          </UButton>
        </template>
        <template #memory_key-cell="{ row }"><span :class="[$style.key, 'mono']">{{ row.original.memory_key }}</span></template>
        <template #memory_type-cell="{ row }"><UBadge :label="typeLabel[row.original.memory_type]" color="neutral" variant="subtle" size="xs" /></template>
        <template #status-cell="{ row }"><UBadge :label="statusLabel[row.original.status]" :color="statusColor(row.original.status)" variant="subtle" size="xs" /></template>
        <template #version-cell="{ row }"><span class="mono">v{{ row.original.version }}</span></template>
        <template #use_count-cell="{ row }">{{ row.original.use_count }} 次</template>
        <template #updated_at-cell="{ row }"><span :class="$style.updated">{{ dateFormatter.format(new Date(row.original.updated_at)) }}</span></template>
        <template #actions-cell="{ row }">
          <div :class="$style.rowActions">
            <div :class="$style.desktopActions">
              <UTooltip text="编辑"><UButton color="neutral" variant="ghost" square icon="i-lucide-pencil" :aria-label="`编辑 ${row.original.name}`" @click.stop="onEdit(row.original.id)" /></UTooltip>
              <UTooltip text="删除"><UButton color="error" variant="ghost" square icon="i-lucide-trash-2" :aria-label="`删除 ${row.original.name}`" @click.stop="pendingDelete = row.original" /></UTooltip>
            </div>
            <UDropdownMenu :items="rowMenuItems(row.original)">
              <UButton :class="$style.mobileActions" color="neutral" variant="ghost" square icon="i-lucide-ellipsis" :aria-label="`${row.original.name} 更多操作`" @click.stop />
            </UDropdownMenu>
          </div>
        </template>
        <template #empty>
          <UEmpty variant="naked" icon="i-lucide-database" title="暂无 Memory">
            <template #actions><UButton icon="i-lucide-plus" label="新建 Memory" @click="emit('create')" /></template>
          </UEmpty>
        </template>
      </UTable>
    </div>

    <footer :class="$style.footer">
      <span>显示 <strong>{{ filteredCount }}</strong> 条记录</span>
      <span v-if="state.total !== filteredCount" class="mono">总计 {{ state.total }}</span>
    </footer>

    <UModal v-model:open="deleteOpen" title="删除 Memory" description="该记录会从活动目录中移除，历史修订仍保留用于审计。">
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" @click="pendingDelete = null" />
        <UButton color="error" label="确认删除" :loading="deleting" @click="onDelete" />
      </template>
    </UModal>
  </section>
</template>

<style module src="./index.module.css"></style>
