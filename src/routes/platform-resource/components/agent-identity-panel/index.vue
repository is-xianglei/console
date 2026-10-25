<script setup lang="ts">
import type { AgentFormModel } from '@/interfaces/agent/model'

defineOptions({ name: 'AgentIdentityPanel' })

defineProps<{ agent: AgentFormModel }>()
</script>

<template>
  <section :class="$style['ag-editor-section']" aria-label="基本信息">
    <UForm :class="[$style['ag-form-grid'], $style['ag-form']]" :state="agent">
      <UFormField :class="$style['ag-field']" label="名称" name="name" required>
        <UInput v-model="agent.name" autocomplete="off" maxlength="128" placeholder="例如：设备诊断 Agent" />
      </UFormField>
      <UFormField :class="$style['ag-field']" label="运行状态" name="isEnabled" help="停用后不能用于新会话。">
        <USwitch v-model="agent.isEnabled" :label="agent.isEnabled ? '已启用' : '已停用'" />
      </UFormField>
      <UFormField :class="[$style['ag-field'], $style['ag-span-2']]" label="用途描述" name="description">
        <UTextarea v-model="agent.description" :rows="4" autoresize :maxrows="8" placeholder="说明 Agent 解决什么问题，以及不应处理哪些任务。" />
      </UFormField>
    </UForm>
  </section>
</template>

<style module src="./index.module.css"></style>
