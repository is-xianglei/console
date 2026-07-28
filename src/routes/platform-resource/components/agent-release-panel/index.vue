<script setup lang="ts">
import type { AgentConfig, AgentValidationIssue } from '@/interfaces/agent/model'

defineOptions({ name: 'AgentReleasePanel' })

defineProps<{
  agent: AgentConfig
  issues: AgentValidationIssue[]
  testPrompt: string
  testRunning: boolean
  testResult: string
}>()
const emit = defineEmits<{ 'update:testPrompt': [value: string]; test: [] }>()
</script>

<template>
  <section :class="$style['ag-editor-section']" aria-labelledby="agent-release-title">
    <header :class="$style['ag-section-head']">
      <span :class="$style['ag-section-icon']"><i class="icon icon-flask-conical"></i></span>
      <div><span>06</span><h2 id="agent-release-title">测试与发布</h2><p>在沙箱中验证行为、依赖和权限，再生成不可变版本。</p></div>
    </header>
    <div :class="[$style['ag-readiness'], { [$style.ready]: !issues.length }]">
      <span :class="$style['ag-readiness-mark']"><i :class="`icon icon-${issues.length ? 'triangle-alert' : 'circle-check-big'}`"></i></span>
      <span><strong>{{ issues.length ? `还有 ${issues.length} 项需要处理` : '配置已通过静态校验' }}</strong><small>{{ issues.length ? '修复以下问题后才能发布。' : '可以运行沙箱测试并提交发布。' }}</small></span>
      <span class="mono">{{ issues.length ? 'BLOCKED' : 'READY' }}</span>
    </div>
    <ul v-if="issues.length" :class="$style['ag-issue-list']">
      <li v-for="issue in issues" :key="`${issue.section}-${issue.message}`"><i class="icon icon-circle-alert"></i><span>{{ issue.message }}</span><em>{{ issue.section }}</em></li>
    </ul>
    <div :class="$style['ag-test-console']">
      <header><span><i class="icon icon-terminal-square"></i>沙箱测试</span><span class="mono"><span class="dot nominal"></span> ISOLATED</span></header>
      <div :class="$style['ag-test-body']">
        <UForm :class="$style['ag-form']" :state="{ testPrompt }"><UFormField :class="$style['ag-field']" label="测试消息"><UTextarea :model-value="testPrompt" :rows="4" autoresize :maxrows="8" placeholder="输入一个真实任务，验证模型路由、工具授权和回答边界。" @update:model-value="emit('update:testPrompt', $event)" /></UFormField></UForm>
        <UButton :class="$style['ag-secondary-button']" :loading="testRunning" :disabled="!testPrompt.trim()" icon="i-lucide-play" :label="testRunning ? '正在运行' : '运行测试'" @click="emit('test')" />
      </div>
      <div v-if="testResult" :class="$style['ag-test-result']" role="status"><i class="icon icon-circle-check-big"></i><span><strong>沙箱运行完成</strong><small>{{ testResult }}</small></span></div>
    </div>
    <div :class="$style['ag-version-box']"><span><strong>待发布版本</strong><small>发布后配置不可修改，后续变更会创建新草稿。</small></span><UInput v-model="agent.draftVersion" class="mono" aria-label="待发布版本" /></div>
  </section>
</template>

<style module src="./index.module.css"></style>
