<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AgentConfig, AgentValidationIssue } from '@/interfaces/agent/model'
import AgentBuilderSummary from '../agent-builder-summary/index.vue'
import AgentCapabilitiesPanel from '../agent-capabilities-panel/index.vue'
import AgentIdentityPanel from '../agent-identity-panel/index.vue'
import AgentModelPanel from '../agent-model-panel/index.vue'
import AgentPolicyPanel from '../agent-policy-panel/index.vue'
import AgentPromptPanel from '../agent-prompt-panel/index.vue'
import AgentReleasePanel from '../agent-release-panel/index.vue'

defineOptions({ name: 'AgentBuilder' })

const props = defineProps<{ agent: AgentConfig; mode: 'create' | 'edit'; issues: AgentValidationIssue[] }>()
const emit = defineEmits<{ close: []; save: []; publish: [] }>()

type SectionId = 'identity' | 'prompt' | 'model' | 'capabilities' | 'policy' | 'release'
const sections: Array<{ id: SectionId; label: string; icon: string }> = [
  { id: 'identity', label: '基本信息', icon: 'id-card' },
  { id: 'prompt', label: '提示词', icon: 'message-square-text' },
  { id: 'model', label: '模型', icon: 'cpu' },
  { id: 'capabilities', label: '能力', icon: 'blocks' },
  { id: 'policy', label: '权限与运行', icon: 'shield-check' },
  { id: 'release', label: '测试与发布', icon: 'flask-conical' },
]

const activeSection = ref<SectionId>('identity')
const publishAttempted = ref(false)
const closeConfirmOpen = ref(false)
const testPrompt = ref('检查 P-204 循环泵最近 24 小时的振动异常，并给出处置建议。')
const testRunning = ref(false)
const testResult = ref('')
let testTimer: ReturnType<typeof setTimeout> | undefined
let savedSnapshot = ''

const sectionIssueCount = computed(() => sections.reduce<Record<string, number>>((result, section) => {
  result[section.id] = props.issues.filter((issue) => issue.section === section.id).length
  return result
}, {}))

function isSectionComplete(section: SectionId) {
  if (section === 'identity') return Boolean(props.agent.name.trim() && props.agent.slug.trim())
  if (section === 'prompt') return props.agent.systemPrompt.trim().length >= 30
  if (section === 'model') return Boolean(props.agent.model.primaryModelId)
  if (section === 'capabilities' || section === 'policy') return !sectionIssueCount.value[section]
  return !props.issues.length && Boolean(testResult.value)
}

function handleCloseRequest() {
  if (JSON.stringify(props.agent) !== savedSnapshot) closeConfirmOpen.value = true
  else emit('close')
}

function onCloseRequest() {
  handleCloseRequest()
}

async function handleSave() {
  emit('save')
  await nextTick()
  savedSnapshot = JSON.stringify(props.agent)
}

function onSave() {
  void handleSave()
}

function onPublish() {
  publishAttempted.value = true
  if (props.issues.length) {
    activeSection.value = props.issues[0]!.section
    return
  }
  emit('publish')
}

function onRunTest() {
  if (testRunning.value || !testPrompt.value.trim()) return
  testRunning.value = true
  testResult.value = ''
  testTimer = setTimeout(() => {
    testRunning.value = false
    testResult.value = `模型路由正常 · ${props.agent.tools.length} 个工具策略已加载 · 未触发越权操作 · 预计成本 ¥0.18`
  }, 900)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !closeConfirmOpen.value) handleCloseRequest()
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void handleSave()
  }
}

onMounted(() => {
  savedSnapshot = JSON.stringify(props.agent)
  window.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (testTimer) clearTimeout(testTimer)
})
</script>

<template>
  <main :class="$style['ag-builder']">
    <header :class="$style['ag-builder-head']">
      <UTooltip text="返回 Agents"><UButton :class="$style['ag-icon-button']" icon="i-lucide-arrow-left" color="neutral" variant="ghost" square aria-label="返回 Agents" @click="onCloseRequest" /></UTooltip>
      <div :class="$style['ag-builder-title']"><nav><span>Agents</span><i class="icon icon-chevron-right"></i><strong>{{ mode === 'create' ? '创建 Agent' : agent.name }}</strong></nav><h1>{{ mode === 'create' ? '创建 Agent' : '编辑 Agent' }}<span class="mono">LOCAL DRAFT</span></h1></div>
      <div :class="$style['ag-builder-actions']"><UButton :class="$style['ag-secondary-button']" icon="i-lucide-save" color="neutral" variant="outline" label="保存草稿" @click="onSave" /><UButton :class="$style['ag-secondary-button']" icon="i-lucide-flask-conical" color="neutral" variant="outline" label="测试" @click="activeSection = 'release'" /><UButton :class="$style['ag-primary-button']" icon="i-lucide-rocket" label="发布版本" @click="onPublish" /></div>
    </header>
    <UAlert v-if="publishAttempted && issues.length" :class="$style['ag-validation-banner']" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="`发布被阻止：还有 ${issues.length} 项配置需要处理。`" />
    <div :class="$style['ag-builder-body']">
      <nav :class="$style['ag-builder-nav']" aria-label="Agent 配置步骤">
        <div :class="$style['ag-nav-label']">配置</div>
        <UButton v-for="(section, index) in sections" :key="section.id" color="neutral" variant="ghost" :class="{ [$style.active]: activeSection === section.id }" @click="activeSection = section.id">
          <span :class="[$style['ag-nav-index'], 'mono']">{{ String(index + 1).padStart(2, '0') }}</span><i :class="`icon icon-${section.icon}`"></i><span>{{ section.label }}</span>
          <em v-if="sectionIssueCount[section.id]" :class="$style['ag-nav-issue']">{{ sectionIssueCount[section.id] }}</em><i v-else-if="isSectionComplete(section.id)" :class="['icon', 'icon-circle-check-big', $style['ag-nav-complete']]"></i>
        </UButton>
        <div :class="$style['ag-nav-scope']"><i class="icon icon-lock-keyhole"></i><span><strong>工作区策略</strong><small>7 项强制规则生效</small></span></div>
      </nav>
      <div :class="$style['ag-editor-scroll']">
        <AgentIdentityPanel v-if="activeSection === 'identity'" :agent="agent" />
        <AgentPromptPanel v-else-if="activeSection === 'prompt'" :agent="agent" />
        <AgentModelPanel v-else-if="activeSection === 'model'" :agent="agent" />
        <AgentCapabilitiesPanel v-else-if="activeSection === 'capabilities'" :agent="agent" />
        <AgentPolicyPanel v-else-if="activeSection === 'policy'" :agent="agent" />
        <AgentReleasePanel v-else :agent="agent" :issues="issues" :test-prompt="testPrompt" :test-running="testRunning" :test-result="testResult" @update:test-prompt="testPrompt = $event" @test="onRunTest" />
      </div>
      <AgentBuilderSummary :agent="agent" :issues="issues" />
    </div>
    <UModal v-model:open="closeConfirmOpen" class="ag-confirm-modal" title="放弃未保存的修改？" description="当前配置还没有保存到本地草稿，离开后将丢失。">
      <template #body><p :class="$style['ag-modal-copy']">当前配置还没有保存到本地草稿，离开后将丢失。</p></template>
      <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="closeConfirmOpen = false" /><UButton label="放弃修改" color="error" @click="emit('close')" /></template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
