<script setup lang="ts">
import type { AgentFormModel } from '@/interfaces/agent/model'

defineOptions({ name: 'AgentModelPanel' })

defineProps<{ agent: AgentFormModel }>()
</script>

<template>
  <section :class="$style['ag-editor-section']" aria-label="模型">
    <UForm :class="[$style['ag-form-grid'], $style['ag-form']]" :state="agent">
      <UFormField :class="[$style['ag-field'], $style['ag-span-2']]" label="模型名称" name="modelName">
        <UInput v-model="agent.modelName" class="mono" maxlength="128" autocomplete="off" placeholder="留空使用平台默认模型" />
      </UFormField>
    </UForm>
    <div :class="$style['ag-effective-line']">
      <i class="icon icon-route"></i><span>有效路由</span><strong>{{ agent.modelName || '平台默认模型' }}</strong>
    </div>
  </section>
</template>

<style module src="./index.module.css"></style>
