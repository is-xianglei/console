<script setup lang="ts">
import type { AgentFormModel } from '@/interfaces/agent/model'

defineOptions({ name: 'AgentPromptPanel' })

defineProps<{ agent: AgentFormModel }>()
</script>

<template>
  <section :class="$style['ag-editor-section']" aria-label="提示词">
    <UForm :class="$style['ag-form']" :state="agent">
      <UFormField :class="$style['ag-field']" name="systemPrompt" required>
        <template #label><span>系统提示词 <em class="mono">{{ agent.systemPrompt.length }} CHAR</em></span></template>
        <UTextarea v-model="agent.systemPrompt" :class="$style['ag-prompt-editor']" :rows="14" autoresize :maxrows="24" placeholder="你是一名……&#10;&#10;职责：&#10;- ……&#10;&#10;约束：&#10;- ……" />
      </UFormField>
    </UForm>
  </section>
</template>

<style module src="./index.module.css"></style>
