<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  text: string
  duration: string
  collapsed: boolean
}>()

const open = ref(!props.collapsed)
</script>

<template>
  <div class="think-block" :class="{ collapsed: !open }">
    <div class="think-head" @click="open = !open">
      <i class="icon icon-brain lead"></i>
      <span class="think-lbl">推理过程</span>
      <span class="think-dur mono">{{ duration }}</span>
      <i class="icon icon-chevron-down think-chev"></i>
    </div>
    <div class="think-body">{{ text }}</div>
  </div>
</template>

<style scoped>
.think-block {
  border: 1px solid var(--border-subtle);
  border-left: 2px solid var(--status-think);
  border-radius: var(--radius-md);
  background: rgba(167, 139, 250, 0.04);
  overflow: hidden;
}
.think-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background var(--dur-fast);
}
.think-head:hover {
  background: rgba(167, 139, 250, 0.07);
}
.think-head i.lead {
  font-size: 13px;
  color: var(--status-think);
}
.think-lbl {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--status-think);
}
.think-dur {
  font-size: 9px;
  color: var(--text-dim);
}
.think-chev {
  margin-left: auto;
  font-size: 14px;
  color: var(--text-dim);
  transition: transform var(--dur-fast);
}
.think-block.collapsed .think-chev {
  transform: rotate(-90deg);
}
.think-body {
  padding: 0 14px 12px 14px;
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  font-style: italic;
}
.think-block.collapsed .think-body {
  display: none;
}
</style>
