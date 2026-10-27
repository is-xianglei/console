<script setup lang="ts">
/**
 * ThinkingReasoning — 推理过程块（AICSS thinking-reasoning 移植）。
 *
 * 进行中：标题扫光、不可点；正文视口随内容增高，封顶后最新内容被推到底部渐隐区上方。
 * 结束后自动收起，标题变成「已思考 N 秒」并可点开回看，展开后视口改为原生滚动。
 */
import { useResizeObserver } from '@vueuse/core'
import { computed, nextTick, reactive, ref, useId } from 'vue'

defineOptions({ name: 'ThinkingReasoning' })

const props = defineProps<{
  /** 推理原文，流式期间持续增长 */
  text: string
  /** 推理是否已结束 */
  done: boolean
  /** 思考秒数；历史消息没有，只显示「已思考」 */
  seconds?: number
}>()

/* 视口封顶高度与上下渐隐宽度(px)，与 CSS 中的视口配套 */
const MAX_H = 180
const FADE = 16

const bodyId = `thinking-${useId()}`
const viewportRef = ref<HTMLDivElement | null>(null)
const streamRef = ref<HTMLDivElement | null>(null)

/* 用户是否展开。只在结束后生效：进行中始终展开，结束即收起 */
const open = ref(false)
const expanded = computed(() => (props.done ? open.value : true))

/* 秒数文案带前导空格；写在模板里时前导空格会被编译器的空白压缩吃掉 */
const secondsText = computed(() => (props.seconds != null ? ` ${props.seconds} 秒` : ''))

/* 推理原文按换行拆段，空段跳过；key 用下标，新段挂载时淡入 */
const paragraphs = computed(() => props.text.split(/\r?\n/).filter((line) => line.trim()))

/* 内容真实高度：段落长度不定，直接量 stream 元素(transform 不影响测量) */
const contentH = ref(0)
useResizeObserver(streamRef, ([entry]) => {
  if (entry) contentH.value = entry.contentRect.height
})

const capped = computed(() => contentH.value > MAX_H)
const viewH = computed(() => (capped.value ? MAX_H : contentH.value))
/* 结束且用户展开后才允许原生滚动；进行中由 translate 跟随最新内容 */
const scrollable = computed(() => props.done && open.value)
const translate = computed(() => (scrollable.value || !capped.value ? 0 : MAX_H - FADE - contentH.value))

/* 上下渐隐：跟随模式下封顶即两端都有；滚动模式下随滚动位置实时更新 */
const fade = reactive({ top: false, bottom: true })
const showTop = computed(() => (scrollable.value ? fade.top : capped.value))
const showBottom = computed(() => (scrollable.value ? fade.bottom : capped.value))
const mask = computed(() =>
  capped.value
    ? `linear-gradient(to bottom, transparent 0, #000 ${showTop.value ? FADE : 0}px, #000 calc(100% - ${showBottom.value ? FADE : 0}px), transparent 100%)`
    : 'none',
)

function onScroll() {
  const el = viewportRef.value
  if (!el) return
  fade.top = el.scrollTop > 1
  fade.bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1
}

function toggle() {
  if (!props.done) return
  const next = !open.value
  if (next) {
    /* 展开回看：回到顶部从头读 */
    fade.top = false
    fade.bottom = true
    if (viewportRef.value) viewportRef.value.scrollTop = 0
    nextTick(onScroll)
  }
  open.value = next
}
</script>

<template>
  <div :class="$style.tr">
    <button
      type="button"
      :class="[$style['tr-header'], { [$style['is-clickable']]: done }]"
      :aria-expanded="expanded"
      :aria-controls="bodyId"
      :aria-disabled="done ? undefined : 'true'"
      @click="toggle"
    >
      <span v-if="done" :class="$style['tr-label']">
        <span :class="$style['tr-verb']">已思考</span>{{ secondsText }}
      </span>
      <span v-else :class="[$style['tr-label'], $style['tr-shimmer']]">思考中…</span>
      <svg v-if="done" :class="$style['tr-chevron']" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
        <path
          d="m4.5 15.75 7.5-7.5 7.5 7.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <div :class="[$style['tr-collapsible'], { [$style['is-collapsed']]: !expanded }]" :inert="!expanded">
      <div :class="$style['tr-inner']">
        <div
          :id="bodyId"
          ref="viewportRef"
          :class="[$style['tr-viewport'], { [$style['is-scroll']]: scrollable }]"
          :style="{ height: `${viewH}px`, maskImage: mask, WebkitMaskImage: mask }"
          @scroll="onScroll"
        >
          <div ref="streamRef" :class="$style['tr-stream']" :style="{ transform: `translateY(${translate}px)` }">
            <p v-for="(line, i) in paragraphs" :key="i" :class="$style['tr-sentence']">{{ line }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style module src="./index.module.css"></style>
