<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AgentFormModel, AgentValidationIssue } from '@/interfaces/agent/model'
import type { SkillResponse } from '@/interfaces/skill/model'
import type { ToolResponse } from '@/interfaces/tool/model'
import BuilderSteps from '@/components/resource/builder-steps/index.vue'
import { groupIssuesByStep, useBuilderSteps, type BuilderStepDef } from '@/hooks/useBuilderSteps'
import AgentCapabilitiesPanel from '../agent-capabilities-panel/index.vue'
import AgentIdentityPanel from '../agent-identity-panel/index.vue'
import AgentModelPanel from '../agent-model-panel/index.vue'
import AgentPromptPanel from '../agent-prompt-panel/index.vue'

defineOptions({ name: 'AgentBuilder' })

const props = defineProps<{
  agent: AgentFormModel
  mode: 'create' | 'edit'
  issues: AgentValidationIssue[]
  skills: SkillResponse[]
  tools: ToolResponse[]
  saving: boolean
  error?: string
  /** 新建页草稿已从已有 Agent 预填（?duplicate= 复制成功）；编辑模式无需传。 */
  prefilled?: boolean
}>()
const emit = defineEmits<{ close: []; save: []; publish: [] }>()

type SectionId = AgentValidationIssue['section']
const sections: BuilderStepDef<SectionId>[] = [
  { id: 'identity', label: '基本信息' },
  { id: 'prompt', label: '提示词' },
  { id: 'model', label: '模型' },
  { id: 'capabilities', label: '能力' },
]

const publishAttempted = ref(false)
const builderRoot = ref<HTMLElement | null>(null)

/** validateAgent 的每条 issue 自带所属分区，直接作为步骤 id。 */
const sectionIssues = computed(() => groupIssuesByStep(props.issues, (issue) => issue.section))

function isSectionComplete(section: SectionId) {
  if (section === 'identity') return Boolean(props.agent.name.trim())
  if (section === 'prompt') return Boolean(props.agent.systemPrompt.trim())
  if (section === 'model') return true
  return !sectionIssues.value.capabilities?.length
}

const { active: activeSection, items: stepItems, focusFirstIssue } = useBuilderSteps({
  steps: sections,
  issues: sectionIssues,
  attempted: publishAttempted,
  fromExisting: () => props.mode === 'edit' || Boolean(props.prefilled),
  isComplete: isSectionComplete,
})

function onCloseRequest() {
  emit('close')
}

/** 点过保存 / 发布：有问题时跳到第一个有问题的步骤并聚焦错误字段，返回 false 阻止提交。 */
function attemptSubmit() {
  publishAttempted.value = true
  if (!props.issues.length) return true
  focusFirstIssue(builderRoot)
  return false
}

function onSave() {
  if (attemptSubmit()) emit('save')
}

function onPublish() {
  if (attemptSubmit()) emit('publish')
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
      <div :class="$style['ag-builder-title']"><nav><span>Agents</span><template v-if="mode === 'edit'"><i class="icon icon-chevron-right"></i><strong>{{ agent.name }}</strong></template></nav><h1>{{ mode === 'create' ? '创建 Agent' : '编辑 Agent' }}</h1></div>
      <div :class="$style['ag-builder-actions']"><UButton :class="$style['ag-secondary-button']" icon="i-lucide-save" color="neutral" variant="outline" label="保存配置" :loading="saving" :disabled="saving" @click="onSave" /><UButton :class="$style['ag-primary-button']" icon="i-lucide-circle-check-big" label="保存并启用" :loading="saving" :disabled="saving" @click="onPublish" /></div>
    </header>
    <UAlert v-if="error" :class="$style['ag-validation-banner']" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
    <UAlert v-else-if="publishAttempted && issues.length" :class="$style['ag-validation-banner']" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="`还有 ${issues.length} 项配置需要处理。`" />
    <BuilderSteps v-model="activeSection" :items="stepItems">
      <AgentIdentityPanel v-if="activeSection === 'identity'" :agent="agent" />
      <AgentPromptPanel v-else-if="activeSection === 'prompt'" :agent="agent" />
      <AgentModelPanel v-else-if="activeSection === 'model'" :agent="agent" />
      <AgentCapabilitiesPanel v-else :agent="agent" :skills="skills" :tools="tools" />
    </BuilderSteps>
  </main>
</template>

<style module src="./index.module.css"></style>
