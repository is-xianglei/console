<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AgentFormModel, AgentValidationIssue } from '@/interfaces/agent/model'
import type { SkillResponse } from '@/interfaces/skill/model'
import type { ToolResponse } from '@/interfaces/tool/model'
import AgentBuilderSummary from '../agent-builder-summary/index.vue'
import AgentCapabilitiesPanel from '../agent-capabilities-panel/index.vue'
import AgentIdentityPanel from '../agent-identity-panel/index.vue'
import AgentModelPanel from '../agent-model-panel/index.vue'
import AgentPromptPanel from '../agent-prompt-panel/index.vue'
import { focusFirstError } from '@/hooks/useFormHelpers'

defineOptions({ name: 'AgentBuilder' })

const props = defineProps<{
  agent: AgentFormModel
  mode: 'create' | 'edit'
  issues: AgentValidationIssue[]
  skills: SkillResponse[]
  tools: ToolResponse[]
  saving: boolean
  error?: string
}>()
const emit = defineEmits<{ close: []; save: []; publish: [] }>()

type SectionId = 'identity' | 'prompt' | 'model' | 'capabilities'
const sections: Array<{ id: SectionId; label: string; icon: string }> = [
  { id: 'identity', label: '基本信息', icon: 'id-card' },
  { id: 'prompt', label: '提示词', icon: 'message-square-text' },
  { id: 'model', label: '模型', icon: 'cpu' },
  { id: 'capabilities', label: '能力', icon: 'blocks' },
]

const activeSection = ref<SectionId>('identity')
const publishAttempted = ref(false)
const builderRoot = ref<HTMLElement | null>(null)

const sectionIssueCount = computed(() => sections.reduce<Record<string, number>>((result, section) => {
  result[section.id] = props.issues.filter((issue) => issue.section === section.id).length
  return result
}, {}))

function isSectionComplete(section: SectionId) {
  if (section === 'identity') return Boolean(props.agent.name.trim())
  if (section === 'prompt') return Boolean(props.agent.systemPrompt.trim())
  if (section === 'model') return true
  return !sectionIssueCount.value.capabilities
}

function onCloseRequest() {
  emit('close')
}

function focusFirstIssueSection() {
  if (!props.issues.length) return
  activeSection.value = props.issues[0]!.section
  void nextTick().then(() => {
    if (builderRoot.value) focusFirstError(builderRoot.value)
  })
}

function onSave() {
  publishAttempted.value = true
  if (props.issues.length) {
    focusFirstIssueSection()
    return
  }
  emit('save')
}

function onPublish() {
  publishAttempted.value = true
  if (props.issues.length) {
    focusFirstIssueSection()
    return
  }
  emit('publish')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') onCloseRequest()
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void onSave()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <main ref="builderRoot" :class="$style['ag-builder']">
    <header :class="$style['ag-builder-head']">
      <UTooltip text="返回 Agents"><UButton :class="$style['ag-icon-button']" icon="i-lucide-arrow-left" color="neutral" variant="ghost" square aria-label="返回 Agents" @click="onCloseRequest" /></UTooltip>
      <div :class="$style['ag-builder-title']"><nav><span>Agents</span><i class="icon icon-chevron-right"></i><strong>{{ mode === 'create' ? '创建 Agent' : agent.name }}</strong></nav><h1>{{ mode === 'create' ? '创建 Agent' : '编辑 Agent' }}<span class="mono">API CONFIG</span></h1></div>
      <div :class="$style['ag-builder-actions']"><UButton :class="$style['ag-secondary-button']" icon="i-lucide-save" color="neutral" variant="outline" label="保存配置" :loading="saving" :disabled="saving" @click="onSave" /><UButton :class="$style['ag-primary-button']" icon="i-lucide-circle-check-big" label="保存并启用" :loading="saving" :disabled="saving" @click="onPublish" /></div>
    </header>
    <UAlert v-if="error" :class="$style['ag-validation-banner']" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
    <UAlert v-else-if="publishAttempted && issues.length" :class="$style['ag-validation-banner']" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="`还有 ${issues.length} 项配置需要处理。`" />
    <div :class="$style['ag-builder-body']">
      <nav :class="$style['ag-builder-nav']" aria-label="Agent 配置步骤">
        <div :class="$style['ag-nav-label']">配置</div>
        <UButton v-for="(section, index) in sections" :key="section.id" color="neutral" variant="ghost" :class="{ [$style.active]: activeSection === section.id }" @click="activeSection = section.id">
          <span :class="[$style['ag-nav-index'], 'mono']">{{ String(index + 1).padStart(2, '0') }}</span><i :class="`icon icon-${section.icon}`"></i><span>{{ section.label }}</span>
          <em v-if="sectionIssueCount[section.id]" :class="$style['ag-nav-issue']">{{ sectionIssueCount[section.id] }}</em><i v-else-if="isSectionComplete(section.id)" :class="['icon', 'icon-circle-check-big', $style['ag-nav-complete']]"></i>
        </UButton>
        <div :class="$style['ag-nav-scope']"><i class="icon icon-database"></i><span><strong>后端持久化</strong><small>仅提交当前接口支持字段</small></span></div>
      </nav>
      <div :class="$style['ag-editor-scroll']">
        <AgentIdentityPanel v-if="activeSection === 'identity'" :agent="agent" />
        <AgentPromptPanel v-else-if="activeSection === 'prompt'" :agent="agent" />
        <AgentModelPanel v-else-if="activeSection === 'model'" :agent="agent" />
        <AgentCapabilitiesPanel v-else :agent="agent" :skills="skills" :tools="tools" />
      </div>
      <AgentBuilderSummary :agent="agent" :issues="issues" :skills="skills" :tools="tools" />
    </div>
  </main>
</template>

<style module src="./index.module.css"></style>
