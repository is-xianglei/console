<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useCssModule, useId, watch } from 'vue'

defineOptions({ name: 'FilterPanel' })

const styles = useCssModule()

const props = withDefaults(
  defineProps<{
    /** 标题；同时作为整张卡片的 aria-label。 */
    title?: string
    /** 是否可折叠。 */
    collapsible?: boolean
    /** 折叠态（v-model:collapsed）。传入即受控：以父组件为准，不读写 localStorage。 */
    collapsed?: boolean
    /** 折叠态的 localStorage 键后缀，每页一个（如 'agents'）；不传则不持久化。 */
    storageKey?: string
    /** 缺省「重置」按钮是否禁用（如当前没有任何筛选条件）。 */
    resetDisabled?: boolean
  }>(),
  { title: '筛选条件', collapsible: true, collapsed: undefined, storageKey: '', resetDisabled: false },
)

const emit = defineEmits<{
  'update:collapsed': [collapsed: boolean]
  search: []
  reset: []
}>()

const STORAGE_PREFIX = 'console.filterPanel.collapsed:'
const bodyId = useId()

function storageId() {
  return props.storageKey ? `${STORAGE_PREFIX}${props.storageKey}` : ''
}

function readStored(): boolean {
  const key = storageId()
  if (!key || typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeStored(value: boolean) {
  const key = storageId()
  if (!key || typeof localStorage === 'undefined') return
  try {
    if (value) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    // 隐私模式等场景写入失败：只保留内存态。
  }
}

/** 非受控时的折叠态，初始化即读回本页的存储值。 */
const innerCollapsed = ref(readStored())
/** 受控（父组件传了 collapsed）时以 prop 为准；不可折叠的面板永远展开。 */
const collapsed = computed(() => props.collapsible && (props.collapsed ?? innerCollapsed.value))

function toggle() {
  const next = !collapsed.value
  if (props.collapsed === undefined) {
    innerCollapsed.value = next
    writeStored(next)
  }
  emit('update:collapsed', next)
}

/**
 * 按钮列横竖切换：字段排成 2 行及以上时竖叠，只有 1 行时并排。
 * 列数由容器查询决定（CSS），这里只数「实际渲染出几行」：统计字段的 offsetTop 种类数。
 * ResizeObserver 监听字段区——列数变化或字段增减导致行数变化时，字段区高度必然变化，
 * 回调里再数一次。测量放进 rAF，避免本次切换引起的尺寸变化在同一帧里触发 RO 循环告警。
 */
const fieldsRef = ref<HTMLElement | null>(null)
const multiRow = ref(false)
let resizeObserver: ResizeObserver | null = null
let frame = 0

function measureRows() {
  const fields = fieldsRef.value
  // 折叠（v-show 隐藏）时没有布局，保留上一次结果。
  if (!fields || fields.getClientRects().length === 0) return
  const tops = new Set<number>()
  for (const child of Array.from(fields.children)) {
    if (child instanceof HTMLElement && child.getClientRects().length > 0) tops.add(child.offsetTop)
  }
  multiRow.value = tops.size > 1
}

function scheduleMeasure() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    measureRows()
  })
}

onMounted(() => {
  // 首帧同步测量，保证首次绘制时按钮方向就是对的。
  measureRows()
  if (typeof ResizeObserver !== 'undefined' && fieldsRef.value) {
    resizeObserver = new ResizeObserver(scheduleMeasure)
    resizeObserver.observe(fieldsRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  if (frame) cancelAnimationFrame(frame)
})

// 展开后在绘制前补测一次，避免按钮方向闪一帧。
watch(collapsed, (value) => {
  if (!value) void nextTick(measureRows)
})

/**
 * 回车查询只在这里处理（使用方不要再给输入框挂 @keydown.enter）。
 * 只认文本类 input：下拉触发器、按钮上的回车保留它们自己的行为。
 * 输入法组字中的回车（isComposing；Safari 组字结束那一下 keyCode 为 229）不触发查询。
 * stopPropagation：外层容器若也监听回车（如记忆列表的行导航），不再重复响应。
 */
function onFieldsKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return
  if (!(event.target instanceof HTMLInputElement)) return
  event.preventDefault()
  event.stopPropagation()
  emit('search')
}
</script>

<template>
  <section :class="styles.filterPanel" :aria-label="props.title">
    <header :class="styles.head">
      <span :class="styles.title">{{ props.title }}</span>
      <UButton
        v-if="props.collapsible"
        :class="styles.toggle"
        color="neutral"
        variant="link"
        size="xs"
        :label="collapsed ? '展开' : '收起'"
        :trailing-icon="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
        :aria-expanded="!collapsed"
        :aria-controls="bodyId"
        :aria-label="`${collapsed ? '展开' : '收起'}${props.title}`"
        @click="toggle"
      />
    </header>

    <UCollapsible :open="!collapsed" :unmount-on-hide="false">
      <template #content>
        <div :id="bodyId" :class="styles.body">
          <div ref="fieldsRef" :class="styles.fields" @keydown="onFieldsKeydown">
            <slot />
          </div>
          <div :class="[styles.actions, multiRow && styles.stacked]">
            <slot name="actions">
              <UButton label="查询" icon="i-lucide-search" color="primary" @click="emit('search')" />
              <UButton label="重置" icon="i-lucide-rotate-ccw" color="neutral" variant="outline" :disabled="props.resetDisabled" @click="emit('reset')" />
            </slot>
          </div>
        </div>
      </template>
    </UCollapsible>
  </section>
</template>

<style module src="./index.module.css"></style>
