<script setup lang="ts">
import type { SubAgent } from '../../types'

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
  <div class="agent-card" :class="{ active: selected }" @click="$emit('select')">
    <div class="agent-card-top">
      <span class="agent-ic"><i :class="`icon icon-${agent.icon}`"></i></span>
      <span class="agent-name">{{ agent.name }}</span>
      <span class="agent-pid mono">{{ agent.pid }}</span>
    </div>
    <div class="agent-card-bot">
      <span class="dot" :class="dotClass(agent.status)"></span>
      <span class="agent-status-txt">{{ statusLabel[agent.status] }}</span>
      <span class="agent-mini-prog">
        <span
          class="agent-mini-fill"
          :class="{ think: agent.status === 'think', done: agent.status === 'done' }"
          :style="{ width: agent.progress + '%' }"
        ></span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.agent-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  cursor: pointer;
  position: relative;
  transition: background var(--dur-fast), border-color var(--dur-fast);
}
.agent-card:hover {
  background: var(--bg-elevated);
  border-color: var(--border-visible);
}
.agent-card.active {
  background: var(--bg-elevated);
  border-color: var(--accent-agent);
}
.agent-card.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 20px;
  background: var(--accent-agent);
  border-radius: 0 2px 2px 0;
}
.agent-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.agent-ic {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-control);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--accent-agent-dim);
  color: var(--accent-agent);
}
.agent-ic i {
  font-size: 13px;
}
.agent-name {
  flex: 1;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-pid {
  font-size: 9px;
  color: var(--text-dim);
}
.agent-card-bot {
  display: flex;
  align-items: center;
  gap: 8px;
}
.agent-status-txt {
  font-family: var(--font-data);
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.agent-mini-prog {
  flex: 1;
  height: 3px;
  background: var(--bg-elevated);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.agent-card.active .agent-mini-prog {
  background: var(--bg-surface);
}
.agent-mini-fill {
  height: 100%;
  display: block;
  background: var(--accent-agent);
  border-radius: var(--radius-pill);
  transition: width var(--dur-med);
}
.agent-mini-fill.think {
  background: var(--status-think);
}
.agent-mini-fill.done {
  background: var(--status-success);
}
</style>
