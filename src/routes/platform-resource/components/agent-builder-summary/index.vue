<script setup lang="ts">
import { computed } from 'vue'
import { MCP_SERVER_OPTIONS, MODEL_OPTIONS, SKILL_OPTIONS } from '@/constants/agent'
import type { AgentConfig, AgentValidationIssue } from '@/interfaces/agent/model'

defineOptions({ name: 'AgentBuilderSummary' })

const props = defineProps<{ agent: AgentConfig; issues: AgentValidationIssue[] }>()
const primaryModel = computed(() => MODEL_OPTIONS.find((model) => model.id === props.agent.model.primaryModelId))
const selectedSkills = computed(() => props.agent.skills.map((binding) => SKILL_OPTIONS.find((skill) => skill.id === binding.skillId)).filter(Boolean))
const allowedTools = computed(() => props.agent.tools.filter((tool) => tool.permission === 'allow').length)
const approvalTools = computed(() => props.agent.tools.filter((tool) => tool.permission === 'ask').length)
const deniedTools = computed(() => props.agent.tools.filter((tool) => tool.permission === 'deny').length)
const connectedServers = computed(() => props.agent.mcpServers.map((binding) => MCP_SERVER_OPTIONS.find((server) => server.id === binding.serverId)).filter(Boolean))
</script>

<template>
  <aside :class="$style['ag-builder-summary']" aria-label="Agent 配置预览">
    <header><span>配置预览</span><span class="mono" :class="issues.length ? 'warning' : $style['ready']"><span class="dot" :class="issues.length ? 'warning' : 'nominal'"></span>{{ issues.length ? `${issues.length} ISSUES` : 'VALID' }}</span></header>
    <div :class="$style['ag-preview-agent']">
      <span :class="$style['ag-agent-glyph']"><i class="icon icon-bot"></i></span>
      <span><small class="mono">{{ agent.slug || 'new-agent' }}</small><strong>{{ agent.name || '未命名 Agent' }}</strong><em>{{ agent.draftVersion }}</em></span>
    </div>
    <div :class="$style['ag-preview-message']">
      <span :class="$style['ag-mini-avatar']"><i class="icon icon-bot"></i></span>
      <p>{{ agent.welcomeMessage || '配置欢迎语后将在这里预览。' }}</p>
    </div>
    <section :class="$style['ag-summary-section']">
      <h3>推理路由</h3>
      <div :class="$style['ag-summary-model']"><i class="icon icon-cpu"></i><span><strong>{{ primaryModel?.name ?? '未选择模型' }}</strong><small>{{ primaryModel ? `${primaryModel.provider} · ${agent.model.preset}` : '需要配置' }}</small></span><em class="mono">T {{ agent.model.temperature.toFixed(2) }}</em></div>
    </section>
    <section :class="$style['ag-summary-section']">
      <h3>绑定能力</h3>
      <div :class="$style['ag-summary-counts']">
        <div><strong>{{ selectedSkills.length }}</strong><span>Skills</span></div>
        <div><strong>{{ connectedServers.length }}</strong><span>MCP</span></div>
        <div><strong>{{ agent.tools.length }}</strong><span>Tools</span></div>
      </div>
      <div :class="$style['ag-summary-chips']"><span v-for="skill in selectedSkills" :key="skill!.id"><i class="icon icon-wrench"></i>{{ skill!.name }}</span><span v-for="server in connectedServers" :key="server!.id"><i class="icon icon-server-cog"></i>{{ server!.name }}</span></div>
    </section>
    <section :class="$style['ag-summary-section']">
      <h3>有效工具策略</h3>
      <dl :class="$style['ag-policy-counts']"><div><dt><span class="dot nominal"></span>允许</dt><dd>{{ allowedTools }}</dd></div><div><dt><span class="dot warning"></span>需审批</dt><dd>{{ approvalTools }}</dd></div><div><dt><span class="dot error"></span>禁止</dt><dd>{{ deniedTools }}</dd></div></dl>
    </section>
    <section :class="$style['ag-summary-section']">
      <h3>运行边界</h3>
      <dl :class="$style['ag-summary-list']"><div><dt>单次超时</dt><dd class="mono">{{ agent.timeoutSeconds }}s</dd></div><div><dt>最大步骤</dt><dd class="mono">{{ agent.maxSteps }}</dd></div><div><dt>工具调用</dt><dd class="mono">{{ agent.maxToolCalls }}</dd></div><div><dt>每日预算</dt><dd class="mono">{{ agent.dailyTokenBudget.toLocaleString() }}</dd></div></dl>
    </section>
  </aside>
</template>

<style module src="./index.module.css"></style>
