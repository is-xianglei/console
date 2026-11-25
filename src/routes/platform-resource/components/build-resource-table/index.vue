<script setup lang="ts">
import { computed, h, resolveComponent, useCssModule } from 'vue'
import type { TableColumn, TableRow } from '@nuxt/ui'
import type { ResourcePage, ResourceRow } from '@/interfaces/platform/model'

defineOptions({ name: 'BuildResourceTable' })

const styles = useCssModule()
const props = defineProps<{
  page: ResourcePage
  rows: ResourceRow[]
  selectedId: string
  selectedIds: Set<string>
}>()

const emit = defineEmits<{
  select: [id: string]
  toggle: [id: string]
  edit: [row: ResourceRow]
  duplicate: [row: ResourceRow]
  delete: [row: ResourceRow]
  reset: []
}>()

const UCheckbox = resolveComponent('UCheckbox')

const columns = computed<TableColumn<ResourceRow>[]>(() => [
  {
    id: 'select',
    header: ({ table }) => h(UCheckbox, {
      modelValue: table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected(),
      'onUpdate:modelValue': (value: boolean | 'indeterminate') => table.toggleAllPageRowsSelected(Boolean(value)),
      'aria-label': '选择本页资源',
      onClick: (event: MouseEvent) => event.stopPropagation(),
    }),
    cell: ({ row }) => h(UCheckbox, {
      modelValue: row.getIsSelected(),
      'onUpdate:modelValue': (value: boolean | 'indeterminate') => row.toggleSelected(Boolean(value)),
      'aria-label': `选择 ${row.original.name}`,
      onClick: (event: MouseEvent) => event.stopPropagation(),
    }),
    enableSorting: false,
    enableHiding: false,
    meta: { class: { th: styles['br-select-cell'], td: styles['br-select-cell'] } },
  },
  { accessorKey: 'name', header: '名称', meta: { class: { th: styles['br-name-col'], td: styles['br-name-col'] } } },
  { accessorKey: 'status', header: '状态', meta: { class: { th: styles['br-status-col'], td: styles['br-status-col'] } } },
  ...props.page.columns.map((header, index) => ({
    id: `value-${index}`,
    accessorFn: (row: ResourceRow) => row.values[index],
    header,
    meta: { class: { td: styles['br-value-cell'] } },
  })),
  { accessorKey: 'owner', header: '负责人', meta: { class: { th: styles['br-owner-col'], td: styles['br-owner-col'] } } },
  { id: 'actions', header: '', meta: { class: { th: styles['br-actions-col'], td: styles['br-actions-col'] } } },
])

const rowSelection = computed({
  get: () => Object.fromEntries([...props.selectedIds].map((id) => [id, true])),
  set: (selection: Record<string, boolean>) => {
    props.rows.forEach((row) => {
      if (Boolean(selection[row.id]) !== props.selectedIds.has(row.id)) emit('toggle', row.id)
    })
  },
})

const tableMeta = computed(() => ({
  class: { tr: (row: TableRow<ResourceRow>) => row.original.id === props.selectedId ? styles.active : '' },
}))

function onSelect(_event: Event, row: TableRow<ResourceRow>) {
  emit('select', row.original.id)
}

function statusLabel(status: ResourceRow['status']) {
  return { nominal: '正常', warning: '需关注', error: '异常', idle: '未启用' }[status]
}

function statusColor(status: ResourceRow['status']) {
  return { nominal: 'success', warning: 'warning', error: 'error', idle: 'neutral' }[status] as 'success' | 'warning' | 'error' | 'neutral'
}

function resourceMenuItems(row: ResourceRow) {
  return [[
    { label: '编辑', icon: 'i-lucide-pencil', onSelect: () => emit('edit', row) },
    { label: '复制', icon: 'i-lucide-copy', onSelect: () => emit('duplicate', row) },
    { label: '删除', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete', row) },
  ]]
}
</script>

<template>
  <UTable
    v-model:row-selection="rowSelection"
    :class="$style['br-table']"
    :data="rows"
    :columns="columns"
    :meta="tableMeta"
    :get-row-id="(row: ResourceRow) => row.id"
    :ui="{ empty: 'p-0' }"
    sticky="header"
    @select="onSelect"
  >
    <template #name-cell="{ row }">
      <UButton color="neutral" variant="ghost" :class="$style['br-resource-name']" @click.stop="emit('select', row.original.id)">
        <span :class="$style['br-resource-icon']"><UIcon :name="`i-lucide-${page.icon}`" /></span>
        <span><strong>{{ row.original.name }}</strong><small class="mono">{{ row.original.id }}</small></span>
      </UButton>
    </template>

    <template #status-cell="{ row }">
      <UBadge :color="statusColor(row.original.status)" variant="subtle" size="xs" :class="$style['br-status']">
        <UChip as="span" standalone size="xs" :ui="{ base: `dot ${row.original.status}` }" />{{ statusLabel(row.original.status) }}
      </UBadge>
    </template>

    <template #owner-cell="{ row }"><span :class="$style['br-owner']">{{ row.original.owner }}</span></template>

    <template #actions-cell="{ row }">
      <div :class="$style['br-row-actions']">
        <div :class="$style['br-desktop-actions']">
          <UTooltip text="编辑"><UButton :class="$style['br-icon-button']" icon="i-lucide-pencil" color="neutral" variant="ghost" square :aria-label="`编辑 ${row.original.name}`" @click.stop="emit('edit', row.original)" /></UTooltip>
          <UTooltip text="复制"><UButton :class="$style['br-icon-button']" icon="i-lucide-copy" color="neutral" variant="ghost" square :aria-label="`复制 ${row.original.name}`" @click.stop="emit('duplicate', row.original)" /></UTooltip>
          <UTooltip text="删除"><UButton :class="$style['br-icon-button']" icon="i-lucide-trash-2" color="error" variant="ghost" square :aria-label="`删除 ${row.original.name}`" @click.stop="emit('delete', row.original)" /></UTooltip>
        </div>
        <UDropdownMenu :items="resourceMenuItems(row.original)">
          <UButton :class="[$style['br-icon-button'], $style['br-mobile-actions']]" icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="`${row.original.name} 更多操作`" @click.stop />
        </UDropdownMenu>
      </div>
    </template>

    <template #empty>
      <UEmpty icon="i-lucide-search-x" title="没有符合条件的资源" description="调整关键词或筛选条件后再试。" variant="naked" :class="$style['br-empty']">
        <template #actions><UButton label="清除全部筛选" color="primary" variant="link" @click="emit('reset')" /></template>
      </UEmpty>
    </template>
  </UTable>
</template>

<style module src="./index.module.css"></style>
