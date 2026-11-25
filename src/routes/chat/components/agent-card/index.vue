<script setup lang="ts">
import { computed, useCssModule } from 'vue'
import { AiOrb } from '@/components'
import type { SubAgent } from '@/interfaces'

defineOptions({ name: 'AgentCard' })

const props = defineProps<{
  agent: SubAgent
  selected: boolean
}>()
defineEmits<{ select: [] }>()
const styles = useCssModule()
/** 进度条颜色随状态变：推理中、已完成各有颜色。 */
const fillClass = computed(() => [
  styles['agent-mini-fill'],
  props.agent.status === 'think' ? styles.think : '',
  props.agent.status === 'done' ? styles.done : '',
].filter(Boolean).join(' '))

const statusLabel: Record<string, string> = {
  queued: '排队',
  think: '推理中',
  run: '执行中',
  done: '已完成',
  error: '失败',
  interrupted: '已中断',
}
/** think/run 是「正在进行」语义,用 Orb 循环动画;其余是静止态,保留静态 dot。 */
function isRunning(s: string) {
  return s === 'think' || s === 'run'
}
/** 静止态圆点配色;进行中态由 AiOrb 呈现,不走这里。 */
function dotClass(s: string) {
  if (s === 'done') return 'nominal'
  if (s === 'error') return 'error'
  if (s === 'interrupted') return 'warning'
  return 'idle'
}
</script>

<template>
  <button
    type="button"
    :class="[$style['agent-card'], { [$style.active]: selected }]"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <div :class="$style['agent-card-top']">
      <span :class="$style['agent-ic']"><i :class="`icon icon-${agent.icon}`"></i></span>
      <span :class="$style['agent-name']">{{ agent.name }}</span>
      <span :class="[$style['agent-pid'], 'mono']">{{ agent.pid }}</span>
    </div>
    <div :class="$style['agent-card-bot']">
      <AiOrb v-if="isRunning(agent.status)" :class="$style['orb-fit']" :size="14" :label="statusLabel[agent.status]" />
      <UChip v-else as="span" standalone size="xs" :ui="{ base: `dot ${dotClass(agent.status)}` }" />
      <span :class="$style['agent-status-txt']">{{ statusLabel[agent.status] }}</span>
      <UProgress
        :model-value="agent.progress"
        size="xs"
        :class="$style['agent-mini-prog']"
        :ui="{ base: $style['agent-mini-track'], indicator: fillClass }"
        :aria-label="`${agent.name} 进度`"
      />
    </div>
  </button>
</template>

<style module src="./index.module.css"></style>
