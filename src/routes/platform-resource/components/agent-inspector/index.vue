<script setup lang="ts">
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { MCP_SERVER_OPTIONS, MODEL_OPTIONS, SKILL_OPTIONS } from '@/constants/agent'
import type { AgentConfig } from '@/interfaces/agent/model'

defineOptions({ name: 'AgentInspector' })

const props = defineProps<{ agent: AgentConfig | null }>()
const emit = defineEmits<{ edit: [agent: AgentConfig]; duplicate: [agent: AgentConfig]; close: [] }>()
const model = computed(() => MODEL_OPTIONS.find((item) => item.id === props.agent?.model.primaryModelId))
const skillNames = computed(() => props.agent?.skills.map((binding) => SKILL_OPTIONS.find((skill) => skill.id === binding.skillId)?.name).filter(Boolean) ?? [])
const serverNames = computed(() => props.agent?.mcpServers.map((binding) => MCP_SERVER_OPTIONS.find((server) => server.id === binding.serverId)?.name).filter(Boolean) ?? [])
const lifecycleLabel = { draft: '草稿', review: '审核中', published: '已发布', disabled: '已停用' }
const isMobile = useMediaQuery('(max-width: 760px)')

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}
</script>

<template>
  <USlideover
    :open="Boolean(agent)"
    side="right"
    :modal="isMobile"
    :overlay="isMobile"
    class="ag-inspector-drawer"
    :ui="{ content: 'ag-inspector-content', header: 'ag-inspector-header', body: 'ag-inspector-body', footer: 'ag-inspector-footer' }"
    @update:open="onOpenChange"
  >
    <template #header>
      <header v-if="agent" :class="$style['ag-inspector-head']"><span :class="$style['ag-agent-glyph']"><i class="icon icon-bot"></i></span><span><small class="mono">{{ agent.id }}</small><strong>{{ agent.name }}</strong><em class="mono">{{ agent.slug }}</em></span><UButton icon="i-lucide-x" color="neutral" variant="ghost" square aria-label="关闭 Agent 详情" @click="emit('close')" /></header>
    </template>
    <template #body>
      <div v-if="agent" :class="$style['ag-inspector-scroll']" aria-label="Agent 详情">
        <div :class="$style['ag-detail-state']"><UBadge color="neutral" variant="subtle" :class="[$style['ag-lifecycle'], agent.lifecycle]" ><span class="dot" :class="agent.lifecycle === 'published' ? agent.health : 'idle'"></span>{{ lifecycleLabel[agent.lifecycle] }}</UBadge><span class="mono">{{ agent.publishedVersion ? `v${agent.publishedVersion}` : agent.draftVersion }}</span></div>
        <p :class="$style['ag-detail-description']">{{ agent.description }}</p>
        <section :class="$style['ag-detail-section']"><h3>配置摘要</h3><dl><div><dt>主模型</dt><dd>{{ model?.name ?? '未配置' }}</dd></div><div><dt>Skills</dt><dd>{{ agent.skills.length }}</dd></div><div><dt>MCP Servers</dt><dd>{{ agent.mcpServers.length }}</dd></div><div><dt>工具策略</dt><dd>{{ agent.tools.length }}</dd></div><div><dt>负责人</dt><dd>{{ agent.owner }}</dd></div></dl></section>
        <section :class="$style['ag-detail-section']"><h3>绑定能力</h3><div :class="$style['ag-detail-bindings']"><span v-for="skill in skillNames" :key="skill"><i class="icon icon-wrench"></i>{{ skill }}</span><span v-for="server in serverNames" :key="server"><i class="icon icon-server-cog"></i>{{ server }}</span><em v-if="!skillNames.length && !serverNames.length">尚未绑定能力</em></div></section>
        <section :class="$style['ag-detail-section']"><h3>系统提示词</h3><p :class="$style['ag-prompt-preview']">{{ agent.systemPrompt }}</p></section>
        <section :class="$style['ag-detail-section']"><h3>运行指标</h3><div :class="$style['ag-runtime-metrics']"><div><strong>{{ agent.successRate == null ? '—' : `${agent.successRate}%` }}</strong><span>成功率</span></div><div><strong>{{ agent.lastRun }}</strong><span>最近运行</span></div></div></section>
      </div>
    </template>
    <template #footer>
      <footer v-if="agent" :class="$style['ag-inspector-actions']"><UButton :class="$style['ag-secondary-button']" icon="i-lucide-copy" color="neutral" variant="outline" label="复制" @click="emit('duplicate', agent)" /><UButton :class="$style['ag-primary-button']" icon="i-lucide-sliders-horizontal" label="配置 Agent" @click="emit('edit', agent)" /></footer>
    </template>
  </USlideover>
</template>

<style module src="./index.module.css"></style>
