<script setup lang="ts">
import type { CliTag } from '../../types'

defineProps<{
  tag: CliTag
  fn: string
  body: string
  done: boolean
}>()
</script>

<template>
  <div class="cli-card">
    <div class="cli-bar">
      <span class="cli-tag" :class="tag.toLowerCase()">{{ tag }}</span>
      <span class="cli-fn">{{ fn }}</span>
      <span class="cli-state">
        <template v-if="done"><span class="ok">✓</span> 完成</template>
        <template v-else><span class="cli-spin"></span>运行</template>
      </span>
    </div>
    <div v-if="body" class="cli-body">{{ body }}</div>
  </div>
</template>

<style scoped>
.cli-card {
  font-family: var(--font-data);
  font-size: 11px;
  line-height: 1.5;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--bg-panel);
  overflow: hidden;
  animation: entry-appear 180ms ease-out;
}
.cli-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}
.cli-tag {
  font-family: var(--font-data);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  padding: 1px 7px;
  border-radius: var(--radius-sm);
}
.cli-tag.tool,
.cli-tag.spawn {
  color: var(--status-info);
  background: rgba(96, 165, 250, 0.12);
}
.cli-tag.result,
.cli-tag.done {
  color: var(--status-success);
  background: rgba(52, 211, 153, 0.12);
}
.cli-tag.error {
  color: var(--status-error);
  background: rgba(248, 113, 113, 0.12);
}
.cli-tag.warn {
  color: var(--status-warning);
  background: rgba(251, 191, 36, 0.12);
}
.cli-tag.start,
.cli-tag.think {
  color: var(--accent-agent);
  background: var(--accent-agent-dim);
}
.cli-fn {
  flex: 1;
  color: var(--text-secondary);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cli-state {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.cli-state .ok {
  color: var(--status-success);
}
.cli-spin {
  width: 11px;
  height: 11px;
  border: 1.5px solid var(--border-strong);
  border-top-color: var(--status-info);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.cli-body {
  padding: 9px 12px;
  color: var(--text-muted);
  white-space: pre-wrap;
  font-size: 10.5px;
  line-height: 1.6;
}
</style>
