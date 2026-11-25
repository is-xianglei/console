<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, nextTick, onBeforeUnmount, ref, useCssModule, useSlots, watch } from 'vue'
import type { TableColumn, TableRow } from '@nuxt/ui'

defineOptions({ name: 'ResourceTable' })

const styles = useCssModule()
// 模板里的 $slots 走渲染上下文，脚本里拿不到，需要 useSlots()。
const $slots = useSlots()

const props = withDefaults(
  defineProps<{
    columns: TableColumn<T>[]
    data: T[]
    loading?: boolean
    /** 行唯一键，供 get-row-id 与选中态使用。 */
    rowKey: (row: T) => string
    /**
     * 当前选中行 id，用于高亮；传 null 表示不启用高亮。
     * 只传「此刻正在指向」的行（如键盘光标），不要直接传 store 里会长期保留的 selectedId，
     * 否则查看或编辑过的那一行回到列表后会一直亮着。
     */
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

// 仅声明我们需要的树形 API。这里必须照抄 TanStack 的真实方法名：
// table-core 只有 toggleAllRowsExpanded(expanded?)，没有 expandAll / collapseAll。
// 写错名字时 `?.` 会静默吞掉调用（表现为工具栏「全部展开/折叠」点了没反应），
// 所以类型按真实签名收紧，让改错名直接编译报错。
const tableRef = ref<{ tableApi?: { toggleAllRowsExpanded: (expanded?: boolean) => void } } | null>(null)

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
    meta: { class: { th: styles.selectCell, td: styles.selectCell } },
  } as TableColumn<T>
  return [selectColumn, ...props.columns]
})

const columnPinning = computed(() => (
  props.pinActions && props.columns.some((col) => col.id === 'actions') ? { right: ['actions'] } : undefined
))

// ===== 树形：首列缩进 & 展开箭头 =====
const treeColumnId = computed(() => (props.treeChildrenKey ? props.columns[0]?.id : undefined))

// 只放 tr：UTable 的 td/th 类名与内联样式取自**列级** columnDef.meta，
// 表级 meta 仅 class.tr 被读取（见 @nuxt/ui Table.vue：tr 用
// tableApi.options.meta?.class?.tr，td 用 cell.column.columnDef.meta?.class?.td）。
// 树形缩进因此改由下方树形插槽按 row.depth 直接给 .treeRow 设 --tree-indent。
const tableMeta = computed(() => ({
  class: {
    tr: (row: TableRow<T>) => [
      props.activeId != null && props.rowKey(row.original) === props.activeId ? styles.active : '',
      props.highlightId != null && props.rowKey(row.original) === props.highlightId ? styles.highlighted : '',
      `highlight-row-${props.rowKey(row.original)}`,
    ].filter(Boolean).join(' '),
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
  tableRef.value?.tableApi?.toggleAllRowsExpanded(true)
}

function collapseAll() {
  tableRef.value?.tableApi?.toggleAllRowsExpanded(false)
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

// 真正需要透传给 UTable 的插槽名白名单。
//
// 不能直接 v-for 遍历 $slots：模板的 `<template v-for="(_, name) in $slots" #[name]>`
// 会被编译到所有静态具名槽**之后**，而 Vue 的 createSlots 是「后者胜」
// （runtime-core 里对 dynamicSlots 按序赋值 slots[name] = fn）。于是父组件传入的
// #<首列 id>-cell 会把上面那个树形槽整个顶掉——表现为树形表格的展开箭头消失、
// 子行缩进失效，而父组件只提供了单元格内容、并未想接管整格。
// 用白名单控制遍历来源，让树形/勾选/内置槽保留在本组件手里。
const passthroughSlots = computed(() => Object.keys($slots).filter((name) => !ownedSlots.value.has(name)))

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
      <UCheckbox :model-value="someSelected ? 'indeterminate' : allSelected" :aria-label="allSelected ? '取消全选' : '全选'" @update:model-value="(value: boolean | 'indeterminate') => toggleAll(value === true)" />
    </template>
    <template v-if="props.selectable" #select-cell="{ row }">
      <UCheckbox :model-value="selectedSet.has(row.id)" :aria-label="`选择第 ${row.index + 1} 行`" @update:model-value="(value: boolean | 'indeterminate') => onRowCheckbox(row.id, value)" />
    </template>

    <!-- 树形首列：缩进 + 展开箭头。父组件仍通过 #<treeColumnId>-cell 提供内容。 -->
    <template v-if="treeColumnId" #[`${treeColumnId}-cell`]="slotProps">
      <div :class="styles.treeRow" :style="slotProps.row.depth > 0 ? { '--tree-indent': `${slotProps.row.depth * 16}px` } : undefined">
        <UButton
          v-if="slotProps.row.getCanExpand()"
          :class="styles.treeToggle"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          :icon="slotProps.row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          :aria-label="slotProps.row.getIsExpanded() ? '折叠' : '展开'"
          @click.stop="slotProps.row.toggleExpanded()"
        />
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

    <!-- 透传父组件其余列 cell 插槽（source 已滤掉已接管的选择/树形/内置插槽）。 -->
    <template v-for="name in passthroughSlots" :key="name" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps" />
    </template>
  </UTable>
</template>

<style module src="./index.module.css"></style>
