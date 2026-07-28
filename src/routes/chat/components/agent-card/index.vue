<script setup lang="ts">
import type { SubAgent } from '@/interfaces'

defineOptions({ name: 'AgentCard' })

defineProps<{
  agent: SubAgent
  selected: boolean
}>()
defineEmits<{ select: [] }>()

const statusLabel: Record<string, string> = {
  queued: '排队',
  think: '推理中',
  run: '执行中',
  done: '已完成',
  error: '失败',
}
function dotClass(s: string) {
  if (s === 'done') return 'nominal'
  if (s === 'error') return 'error'
  if (s === 'queued') return 'idle'
  return 'think'
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
      <span class="dot" :class="dotClass(agent.status)"></span>
      <span :class="$style['agent-status-txt']">{{ statusLabel[agent.status] }}</span>
      <span :class="$style['agent-mini-prog']">
        <span
          :class="[
            $style['agent-mini-fill'],
            {
              [$style.think]: agent.status === 'think',
              [$style.done]: agent.status === 'done',
            },
          ]"
          :style="{ width: agent.progress + '%' }"
        ></span>
      </span>
    </div>
  </button>
</template>

<style module src="./index.module.css"></style>
