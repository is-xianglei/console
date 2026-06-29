<script setup lang="ts">
import { Markdown } from 'vue-stream-markdown'

defineProps<{
  text: string
  streaming: boolean
}>()
</script>

<template>
  <div class="answer">
    <Markdown :content="text" />
    <span v-if="streaming" class="caret"></span>
  </div>
</template>

<style scoped>
.answer {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.65;
}
.answer :deep(p) {
  margin-bottom: 10px;
}
.answer :deep(p:last-child) {
  margin-bottom: 0;
}
.answer :deep(code) {
  font-family: var(--font-data);
  font-size: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 1px 5px;
  color: var(--accent-agent);
}
.answer :deep(blockquote) {
  border-left: 2px solid var(--accent-agent);
  padding-left: 12px;
  margin: 10px 0;
  color: var(--text-secondary);
}
.answer :deep(ul) {
  padding-left: 18px;
  margin-bottom: 10px;
}
.answer :deep(strong) {
  color: var(--text-primary);
  font-weight: 600;
}
.caret {
  display: inline-block;
  width: 7px;
  height: 14px;
  background: var(--accent-agent);
  vertical-align: text-bottom;
  margin-left: 2px;
  animation: caret-blink 1s step-end infinite;
  border-radius: 1px;
}
</style>
