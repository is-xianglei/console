<script setup lang="ts">
import type { AgentFormModel } from '@/interfaces/agent/model'

defineOptions({ name: 'AgentPromptPanel' })

defineProps<{ agent: AgentFormModel }>()
</script>

<template>
  <section :class="$style['ag-editor-section']" aria-labelledby="agent-prompt-title">
    <header :class="$style['ag-section-head']">
      <span :class="$style['ag-section-icon']"><i class="icon icon-message-square-text"></i></span>
      <div><span>02</span><h2 id="agent-prompt-title">提示词</h2><p>定义角色、工作方法、行为边界和输出契约。</p></div>
    </header>
    <UForm :class="$style['ag-form']" :state="agent">
      <UFormField :class="$style['ag-field']" name="systemPrompt" required help="系统提示词会随 Agent 配置保存，并用于绑定该 Agent 的新会话。">
        <template #label><span>系统提示词 <em class="mono">{{ agent.systemPrompt.length }} CHAR</em></span></template>
        <UTextarea v-model="agent.systemPrompt" :class="$style['ag-prompt-editor']" :rows="14" autoresize :maxrows="24" placeholder="你是一名……&#10;&#10;职责：&#10;- ……&#10;&#10;约束：&#10;- ……" />
      </UFormField>
    </UForm>
    <div :class="$style['ag-prompt-contract']">
      <i class="icon icon-shield-check"></i>
      <span><strong>工作区隔离生效</strong><small>Agent、Skill 与工具绑定均由当前登录令牌中的工作区确定。</small></span>
      <span :class="[$style['ag-lock'], 'mono']"><i class="icon icon-lock-keyhole"></i> WORKSPACE</span>
    </div>
  </section>
</template>

<style module src="./index.module.css"></style>
