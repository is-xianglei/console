<script setup lang="ts">
import { computed, useCssModule } from 'vue'

defineOptions({ name: 'RelativeTime' })

const styles = useCssModule()

const props = withDefaults(
  defineProps<{
    /** ISO 时间字符串。非法值渲染「—」。 */
    value?: string | null
    /** 'relative'：相对时间，超过 7 天自动切绝对；'absolute'：始终 YYYY-MM-DD HH:mm:ss。 */
    mode?: 'relative' | 'absolute'
    /** 可注入的当前时间（ms），供单测固定；不传时每次重算，值更新后不会被当成未来时间。 */
    now?: number
  }>(),
  { value: null, mode: 'relative', now: undefined },
)

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

const parsedAt = computed(() => {
  if (props.value == null || props.value === '') return null
  const d: number = Date.parse(props.value)
  return Number.isFinite(d) ? d : null
})

/** 完整时间（tooltip / absolute 模式）：YYYY-MM-DD HH:mm:ss。 */
const full = computed(() => {
  const at = parsedAt.value
  if (at == null) return ''
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

const relative = computed(() => {
  const at = parsedAt.value
  if (at == null) return ''
  const now = props.now ?? Date.now()
  const diff = now - at
  const abs = Math.abs(diff)
  // diff >= 0：过去；diff < 0：未来。
  const suffix = (label: string) => (diff >= 0 ? `${label}前` : `${label}后`)
  if (abs < 60_000) return diff >= 0 ? '刚刚' : '稍后'
  if (abs < 3_600_000) return suffix(`${Math.round(abs / 60_000)} 分钟`)
  if (abs < 86_400_000) return suffix(`${Math.round(abs / 3_600_000)} 小时`)
  if (abs < SEVEN_DAYS_MS) return suffix(`${Math.round(abs / 86_400_000)} 天`)
  // 超过 7 天自动切绝对。
  return full.value
})

const display = computed(() => {
  if (parsedAt.value == null) return '—'
  if (props.mode === 'absolute') return full.value
  return relative.value
})

const valid = computed(() => parsedAt.value != null)
</script>

<template>
  <UTooltip v-if="valid" :text="full">
    <span :class="styles.time">{{ display }}</span>
  </UTooltip>
  <span v-else :class="[styles.time, styles.empty]">—</span>
</template>

<style module src="./index.module.css"></style>
