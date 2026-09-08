<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useId, watch } from 'vue'

defineOptions({ name: 'ThinkingBlock' })

const props = defineProps<{
  text: string
  duration: string
  collapsed: boolean
}>()

const bodyId = `thinking-${useId()}`

/* 视口上下渐隐的宽度(px),与 CSS 中 max-height: 180px 的视口配套 */
const FADE = 16
/* 距底部小于该阈值视为"贴底":流式新内容到达时才自动跟随滚动 */
const FOLLOW_THRESHOLD = 24

/*
 * collapsed 同步策略:
 * - open 初始取反:流式期间 reducer 给 collapsed=false,块保持展开。
 * - 首次 collapsed false→true(reducer 在 block_stop 触发)无条件折叠——
 *   "推理完成自动收起"是规范行为,即使用户在流式期间点过 header 也生效。
 * - settled 之后 open 完全交给用户点击,后续任何 prop 变化都不再覆盖,
 *   避免用户展开回看时被意外合上。
 */
const open = ref(!props.collapsed)
const settled = ref(props.collapsed)

watch(
  () => props.collapsed,
  (val) => {
    if (val && !settled.value) {
      settled.value = true
      open.value = false
    }
  },
)

/* 进行态:collapsed=false 表示推理仍在流式输出(block_stop 之前) */
const thinking = computed(() => !props.collapsed)

const viewportRef = ref<HTMLDivElement | null>(null)
const fade = reactive({ top: false, bottom: false })

/* 上下渐隐 mask:仅在对应方向还有溢出内容时出现,随滚动位置实时更新 */
const mask = computed(() => {
  if (!fade.top && !fade.bottom) return 'none'
  const top = fade.top ? FADE : 0
  const bottom = fade.bottom ? FADE : 0
  return `linear-gradient(to bottom, transparent 0, #000 ${top}px, #000 calc(100% - ${bottom}px), transparent 100%)`
})

function updateFade() {
  const el = viewportRef.value
  if (!el) return
  fade.top = el.scrollTop > 1
  fade.bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1
}

/* 流式跟随:text 增长时,若用户此前贴在底部(未手动上滚)则滚到最新内容。
 * watch 默认 pre flush,这里度量的是 DOM 更新前的滚动位置。 */
watch(
  () => props.text,
  () => {
    const el = viewportRef.value
    if (!el) return
    const follow = el.scrollTop + el.clientHeight >= el.scrollHeight - FOLLOW_THRESHOLD
    nextTick(() => {
      const node = viewportRef.value
      if (!node) return
      if (follow) node.scrollTop = node.scrollHeight
      updateFade()
    })
  },
)

onMounted(() => {
  /* 挂载时若仍在流式(如切换会话回来),直接定位到最新内容 */
  const el = viewportRef.value
  if (el && thinking.value) el.scrollTop = el.scrollHeight
  updateFade()
})

function toggle() {
  open.value = !open.value
  if (open.value) {
    /* 展开回看:回到顶部从头读(移植 AICSS 的 toggle 行为) */
    const el = viewportRef.value
    if (el) el.scrollTop = 0
    nextTick(updateFade)
  }
}
</script>

<template>
  <div :class="[$style['think-block'], { [$style.collapsed]: !open }]">
    <button type="button" :class="$style['think-head']" :aria-expanded="open" :aria-controls="bodyId" @click="toggle">
      <i :class="[$style['lead'], 'icon icon-brain']" aria-hidden="true"></i>
      <span :class="$style['think-lbl']">推理过程</span>
      <span :class="[$style['think-dur'], 'mono', { [$style.shimmer]: thinking }]">{{ duration }}</span>
      <i :class="[$style['think-chev'], 'icon icon-chevron-down']" aria-hidden="true"></i>
    </button>
    <div :class="$style['think-collapse']" :inert="!open">
      <div :class="$style['think-collapse-inner']">
        <div
          :id="bodyId"
          ref="viewportRef"
          :class="$style['think-body']"
          :style="{ maskImage: mask, WebkitMaskImage: mask }"
          @scroll="updateFade"
        >{{ text }}</div>
      </div>
    </div>
  </div>
</template>

<style module src="./index.module.css"></style>
