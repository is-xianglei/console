<script setup lang="ts">
import { useCssModule } from 'vue'

defineOptions({ name: 'ResourcePagination' })

const styles = useCssModule()

const props = withDefaults(
  defineProps<{
    /** 当前页已展示条数。 */
    shown: number
    /** 匹配条件的总条数。 */
    total: number
    /** 启用真分页时传入；否则退化为"当前显示 X / Y"计数条。 */
    page?: number
    itemsPerPage?: number
    onPage?: (page: number) => void
    /** 计数条右侧的自定义内容（如 API CATALOG 徽标）；缺省不渲染。 */
    footerExtra?: string
  }>(),
  { page: undefined, itemsPerPage: 0, onPage: undefined, footerExtra: '' },
)

function isPaged(): boolean {
  return props.page != null && props.itemsPerPage > 0
}

function onPageChange(page: number) {
  if (props.page != null) props.onPage?.(page)
}
</script>

<template>
  <footer :class="styles['resource-pagination']">
    <span>当前显示 {{ props.shown }} / {{ props.total }} 条</span>
    <span v-if="!isPaged() && props.footerExtra" class="mono">{{ props.footerExtra }}</span>
    <UPagination
      v-if="isPaged()"
      :page="props.page"
      :items-per-page="props.itemsPerPage"
      :total="props.total"
      @update:page="onPageChange"
    />
    <span v-else-if="!props.footerExtra" class="mono">LIST</span>
  </footer>
</template>

<style module src="./index.module.css"></style>
