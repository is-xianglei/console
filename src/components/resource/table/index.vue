<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, nextTick, onBeforeUnmount, ref, useCssModule, watch } from 'vue'
import type { TableColumn, TableRow } from '@nuxt/ui'

defineOptions({ name: 'ResourceTable' })

const styles = useCssModule()

const props = withDefaults(
  defineProps<{
    columns: TableColumn<T>[]
    data: T[]
    loading?: boolean
    /** 行唯一键，供 get-row-id 与选中态使用。 */
    rowKey: (row: T) => string
    /** 当前选中行 id，用于高亮；传 null 表示不启用高亮。 */
    activeId?: string | null
    /** 透传给底层 UTable 的类名（如列表页的表格自身样式）。 */
    tableClass?: string | string[]

    // ===== p0 新增能力（全部可选，缺省行为与现状一致）=====

    /** 是否渲染勾选列（前置 UCheckbox 列）。默认关闭。 */
    selectable?: boolean
    /** 选中行 id 列表（v-model:selected）。仅 selectable 时生效。 */
    selected?: string[]
    /** 是否把 id==='actions' 的操作列固定到右侧。默认开启。 */
    pinActions?: boolean
    /** 加载骨架行数（columns.length × 该值）。 */
    skeletonRows?: number
    /** 空态分型：'never' 渲染「还没有 X」；'filtered' 渲染「没有匹配的结果」+ 清除筛选按钮。 */
    emptyMode?: 'never' | 'filtered'
    /** 空态文案里的资源名（如「群组」）。 */
    resourceName?: string
    /** 透传 UTable 的 getSubRows，启用树形展开；同时给首列缩进与展开箭头。 */
    treeChildrenKey?: (row: T) => T[] | undefined
    /** 来自 route.query.highlight 的行 id：命中行高亮后淡出。 */
    highlightId?: string | null
  }>(),
  {
    loading: false,
    activeId: null,
    tableClass: undefined,
    selectable: false,
    selected: () => [],
    pinActions: true,
    skeletonRows: 5,
    emptyMode: 'never',
    resourceName: '数据',
    treeChildrenKey: undefined,
    highlightId: null,
  },
)

const emit = defineEmits<{
  select: [row: T]
  'update:selected': [ids: string[]]
  'clear-filters': []
}>()

// 仅暴露我们需要的树形 API；不强依赖 UTable 的具体实例类型。
const tableRef = ref<{ tableApi: { expandAll: () => void; collapseAll: () => void } } | null>(null)

// ===== highlightId：命中行高亮（CSS 负责淡出）+ 滚动到该行（E-3），定时器卸载清理 =====
let highlightTimer: ReturnType<typeof setTimeout> | undefined

function scrollToHighlight(id: string) {
  // 行可能不在当前页，先用类名定位 DOM 行并滚入视口。
  const escaped = String(id).replace(/[^a-zA-Z0-9_-]/g, '\\$&')
  const row = typeof document !== 'undefined'
    ? document.querySelector<HTMLElement>(`.highlight-row-${escaped}`)
    : null
  row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

watch(
  () => props.highlightId,
  (id) => {
    if (highlightTimer) clearTimeout(highlightTimer)
    if (!id) return
    highlightTimer = setTimeout(() => {
      highlightTimer = undefined
    }, 2000)
    // 数据就绪后再定位：等行渲染出来后滚动，避免 highlightId 先于 data 到达。
    void nextTick(() => scrollToHighlight(id))
  },
  { immediate: true },
)

watch(
  () => props.data,
  () => {
    if (props.highlightId) void nextTick(() => scrollToHighlight(props.highlightId!))
  },
)

onBeforeUnmount(() => {
  if (highlightTimer) clearTimeout(highlightTimer)
})

// ===== 选择状态 =====
const selectedSet = computed(() => new Set(props.selected ?? []))

function toggleRow(id: string, checked: boolean) {
  const next = new Set(selectedSet.value)
  if (checked) next.add(id)
  else next.delete(id)
  emit('update:selected', [...next])
}

function onRowCheckbox(id: string, value: boolean | 'indeterminate') {
  toggleRow(id, value === true)
}

function toggleAll(checked: boolean) {
  const ids = props.data.map((row) => props.rowKey(row))
  emit('update:selected', checked ? ids : [])
}

const allSelected = computed(() => {
  const ids = props.data.map((row) => props.rowKey(row))
  return ids.length > 0 && ids.every((id) => selectedSet.value.has(id))
})
const someSelected = computed(() => {
  const ids = props.data.map((row) => props.rowKey(row))
  return ids.some((id) => selectedSet.value.has(id)) && !allSelected.value
})

// ===== 勾选列 & 操作列固定 =====
const displayColumns = computed(() => {
  if (!props.selectable) return props.columns
  const selectColumn: TableColumn<T> = {
    id: 'select',
    header: '',
    size: 44,
    meta: { class: { th: styles.selectCell, td: styles.selectCell } },
  } as TableColumn<T>
  return [selectColumn, ...props.columns]
})

const columnPinning = computed(() => (
  props.pinActions && props.columns.some((col) => col.id === 'actions') ? { right: ['actions'] } : undefined
))

// ===== 树形：首列缩进 & 展开箭头 =====
const treeColumnId = computed(() => (props.treeChildrenKey ? props.columns[0]?.id : undefined))

const tableMeta = computed(() => ({
  class: {
    tr: (row: TableRow<T>) => [
      props.activeId != null && props.rowKey(row.original) === props.activeId ? styles.active : '',
      props.highlightId != null && props.rowKey(row.original) === props.highlightId ? styles.highlighted : '',
      `highlight-row-${props.rowKey(row.original)}`,
    ].filter(Boolean).join(' '),
    td: (cell: { column: { id: string }; row: { depth: number } }) => (
      treeColumnId.value && cell.column.id === treeColumnId.value && cell.row.depth > 0 ? styles.treeCell : null
    ),
    style: {
      td: (cell: { column: { id: string }; row: { depth: number } }) => (
        treeColumnId.value && cell.column.id === treeColumnId.value && cell.row.depth > 0
          ? { '--tree-indent': `${cell.row.depth * 16}px` }
          : null
      ),
    },
  },
}))

function getRowId(row: T): string {
  return props.rowKey(row)
}

function onSelect(_event: Event, row: TableRow<T>) {
  emit('select', row.original)
}

function clearFilters() {
  emit('clear-filters')
}

function expandAll() {
  tableRef.value?.tableApi?.expandAll()
}

function collapseAll() {
  tableRef.value?.tableApi?.collapseAll()
}

// 本组件已接管、不再由透传渲染的插槽名，避免与显式模板重复渲染。
// loading / empty 由模板内 v-if 判断：父组件提供同名插槽时透传，否则用缺省骨架/空态。
// 这里把它们并入 ownedSlots，禁止下方 v-for 再次透传，避免 UTable 同时收到
// 显式 #loading / #empty 与父插槽两份同名内容导致重复/优先级冲突。
const ownedSlots = computed(() => new Set([
  'loading',
  'empty',
  ...(props.selectable ? ['select-header', 'select-cell'] : []),
  ...(treeColumnId.value ? [`${treeColumnId.value}-cell`] : []),
]))

defineExpose<{ expandAll: () => void; collapseAll: () => void }>({ expandAll, collapseAll })
</script>

<template>
  <UTable
    ref="tableRef"
    :class="[styles['resource-table'], props.tableClass]"
    :columns="displayColumns"
    :data="props.data"
    :loading="props.loading"
    :meta="tableMeta"
    :get-row-id="getRowId"
    :get-sub-rows="props.treeChildrenKey"
    :column-pinning="columnPinning"
    sticky="header"
    @select="onSelect"
  >
    <!-- 勾选列（selectable 时） -->
    <template v-if="props.selectable" #select-header>
      <UCheckbox :model-value="allSelected" :indeterminate="someSelected" :aria-label="allSelected ? '取消全选' : '全选'" @update:model-value="(value: boolean | 'indeterminate') => toggleAll(value === true)" />
    </template>
    <template v-if="props.selectable" #select-cell="{ row }">
      <UCheckbox :model-value="selectedSet.has(row.id)" :aria-label="`选择第 ${row.index + 1} 行`" @update:model-value="(value: boolean | 'indeterminate') => onRowCheckbox(row.id, value)" />
    </template>

    <!-- 树形首列：缩进 + 展开箭头。父组件仍通过 #<treeColumnId>-cell 提供内容。 -->
    <template v-if="treeColumnId" #[`${treeColumnId}-cell`]="slotProps">
      <div :class="styles.treeRow">
        <button
          v-if="slotProps.row.getCanExpand()"
          type="button"
          :class="styles.treeToggle"
          :aria-label="slotProps.row.getIsExpanded() ? '折叠' : '展开'"
          @click.stop="slotProps.row.toggleExpanded()"
        >
          <UIcon :name="slotProps.row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" />
        </button>
        <slot :name="`${treeColumnId}-cell`" v-bind="slotProps" />
      </div>
    </template>

    <!-- #loading：父组件提供则透传，否则用缺省骨架屏。 -->
    <template #loading>
      <slot v-if="$slots.loading" name="loading" />
      <div v-else :class="styles.skeleton">
        <template v-for="r in props.skeletonRows" :key="r">
          <USkeleton v-for="c in props.columns" :key="String(c.id)" :class="styles.skeletonCell" />
        </template>
      </div>
    </template>

    <!-- #empty：父组件提供则透传，否则按 emptyMode 分型渲染缺省。 -->
    <template #empty>
      <slot v-if="$slots.empty" name="empty" />
      <div v-else :class="styles.empty">
        <UEmpty
          :icon="props.emptyMode === 'filtered' ? 'i-lucide-search' : 'i-lucide-inbox'"
          :title="props.emptyMode === 'filtered' ? '没有匹配的结果' : `还没有${props.resourceName}`"
          :description="props.emptyMode === 'filtered' ? '调整关键词或筛选条件后再试。' : `创建${props.resourceName}后会显示在这里。`"
          variant="naked"
        >
          <template v-if="props.emptyMode === 'filtered'" #actions>
            <UButton label="清除筛选" variant="link" @click="clearFilters" />
          </template>
        </UEmpty>
      </div>
    </template>

    <!-- 透传父组件其余列 cell 插槽（跳过已接管的选择/树形/内置插槽）。 -->
    <template v-for="(_, name) in $slots" :key="name" #[name]="slotProps">
      <slot v-if="!ownedSlots.has(name)" :name="name" v-bind="slotProps" />
    </template>
  </UTable>
</template>

<style module src="./index.module.css"></style>
