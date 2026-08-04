<script setup lang="ts">
import { computed } from 'vue'
import type { AgentFormModel, AgentValidationIssue } from '@/interfaces/agent/model'
import type { SkillResponse } from '@/interfaces/skill/model'
import type { ToolResponse } from '@/interfaces/tool/model'

defineOptions({ name: 'AgentBuilderSummary' })

const props = defineProps<{
  agent: AgentFormModel
  issues: AgentValidationIssue[]
  skills: SkillResponse[]
  tools: ToolResponse[]
}>()
const selectedSkills = computed(() => props.skills.filter((skill) => props.agent.skillIds.includes(skill.id)))
const selectedTools = computed(() => props.tools.filter((tool) => props.agent.toolIds.includes(tool.id)))

function formatTime(value: string) {
  if (!value) return '尚未保存'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}
</script>

<template>
  <aside :class="$style['ag-builder-summary']" aria-label="Agent 配置预览">
    <header><span>配置预览</span><span class="mono" :class="issues.length ? 'warning' : $style.ready"><span class="dot" :class="issues.length ? 'warning' : 'nominal'"></span>{{ issues.length ? `${issues.length} ISSUES` : 'VALID' }}</span></header>
    <div :class="$style['ag-preview-agent']">
      <span :class="$style['ag-agent-glyph']"><i class="icon icon-bot"></i></span>
      <span><small class="mono">{{ agent.id ? `AGT-${String(agent.id).padStart(4, '0')}` : 'NEW AGENT' }}</small><strong>{{ agent.name || '未命名 Agent' }}</strong><em>{{ agent.isEnabled ? 'ENABLED' : 'DISABLED' }}</em></span>
    </div>
    <div :class="$style['ag-preview-message']">
      <span :class="$style['ag-mini-avatar']"><i class="icon icon-bot"></i></span>
      <p>{{ agent.description || '填写用途描述后将在这里预览。' }}</p>
    </div>
    <section :class="$style['ag-summary-section']">
      <h3>推理模型</h3>
      <div :class="$style['ag-summary-model']"><i class="icon icon-cpu"></i><span><strong>{{ agent.modelName || '平台默认模型' }}</strong><small>{{ agent.modelName ? '显式指定' : '继承平台配置' }}</small></span></div>
    </section>
    <section :class="$style['ag-summary-section']">
      <h3>绑定能力</h3>
      <div :class="$style['ag-summary-counts']">
        <div><strong>{{ selectedSkills.length }}</strong><span>Skills</span></div>
        <div><strong>{{ selectedTools.length }}</strong><span>Tools</span></div>
        <div><strong>{{ selectedTools.filter((tool) => !tool.is_enabled).length }}</strong><span>Disabled</span></div>
      </div>
      <div :class="$style['ag-summary-chips']"><span v-for="skill in selectedSkills" :key="skill.id"><i class="icon icon-wrench"></i>{{ skill.name }}</span><span v-for="tool in selectedTools.slice(0, 4)" :key="tool.id"><i class="icon icon-hammer"></i>{{ tool.name }}</span></div>
    </section>
    <section :class="$style['ag-summary-section']">
      <h3>服务端记录</h3>
      <dl :class="$style['ag-summary-list']"><div><dt>工作区</dt><dd class="mono">{{ agent.workspaceId ?? '保存后分配' }}</dd></div><div><dt>创建者</dt><dd class="mono">{{ agent.createdByUserId ?? '当前用户' }}</dd></div><div><dt>更新时间</dt><dd>{{ formatTime(agent.updatedAt) }}</dd></div></dl>
    </section>
  </aside>
</template>

<style module src="./index.module.css"></style>
