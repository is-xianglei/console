<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AgentFormModel } from '@/interfaces/agent/model'
import type { SkillResponse } from '@/interfaces/skill/model'
import type { ToolResponse } from '@/interfaces/tool/model'

defineOptions({ name: 'AgentCapabilitiesPanel' })

const props = defineProps<{
  agent: AgentFormModel
  skills: SkillResponse[]
  tools: ToolResponse[]
  loading?: boolean
}>()
const activeTab = ref<'skills' | 'tools'>('skills')
const capabilityTabs = computed(() => [
  { value: 'skills', label: 'Skills', icon: 'i-lucide-wrench', badge: props.agent.skillIds.length },
  { value: 'tools', label: '工具', icon: 'i-lucide-hammer', badge: props.agent.toolIds.length },
])

function checked(value: boolean | 'indeterminate') {
  return value === true
}

function hasSkill(skillId: number) {
  return props.agent.skillIds.includes(skillId)
}

function onSkillToggle(skillId: number, value: boolean | 'indeterminate') {
  if (checked(value) && !hasSkill(skillId)) props.agent.skillIds.push(skillId)
  if (!checked(value)) props.agent.skillIds = props.agent.skillIds.filter((id) => id !== skillId)
}

function hasTool(toolId: number) {
  return props.agent.toolIds.includes(toolId)
}

function onToolToggle(tool: ToolResponse, value: boolean | 'indeterminate') {
  if (checked(value) && !hasTool(tool.id)) props.agent.toolIds.push(tool.id)
  if (!checked(value)) props.agent.toolIds = props.agent.toolIds.filter((id) => id !== tool.id)
}
</script>

<template>
  <section :class="$style['ag-editor-section']" aria-label="能力">
    <UTabs v-model="activeTab" :class="$style['ag-capability-tabs']" :items="capabilityTabs" :content="false" variant="link" aria-label="能力配置类型" />

    <div v-if="loading" :class="$style['ag-capability-pane']">
      <div :class="$style['ag-pane-loading']" role="status"><UIcon name="i-lucide-loader-circle" class="spinning" /><span>正在加载能力目录</span></div>
    </div>

    <div v-else-if="activeTab === 'skills'" :class="$style['ag-capability-pane']">
      <label v-for="skill in skills" :key="skill.id" :class="[$style['ag-select-row'], { [$style.selected]: hasSkill(skill.id) }]">
        <UCheckbox :model-value="hasSkill(skill.id)" @update:model-value="onSkillToggle(skill.id, $event)" />
        <span :class="$style['ag-select-icon']"><i class="icon icon-wrench"></i></span>
        <!-- 已停用的 skill 仍可绑定，启用后生效。 -->
        <span :class="$style['ag-select-main']"><strong class="mono">{{ skill.name }}<UBadge v-if="!skill.is_enabled" :class="$style['ag-disabled-badge']" color="neutral" variant="subtle" size="xs">已停用</UBadge></strong><small>{{ skill.description }}</small></span>
        <span :class="$style['ag-select-meta']"><strong class="mono">{{ skill.version ? `v${skill.version}` : '未设版本' }}</strong><small>ID {{ skill.id }}</small></span>
        <span :class="$style['ag-verify']"><i class="icon icon-building-2"></i>{{ skill.scope }}</span>
      </label>
      <UEmpty v-if="!skills.length" icon="i-lucide-package-open" title="当前工作区暂无 Skill" description="请先在技能包管理页上传 Skill。" variant="naked" />
    </div>

    <div v-else :class="$style['ag-capability-pane']">
      <div v-if="tools.length" :class="$style['ag-tool-table']">
        <div :class="$style['ag-tool-head']"><span>工具</span><span>类型</span><span>来源</span><span>状态</span></div>
        <div v-for="tool in tools" :key="tool.id" :class="$style['ag-tool-row']">
          <label>
            <UCheckbox :model-value="hasTool(tool.id)" :disabled="!tool.is_enabled && !hasTool(tool.id)" @update:model-value="onToolToggle(tool, $event)" />
            <span><strong>{{ tool.name }}</strong><small class="mono">{{ tool.tool_key }}</small></span>
          </label>
          <span class="mono">{{ tool.tool_type }}</span>
          <span class="mono">{{ tool.is_system ? 'SYSTEM' : 'CUSTOM' }}</span>
          <UBadge :color="tool.is_enabled ? 'success' : 'neutral'" variant="subtle" size="xs">{{ tool.is_enabled ? '已启用' : '已停用' }}</UBadge>
        </div>
      </div>
      <UEmpty v-else icon="i-lucide-hammer" title="暂无可用工具" description="工具目录尚未同步任何记录。" variant="naked" />
    </div>
  </section>
</template>

<style module src="./index.module.css"></style>
