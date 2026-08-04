<script setup lang="ts">
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import type { AgentResponse } from '@/interfaces/agent/api'
import type { SkillResponse } from '@/interfaces/skill/model'
import type { ToolResponse } from '@/interfaces/tool/model'

defineOptions({ name: 'AgentInspector' })

const props = defineProps<{
  agent: AgentResponse | null
  skills: SkillResponse[]
  tools: ToolResponse[]
}>()
const emit = defineEmits<{ edit: [agent: AgentResponse]; duplicate: [agent: AgentResponse]; close: [] }>()
const skillNames = computed(() => props.skills.filter((skill) => props.agent?.skill_ids?.includes(skill.id)).map((skill) => skill.name))
const toolNames = computed(() => props.tools.filter((tool) => props.agent?.tool_ids?.includes(tool.id)).map((tool) => tool.name))
const isMobile = useMediaQuery('(max-width: 760px)')

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}
</script>

<template>
  <USlideover :open="Boolean(agent)" side="right" :modal="isMobile" :overlay="isMobile" class="ag-inspector-drawer" :ui="{ content: 'ag-inspector-content', header: 'ag-inspector-header', body: 'ag-inspector-body', footer: 'ag-inspector-footer' }" @update:open="onOpenChange">
    <template #header>
      <header v-if="agent" :class="$style['ag-inspector-head']"><span :class="$style['ag-agent-glyph']"><i class="icon icon-bot"></i></span><span><small class="mono">AGT-{{ String(agent.id).padStart(4, '0') }}</small><strong>{{ agent.name }}</strong><em class="mono">WORKSPACE {{ agent.workspace_id }}</em></span><UButton icon="i-lucide-x" color="neutral" variant="ghost" square aria-label="关闭 Agent 详情" @click="emit('close')" /></header>
    </template>
    <template #body>
      <div v-if="agent" :class="$style['ag-inspector-scroll']" aria-label="Agent 详情">
        <div :class="$style['ag-detail-state']"><UBadge color="neutral" variant="subtle" :class="[$style['ag-lifecycle'], agent.is_enabled ? 'published' : 'disabled']"><span class="dot" :class="agent.is_enabled ? 'nominal' : 'idle'"></span>{{ agent.is_enabled ? '已启用' : '已停用' }}</UBadge><span class="mono">{{ formatTime(agent.updated_at) }}</span></div>
        <p :class="$style['ag-detail-description']">{{ agent.description || '未填写用途描述' }}</p>
        <section :class="$style['ag-detail-section']"><h3>配置摘要</h3><dl><div><dt>模型</dt><dd>{{ agent.model_name || '平台默认模型' }}</dd></div><div><dt>Skills</dt><dd>{{ agent.skill_ids?.length ?? 0 }}</dd></div><div><dt>Tools</dt><dd>{{ agent.tool_ids?.length ?? 0 }}</dd></div><div><dt>创建者 ID</dt><dd class="mono">{{ agent.created_by_user_id }}</dd></div></dl></section>
        <section :class="$style['ag-detail-section']"><h3>绑定能力</h3><div :class="$style['ag-detail-bindings']"><span v-for="skill in skillNames" :key="skill"><i class="icon icon-wrench"></i>{{ skill }}</span><span v-for="tool in toolNames" :key="tool"><i class="icon icon-hammer"></i>{{ tool }}</span><em v-if="!skillNames.length && !toolNames.length">尚未绑定能力</em></div></section>
        <section :class="$style['ag-detail-section']"><h3>系统提示词</h3><p :class="$style['ag-prompt-preview']">{{ agent.system_prompt }}</p></section>
        <section :class="$style['ag-detail-section']"><h3>服务端信息</h3><dl><div><dt>Agent ID</dt><dd class="mono">{{ agent.id }}</dd></div><div><dt>工作区 ID</dt><dd class="mono">{{ agent.workspace_id }}</dd></div><div><dt>创建时间</dt><dd>{{ formatTime(agent.created_at) }}</dd></div><div><dt>更新时间</dt><dd>{{ formatTime(agent.updated_at) }}</dd></div></dl></section>
      </div>
    </template>
    <template #footer>
      <footer v-if="agent" :class="$style['ag-inspector-actions']"><UButton :class="$style['ag-secondary-button']" icon="i-lucide-copy" color="neutral" variant="outline" label="复制" @click="emit('duplicate', agent)" /><UButton :class="$style['ag-primary-button']" icon="i-lucide-sliders-horizontal" label="配置 Agent" @click="emit('edit', agent)" /></footer>
    </template>
  </USlideover>
</template>

<style module src="./index.module.css"></style>
