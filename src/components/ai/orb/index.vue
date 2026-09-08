<script setup lang="ts">
/**
 * Orb — Agent 活动状态指示器（AICSS M3「展开」变体）。
 *
 * 8 个点沿圆周分布，在四个相隔 90° 的快照之间插值，形成持续的旋转展开感。
 * 几何按 28px 舞台手调，--orb-k 负责缩放到目标 size，因此点径、半径与
 * 间距在任意尺寸下都保持同一视觉配重——只调 size，不要改内部像素值。
 */
import { computed } from 'vue'

defineOptions({ name: 'AiOrb' })

/** 几何基准舞台，--orb-k = size / STAGE。 */
const STAGE = 28
/** 圆周上的点数。 */
const DOT_N = 8
/** 圆周半径（舞台像素）。 */
const DOT_R = 7

withDefaults(
  defineProps<{
    /** 渲染边长（px），28px 基准几何会等比缩放。 */
    size?: number
    /** 无障碍标签；设置 pill 时同时作为可见状态文案。 */
    label?: string
    /** 包成状态胶囊，在圆点右侧显示 label。 */
    pill?: boolean
  }>(),
  { size: 20, label: '推理中…', pill: false },
)

/** 第 i 个点在旋转 turn 弧度后的圆周坐标。 */
function dotAt(i: number, turn: number): string {
  const a = (i / DOT_N) * Math.PI * 2 - Math.PI / 2 + turn
  return `${(Math.cos(a) * DOT_R).toFixed(1)}px, ${(Math.sin(a) * DOT_R).toFixed(1)}px`
}

/** 每个点的四个关键帧位置，交给 CSS 在其间插值。 */
const dots = computed(() =>
  Array.from({ length: DOT_N }, (_, i) => ({
    key: i,
    m1: dotAt(i, 0),
    m2: dotAt(i, Math.PI / 2),
    m3: dotAt(i, Math.PI),
    m4: dotAt(i, Math.PI * 1.5),
  })),
)
</script>

<template>
  <span :class="$style.root" :data-pill="pill ? '' : null">
    <!-- 胶囊形态下可见文案已经承载语义，图形本身退出无障碍树。 -->
    <span
      :class="$style.glyph"
      :role="pill ? undefined : 'img'"
      :aria-label="pill ? undefined : label"
      :aria-hidden="pill ? 'true' : undefined"
      :style="{ width: `${size}px`, height: `${size}px`, '--orb-k': size / STAGE }"
    >
      <span :class="$style.morph">
        <span
          v-for="d in dots"
          :key="d.key"
          :class="$style['morph-dot']"
          :style="{ '--m-1': d.m1, '--m-2': d.m2, '--m-3': d.m3, '--m-4': d.m4 }"
        ></span>
      </span>
    </span>
    <span v-if="pill" :class="$style['pill-label']">{{ label }}</span>
  </span>
</template>

<style module src="./index.module.css"></style>
