<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ name: 'ActionIconButton' })

const props = withDefaults(
  defineProps<{
    /** 必填：友好名称（作为 aria-label 与 tooltip）；如「编辑」。 */
    label: string
    /** 图标名（i-lucide-*）。 */
    icon: string
    /** 语义色。 */
    color?: 'primary' | 'neutral' | 'error' | 'warning' | 'success'
    /** 禁用。 */
    disabled?: boolean
    /** 禁用原因；禁用时 tooltip 显示该文案。 */
    disabledReason?: string
    /** 加载态。 */
    loading?: boolean
  }>(),
  { color: 'neutral', disabled: false, disabledReason: '', loading: false },
)

const tooltipText = computed(() => (props.disabled ? (props.disabledReason || props.label) : props.label))
</script>

<template>
  <UTooltip :text="tooltipText">
    <UButton
      :icon="props.icon"
      :color="props.color"
      variant="ghost"
      square
      :loading="props.loading"
      :disabled="props.disabled"
      :aria-label="props.label"
    >
      <slot />
    </UButton>
  </UTooltip>
</template>
