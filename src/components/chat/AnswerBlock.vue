<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { renderMarkdown } from '../../utils/markdown'

const props = defineProps<{
  text: string
  streaming: boolean
}>()

const STREAM_RENDER_INTERVAL_MS = 80

const html = shallowRef(renderMarkdown(props.text))
let lastRenderAt = performance.now()
let renderTimer: ReturnType<typeof setTimeout> | undefined
let renderFrame: number | undefined

function cancelScheduledRender() {
  if (renderTimer !== undefined) {
    clearTimeout(renderTimer)
    renderTimer = undefined
  }
  if (renderFrame !== undefined) {
    cancelAnimationFrame(renderFrame)
    renderFrame = undefined
  }
}

function renderNow(text: string) {
  html.value = renderMarkdown(text)
  lastRenderAt = performance.now()
}

function scheduleStreamRender() {
  if (renderTimer !== undefined || renderFrame !== undefined) return

  const elapsed = performance.now() - lastRenderAt
  const delay = Math.max(0, STREAM_RENDER_INTERVAL_MS - elapsed)
  renderTimer = setTimeout(() => {
    renderTimer = undefined
    renderFrame = requestAnimationFrame(() => {
      renderFrame = undefined
      renderNow(props.text)
    })
  }, delay)
}

watch(
  () => [props.text, props.streaming] as const,
  ([text, streaming]) => {
    if (streaming) {
      scheduleStreamRender()
      return
    }

    // 流结束时取消滞后的中间帧，立即提交完整且经过相同策略渲染的正文。
    cancelScheduledRender()
    renderNow(text)
  },
  { flush: 'sync' },
)

onBeforeUnmount(cancelScheduledRender)
</script>

<template>
  <div class="answer">
    <div class="md" v-html="html"></div>
    <span v-if="streaming" class="caret"></span>
  </div>
</template>

<style scoped>
.answer {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.65;
}
.md {
  display: inline;
}
.caret {
  display: inline-block;
  width: 7px;
  height: 14px;
  background: var(--accent-agent);
  vertical-align: text-bottom;
  margin-left: 2px;
  animation: caret-blink 1s step-end infinite;
  border-radius: 1px;
}
</style>
