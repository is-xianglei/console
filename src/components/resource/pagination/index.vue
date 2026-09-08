<script setup lang="ts">
import { computed, ref, useCssModule } from 'vue'
import { clampPage, isPaged } from './pagination-core'

defineOptions({ name: 'ResourcePagination' })

const styles = useCssModule()

const props = withDefaults(
  defineProps<{
    /** 当前页已展示条数。 */
    shown: number
    /** 匹配条件的总条数（真分页时用于计算页数）。 */
    total: number
    /** 当前页码（v-model:page）。 */
    page?: number
    /** 每页条数（v-model:itemsPerPage）；0 表示退化为「仅计数」旧调用。 */
    itemsPerPage?: number
    /** 可选的每页条数列表。 */
    pageSizes?: number[]
    /** 兼容旧接口的页码回调（保留一个阶段作过渡）。 */
    onPage?: (page: number) => void
    /** 计数条右侧的自定义内容（如 API CATALOG 徽标）；缺省不渲染。 */
    footerExtra?: string
  }>(),
  {
    page: undefined,
    itemsPerPage: 0,
    pageSizes: () => [10, 20, 50, 100],
    onPage: undefined,
    footerExtra: '',
  },
)

const emit = defineEmits<{
  'update:page': [page: number]
  'update:itemsPerPage': [size: number]
}>()

const isPagedRef = computed(() => isPaged(props.page, props.itemsPerPage))
const pageCount = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.itemsPerPage ?? 1))))
const clampedPage = computed(() => clampPage(props.page ?? 1, props.total, props.itemsPerPage ?? 1))

/** 跳转输入框的内联值（回车/失焦生效前不直接改 page）。 */
const jumpValue = ref(props.page ?? 1)

function syncJump() {
  if (!isPagedRef.value) return
  jumpValue.value = clampedPage.value
}
function onPageChange(page: number) {
  if (!isPagedRef.value) return
  const next = clampPage(page, props.total, props.itemsPerPage)
  emit('update:page', next)
  props.onPage?.(next)
  syncJump()
}

function onItemsPerPageChange(size: number) {
  emit('update:itemsPerPage', size)
  // 切每页条数时 page 归 1。
  onPageChange(1)
}

function onJump() {
  if (!isPagedRef.value) return
  let next = Number(jumpValue.value)
  if (!Number.isFinite(next)) next = clampedPage.value
  next = clampPage(next, props.total, props.itemsPerPage)
  onPageChange(next)
  syncJump()
}
</script>

<template>
  <footer :class="styles['resource-pagination']">
    <!-- 旧调用（itemsPerPage=0）：保持既有的「当前显示 X / Y 条」不变。 -->
    <template v-if="!isPagedRef">
      <span>当前显示 {{ props.shown }} / {{ props.total }} 条</span>
      <span v-if="props.footerExtra" class="mono">{{ props.footerExtra }}</span>
      <span v-else class="mono">LIST</span>
    </template>

    <!-- 真分页：总数 / 每页条数 / 页码 / 跳转。 -->
    <template v-else>
      <span>共 {{ props.total }} 条</span>
      <div :class="styles.controls">
        <USelect
          :model-value="props.itemsPerPage"
          :items="props.pageSizes.map((size) => ({ value: size, label: `${size}条/页` }))"
          :aria-label="'每页条数'"
          size="sm"
          class="w-20"
          @update:model-value="onItemsPerPageChange"
        />
        <UPagination
          :page="clampedPage"
          :items-per-page="props.itemsPerPage"
          :total="props.total"
          @update:page="onPageChange"
        />
        <div :class="styles.jump">
          <span>前往</span>
          <UInputNumber
            :model-value="jumpValue"
            :min="1"
            :max="pageCount"
            size="sm"
            class="w-16"
            aria-label="跳转页码"
            @update:model-value="(value: number | null) => { jumpValue = value ?? 1 }"
            @keyup.enter="onJump"
            @blur="onJump"
          />
          <span>页</span>
        </div>
      </div>
    </template>
  </footer>
</template>

<style module src="./index.module.css"></style>
