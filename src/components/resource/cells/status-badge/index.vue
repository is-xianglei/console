<script setup lang="ts">
import { computed, useCssModule } from 'vue'

defineOptions({ name: 'StatusBadge' })

const styles = useCssModule()

const props = withDefaults(
  defineProps<{
    /** 启用态布尔（与 status 二选一）。 */
    enabled?: boolean
    /** 状态字符串（与 enabled 二选一）。 */
    status?: string
    /** 覆盖文案。 */
    label?: string
    /** 状态 -> 语义色映射；缺省按常见状态推断。 */
    map?: Record<string, { color: 'success' | 'neutral' | 'warning' | 'error'; label?: string }>
    /** 启用态的语义色。 */
    enabledColor?: 'success' | 'neutral' | 'warning' | 'error'
  }>(),
  {
    enabled: undefined,
    status: '',
    label: '',
    map: () => ({}),
    enabledColor: 'success',
  },
)

const DEFAULT_MAP: Record<string, { color: 'success' | 'neutral' | 'warning' | 'error'; label: string }> = {
  enabled: { color: 'success', label: '启用' },
  disabled: { color: 'neutral', label: '停用' },
  active: { color: 'success', label: '正常' },
  inactive: { color: 'neutral', label: '停用' },
  pending: { color: 'warning', label: '待定' },
  error: { color: 'error', label: '异常' },
}

const resolved = computed<{ color: 'success' | 'neutral' | 'warning' | 'error'; label: string }>(() => {
  if (props.label) {
    return {
      color: props.enabled ? props.enabledColor : 'neutral',
      label: props.label,
    }
  }
  if (props.enabled != null) {
    return {
      color: props.enabled ? (props.enabledColor) : 'neutral',
      label: props.enabled ? '启用' : '停用',
    }
  }
  const status = props.status || ''
  const entry = props.map[status] ?? DEFAULT_MAP[status]
  if (entry) return { color: entry.color, label: entry.label ?? status }
  return { color: 'neutral', label: status || '—' }
})
</script>

<template>
  <UBadge :color="resolved.color" variant="subtle" size="xs" :class="styles.badge">
    {{ resolved.label }}
  </UBadge>
</template>

<style module src="./index.module.css"></style>
