<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../../utils/markdown'

const props = defineProps<{
  text: string
  streaming: boolean
}>()

const html = computed(() => renderMarkdown(props.text))
</script>

<template>
  <div class="answer">
    <div class="md" v-html="html"></div>
    <span v-if="streaming" class="caret"></span>
  </div>
</template>

<style scoped>
.answer {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.65;
}
.md {
  display: inline;
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
