<script setup lang="ts">
import type { AgentFormModel } from '@/interfaces/agent/model'

defineOptions({ name: 'AgentModelPanel' })

defineProps<{ agent: AgentFormModel }>()
</script>

<template>
  <section :class="$style['ag-editor-section']" aria-labelledby="agent-model-title">
    <header :class="$style['ag-section-head']">
      <span :class="$style['ag-section-icon']"><i class="icon icon-cpu"></i></span>
      <div><span>03</span><h2 id="agent-model-title">模型</h2><p>填写运行时可识别的模型名称；留空时使用平台默认模型。</p></div>
    </header>
    <UForm :class="[$style['ag-form-grid'], $style['ag-form']]" :state="agent">
      <UFormField :class="[$style['ag-field'], $style['ag-span-2']]" label="模型名称" name="modelName" help="名称需与后端模型注册表一致，最长 128 个字符。">
        <UInput v-model="agent.modelName" class="mono" maxlength="128" autocomplete="off" placeholder="留空使用平台默认模型" />
      </UFormField>
    </UForm>
    <div :class="$style['ag-effective-line']">
      <i class="icon icon-route"></i><span>有效路由</span><strong>{{ agent.modelName || '平台默认模型' }}</strong>
    </div>
  </section>
</template>

<style module src="./index.module.css"></style>
