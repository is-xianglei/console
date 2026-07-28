<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { renderMarkdown } from '@/utils'

defineOptions({ name: 'AnswerBlock' })

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
  <div :class="$style['answer']">
    <div class="md" v-html="html"></div>
    <span v-if="streaming" :class="$style['caret']"></span>
  </div>
</template>

<style module src="./index.module.css"></style>
