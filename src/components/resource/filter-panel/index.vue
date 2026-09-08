<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'

defineOptions({ name: 'FilterPanel' })

const styles = useCssModule()

const props = withDefaults(
  defineProps<{
    /** 标题。 */
    title?: string
    /** 是否可折叠。 */
    collapsible?: boolean
    /** 折叠态（v-model:collapsed）；缺省内部状态 + localStorage 记忆。 */
    collapsed?: boolean
    /** 栅格列数；窄屏（<1024px）自动降为 1 列。 */
    columns?: number
  }>(),
  { title: '筛选条件', collapsible: true, collapsed: undefined, columns: 3 },
)

const emit = defineEmits<{
  'update:collapsed': [collapsed: boolean]
  search: []
  reset: []
}>()

const STORAGE_KEY = 'console.filterPanel.collapsed'
const internal = ref(false)
const collapsed = ref(props.collapsed ?? internal.value)

// 列数经 CSS 变量传给栅格：grid-template-columns 走 CSS Module 静态规则（Tailwind JIT
// 无法预扫描运行时拼接的任意类，`grid-cols-[repeat(...)]` 不会生成样式，故改内联变量）。
const gridStyle = computed(() => ({ '--filter-cols': props.columns }))

watch(
  () => props.collapsed,
  (value) => {
    if (value !== undefined && value !== collapsed.value) collapsed.value = value
  },
)

function toggle() {
  collapsed.value = !collapsed.value
  emit('update:collapsed', collapsed.value)
  if (collapsed.value && typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, '1')
  } else if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY)
  }
}

function onSearch() {
  emit('search')
}
function onReset() {
  emit('reset')
}

function onGridKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    onSearch()
  }
}

// 缺省 actions：搜索 / 重置。
</script>

<template>
  <section :class="styles.filterPanel" aria-label="筛选条件">
    <header :class="styles.head">
      <span :class="styles.title"><UIcon name="i-lucide-sliders-horizontal" />{{ props.title }}</span>
      <button
        v-if="props.collapsible"
        type="button"
        :class="styles.toggle"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? '展开筛选条件' : '收起筛选条件'"
        @click="toggle"
      >
        {{ collapsed ? '恢复' : '收起' }}
        <UIcon :name="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" />
      </button>
    </header>

    <div v-show="!collapsed" :class="styles.body">
      <div :class="styles.grid" :style="gridStyle" @keydown="onGridKeydown">
        <slot />
      </div>
      <div :class="styles.actions">
        <slot name="actions">
          <UButton label="搜索" icon="i-lucide-search" color="primary" @click="onSearch" />
          <UButton label="重置" icon="i-lucide-rotate-ccw" color="neutral" variant="outline" @click="onReset" />
        </slot>
      </div>
    </div>
  </section>
</template>

<style module src="./index.module.css"></style>
