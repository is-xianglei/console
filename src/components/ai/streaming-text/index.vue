<script setup lang="ts">
/**
 * StreamingText — 流式 markdown 正文(AICSS streaming-text 移植)。
 *
 * 新到的文字逐字揭示，节奏见 ./pacer；markdown 只渲染已揭示的前缀，重渲按 RENDER_INTERVAL_MS 节流。
 * 块状光标三态：揭示中常亮；流式中已追平、等新 token 时闪烁；流结束且揭示完后移除。
 */
import { usePreferredReducedMotion } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { renderMarkdown } from '@/utils'
import { advancePacer, createPacer, initialPacer, retargetPacer, revealedLength } from './pacer'

defineOptions({ name: 'StreamingText' })

const props = defineProps<{
  /** 原始 markdown，流式期间持续增长 */
  text: string
  /** 是否仍在流式输出 */
  streaming: boolean
}>()

/* 逐字揭示时 markdown 重渲的最短间隔；减少动效时沿用原先的整段节流间隔 */
const RENDER_INTERVAL_MS = 32
const REDUCED_RENDER_INTERVAL_MS = 80

const reducedMotion = usePreferredReducedMotion()

/* 流式中挂载的从头揭示(见 initialPacer)；历史消息与减少动效时直接全部显示 */
const replayOnMount = props.streaming && reducedMotion.value !== 'reduce'
let pacer = initialPacer(props.text.length, replayOnMount)
let renderedText = replayOnMount ? '' : props.text
const html = shallowRef(renderMarkdown(renderedText))
let lastRenderAt = performance.now()

/* 是否还有已收到但未揭示的字：决定光标常亮还是闪烁 */
const revealing = ref(false)
const showCaret = computed(() => props.streaming || revealing.value)

let frame: number | undefined
let lastFrameAt = 0
let renderTimer: ReturnType<typeof setTimeout> | undefined

function renderNow() {
  if (renderTimer !== undefined) {
    clearTimeout(renderTimer)
    renderTimer = undefined
  }
  const next = props.text.slice(0, revealedLength(props.text, pacer.cursor))
  lastRenderAt = performance.now()
  if (next === renderedText) return
  renderedText = next
  html.value = renderMarkdown(next)
}

/* 节流重渲：距上次不足间隔时排一个定时器，到点渲染当时的最新前缀 */
function scheduleRender(interval: number) {
  if (renderTimer !== undefined) return
  const wait = interval - (performance.now() - lastRenderAt)
  if (wait <= 0) {
    renderNow()
    return
  }
  renderTimer = setTimeout(() => {
    renderTimer = undefined
    renderNow()
  }, wait)
}

function tick(now: number) {
  frame = undefined
  pacer = advancePacer(pacer, now - lastFrameAt)
  lastFrameAt = now
  if (pacer.cursor >= pacer.target) {
    /* 追平：立即提交完整前缀，光标转为闪烁或随流结束移除 */
    revealing.value = false
    renderNow()
    return
  }
  scheduleRender(RENDER_INTERVAL_MS)
  frame = requestAnimationFrame(tick)
}

function startReveal() {
  revealing.value = true
  if (frame !== undefined) return
  lastFrameAt = performance.now()
  frame = requestAnimationFrame(tick)
}

watch(
  () => props.text,
  (text) => {
    if (reducedMotion.value === 'reduce') {
      /* 减少动效：不逐字揭示，收到即显示，仍按节流重渲 */
      pacer = createPacer(text.length)
      if (props.streaming) scheduleRender(REDUCED_RENDER_INTERVAL_MS)
      else renderNow()
      return
    }
    pacer = retargetPacer(pacer, text.length)
    if (pacer.cursor < pacer.target) startReveal()
    else renderNow()
  },
  { flush: 'sync' },
)

/* 流结束：没揭示完的部分继续按追赶速度揭示；已追平(或减少动效)则立即提交完整正文 */
watch(
  () => props.streaming,
  (streaming) => {
    if (streaming || frame !== undefined) return
    pacer = createPacer(props.text.length)
    renderNow()
  },
  { flush: 'sync' },
)

/* 流式中挂载且已有字：挂载后立即开始揭示 */
onMounted(() => {
  if (pacer.cursor < pacer.target) startReveal()
})

onBeforeUnmount(() => {
  if (frame !== undefined) cancelAnimationFrame(frame)
  if (renderTimer !== undefined) clearTimeout(renderTimer)
})
</script>

<template>
  <div :class="$style['streaming-text']">
    <div class="md" v-html="html"></div>
    <span v-if="showCaret" :class="[$style.caret, { [$style['caret-steady']]: revealing }]" aria-hidden="true"></span>
  </div>
</template>

<style module src="./index.module.css"></style>
