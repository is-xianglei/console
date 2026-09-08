<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, useCssModule } from 'vue'
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
  }>(),
  { loading: false, activeId: null, tableClass: undefined },
)

const emit = defineEmits<{ select: [row: T] }>()

const tableMeta = computed(() => ({
  class: {
    tr: (row: TableRow<T>) =>
      props.activeId != null && props.rowKey(row.original) === props.activeId ? styles.active : '',
  },
}))

function getRowId(row: T): string {
  return props.rowKey(row)
}

function onSelect(_event: Event, row: TableRow<T>) {
  emit('select', row.original)
}
</script>

<template>
  <UTable
    :class="[styles['resource-table'], props.tableClass]"
    :columns="props.columns"
    :data="props.data"
    :loading="props.loading"
    :meta="tableMeta"
    :get-row-id="getRowId"
    sticky="header"
    @select="onSelect"
  >
    <!-- 把父组件传进来的列 cell 插槽（如 #name-cell、#actions-cell、#empty）透传给 UTable。 -->
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps" />
    </template>
  </UTable>
</template>

<style module src="./index.module.css"></style>
