<script setup lang="ts">
import type { AgentConfig } from '@/interfaces/agent/model'

defineOptions({ name: 'AgentPromptPanel' })

defineProps<{ agent: AgentConfig }>()
</script>

<template>
  <section :class="$style['ag-editor-section']" aria-labelledby="agent-prompt-title">
    <header :class="$style['ag-section-head']">
      <span :class="$style['ag-section-icon']"><i class="icon icon-message-square-text"></i></span>
      <div><span>02</span><h2 id="agent-prompt-title">提示词</h2><p>定义角色、工作方法、行为边界和输出契约。</p></div>
    </header>
    <UForm :class="$style['ag-form']" :state="agent">
      <UFormField :class="$style['ag-field']" name="systemPrompt" required help="发布版本会保存完整提示词快照；建议明确职责、证据要求、拒答条件和高风险操作边界。">
        <template #label><span>系统提示词 <em class="mono">{{ agent.systemPrompt.length }} CHAR</em></span></template>
        <UTextarea v-model="agent.systemPrompt" :class="$style['ag-prompt-editor']" :rows="12" autoresize :maxrows="20" placeholder="你是一名……&#10;&#10;职责：&#10;- ……&#10;&#10;约束：&#10;- ……" />
      </UFormField>
    </UForm>
    <div :class="$style['ag-prompt-contract']">
      <i class="icon icon-shield-check"></i>
      <span><strong>平台指令已锁定</strong><small>数据隔离、敏感信息处理和审计要求由工作区策略注入，普通创建者不可覆盖。</small></span>
      <span :class="[$style['ag-lock'], 'mono']"><i class="icon icon-lock-keyhole"></i> INHERITED</span>
    </div>
    <UForm :class="$style['ag-form']" :state="agent"><UFormField :class="$style['ag-field']" label="欢迎语" name="welcomeMessage"><UTextarea v-model="agent.welcomeMessage" :rows="3" autoresize :maxrows="6" placeholder="用户进入 Agent 时看到的第一条消息。" /></UFormField></UForm>
  </section>
</template>

<style module src="./index.module.css"></style>
