<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { defineShortcuts } from '@nuxt/ui/composables'
import { WORKFLOW_MODE_OPTIONS, minWorkflowMembers } from '@/constants/workflow'
import type { AgentResponse } from '@/interfaces/agent/api'
import type {
  WorkflowBuilderStep,
  WorkflowFormModel,
  WorkflowValidationIssue,
} from '@/interfaces/workflow/model'
import type { WorkflowMode } from '@/interfaces/workflow/api'
import BuilderSteps from '@/components/resource/builder-steps/index.vue'
import { groupIssuesByStep, useBuilderSteps, type BuilderStepDef } from '@/hooks/useBuilderSteps'
import WorkflowModePreview from './components/mode-preview/index.vue'

defineOptions({ name: 'WorkflowBuilder' })

const props = defineProps<{
  workflow: WorkflowFormModel
  mode: 'create' | 'edit'
  issues: WorkflowValidationIssue[]
  agents: AgentResponse[]
  saving: boolean
  error?: string | null
  /** 新建页草稿已从已有 Workflow 预填（?duplicate= 复制成功）；编辑模式无需传。 */
  prefilled?: boolean
}>()
const emit = defineEmits<{ close: []; save: [] }>()

/** 步骤标题固定，不随编排模式变化。 */
const steps: BuilderStepDef<WorkflowBuilderStep>[] = [
  { id: 'basic', label: '基本信息' },
  { id: 'mode', label: '编排模式' },
  { id: 'members', label: '选择成员' },
  { id: 'config', label: '成员配置' },
]

const saveAttempted = ref(false)
const builderRoot = ref<HTMLElement | null>(null)
const agentSearch = ref('')

/** validateWorkflow 的每条 issue 自带所属步骤（step），直接分组。 */
const stepIssues = computed(() => groupIssuesByStep(props.issues, (issue) => issue.step))

/** 把基本信息的校验问题映射到名称字段（B-8）；其余步骤没有对应的表单字段。 */
const formErrors = computed(() =>
  props.issues
    .filter((issue) => issue.step === 'basic')
    .map((issue) => ({ name: 'name', message: issue.message })),
)

function isStepComplete(step: WorkflowBuilderStep) {
  if (step === 'basic') return Boolean(props.workflow.name.trim()) && !stepIssues.value.basic?.length
  if (step === 'mode') return true
  if (step === 'members') return !stepIssues.value.members?.length
  return props.workflow.members.length > 0 && !stepIssues.value.config?.length
}

const { active: activeStep, items: stepItems, focusFirstIssue } = useBuilderSteps({
  steps,
  issues: stepIssues,
  attempted: saveAttempted,
  fromExisting: () => props.mode === 'edit' || Boolean(props.prefilled),
  isComplete: isStepComplete,
})
// 拖拽排序状态：仅当从把手按下后行才可拖动，避免输入框内选中文本触发拖拽。
const dragArmedIndex = ref<number | null>(null)
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

const filteredAgents = computed(() => {
  const query = agentSearch.value.trim().toLowerCase()
  if (!query) return props.agents
  return props.agents.filter((agent) =>
    [agent.name, agent.description ?? ''].join(' ').toLowerCase().includes(query),
  )
})
/** 顺序模式展示执行顺序（序号 + 排序）；并行与智能路由只看成员集合。 */
const orderSensitive = computed(() => props.workflow.mode === 'sequential')
const minimumMembers = computed(() => minWorkflowMembers(props.workflow.mode))

// ===== 编排模式：每行下方的运行图预览 =====
/** 预览图用的成员名，顺序即表单里的排列顺序；为空时预览用占位成员。 */
const memberNames = computed(() => props.workflow.members.map((member) => member.agentName))
/** 选中行持续播放；鼠标悬停、键盘聚焦到的行也播放。 */
const hoveredMode = ref<WorkflowMode | null>(null)
const focusedMode = ref<WorkflowMode | null>(null)

/** 只认键盘聚焦（:focus-visible）：鼠标点中的那行本来就是选中行。 */
function onModeFocusIn(mode: WorkflowMode, event: FocusEvent) {
  const target = event.target as HTMLElement | null
  focusedMode.value = target?.matches(':focus-visible') ? mode : null
}

function onModeFocusOut(mode: WorkflowMode) {
  if (focusedMode.value === mode) focusedMode.value = null
}

/** 方向键在模式间移动并选中，与原生单选组一致；首尾循环。 */
function onModeKeydown(event: KeyboardEvent) {
  const steps: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }
  const step = steps[event.key]
  if (!step) return
  event.preventDefault()
  const index = WORKFLOW_MODE_OPTIONS.findIndex((option) => option.value === props.workflow.mode)
  const next = WORKFLOW_MODE_OPTIONS[(index + step + WORKFLOW_MODE_OPTIONS.length) % WORKFLOW_MODE_OPTIONS.length]!
  props.workflow.mode = next.value
  const group = event.currentTarget as HTMLElement
  group.querySelector<HTMLElement>(`[data-mode="${next.value}"]`)?.focus()
}

function memberIndex(agentId: number) {
  return props.workflow.members.findIndex((member) => member.agentId === agentId)
}

function isMember(agentId: number) {
  return memberIndex(agentId) >= 0
}

/** 勾选/取消成员；同一 Agent 不可重复，仅已启用 Agent 可加入。 */
function toggleMember(agent: AgentResponse, value: boolean | 'indeterminate') {
  if (value === true) {
    if (isMember(agent.id) || !agent.is_enabled) return
    props.workflow.members.push({
      agentId: agent.id,
      agentName: agent.name,
      isAvailable: agent.is_enabled,
    })
    return
  }
  const index = memberIndex(agent.id)
  if (index >= 0) props.workflow.members.splice(index, 1)
}

function removeMember(index: number) {
  props.workflow.members.splice(index, 1)
}

function moveMember(from: number, to: number) {
  if (to < 0 || to >= props.workflow.members.length || from === to) return
  const [moved] = props.workflow.members.splice(from, 1)
  props.workflow.members.splice(to, 0, moved!)
}

function onDragStart(event: DragEvent, index: number) {
  if (dragArmedIndex.value !== index) {
    event.preventDefault()
    return
  }
  dragIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(event: DragEvent, index: number) {
  if (dragIndex.value == null) return
  event.preventDefault()
  dragOverIndex.value = index
}

function onDrop(index: number) {
  if (dragIndex.value != null) moveMember(dragIndex.value, index)
  onDragEnd()
}

function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
  dragArmedIndex.value = null
}

function onCloseRequest() {
  emit('close')
}

/** 点过保存：有问题时跳到第一个有问题的步骤并聚焦错误字段，不提交。 */
function onSave() {
  saveAttempted.value = true
  if (props.issues.length) {
    focusFirstIssue(builderRoot)
    return
  }
  emit('save')
}

defineShortcuts({
  escape: { usingInput: true, handler: () => onCloseRequest() },
  meta_s: { usingInput: true, handler: () => { void onSave() } },
})

/** 按下把手但未启动拖拽时清理武装状态，避免后续文本拖动误触发行排序。 */
function handlePointerUp() {
  dragArmedIndex.value = null
}

onMounted(() => window.addEventListener('pointerup', handlePointerUp))
onBeforeUnmount(() => window.removeEventListener('pointerup', handlePointerUp))
</script>

<template>
  <main ref="builderRoot" :class="$style['wf-builder']">
    <header :class="$style['wf-builder-head']">
      <UTooltip text="返回 Workflows"><UButton :class="$style['wf-icon-button']" icon="i-lucide-arrow-left" color="neutral" variant="ghost" square aria-label="返回 Workflows" @click="onCloseRequest" /></UTooltip>
      <div :class="$style['wf-builder-title']"><UBreadcrumb :items="mode === 'edit' ? [{ label: 'Workflows' }, { label: workflow.name }] : [{ label: 'Workflows' }]" /><h1>{{ mode === 'create' ? '创建 Workflow' : '编辑 Workflow' }}</h1></div>
      <div :class="$style['wf-builder-actions']"><UButton :class="$style['wf-primary-button']" icon="i-lucide-save" label="保存" :loading="saving" :disabled="saving" @click="onSave" /></div>
    </header>
    <UAlert v-if="error" :class="$style['wf-validation-banner']" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
    <UAlert v-else-if="saveAttempted && issues.length" :class="$style['wf-validation-banner']" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="`还有 ${issues.length} 项配置需要处理。`" />

    <BuilderSteps v-model="activeStep" :items="stepItems">
      <section v-if="activeStep === 'basic'" :class="$style['wf-step']" aria-label="基本信息">
        <UForm :class="$style['wf-form-grid']" :state="workflow" :validate="() => formErrors">
          <UFormField :class="$style['wf-field']" label="名称" name="name" required>
            <UInput v-model="workflow.name" autocomplete="off" maxlength="128" placeholder="例如：故障诊断三段式 Workflow" />
          </UFormField>
          <UFormField :class="$style['wf-field']" label="运行状态" name="isEnabled" help="停用后会话无法绑定该 Workflow。">
            <USwitch v-model="workflow.isEnabled" :label="workflow.isEnabled ? '已启用' : '已停用'" />
          </UFormField>
          <UFormField :class="[$style['wf-field'], $style['wf-span-2']]" label="用途描述" name="description">
            <UTextarea v-model="workflow.description" :rows="3" autoresize :maxrows="6" placeholder="说明 Workflow 解决什么场景，帮助会话选择合适的编排。" />
          </UFormField>
        </UForm>
      </section>

      <section v-else-if="activeStep === 'mode'" :class="$style['wf-step']" aria-label="编排模式">
        <div :class="$style['wf-mode-list']" role="radiogroup" aria-label="编排模式" @keydown="onModeKeydown">
          <div
            v-for="option in WORKFLOW_MODE_OPTIONS"
            :key="option.value"
            :class="[$style['wf-mode-card'], { [$style.selected]: workflow.mode === option.value }]"
            @click="workflow.mode = option.value"
            @mouseenter="hoveredMode = option.value"
            @mouseleave="hoveredMode = null"
            @focusin="onModeFocusIn(option.value, $event)"
            @focusout="onModeFocusOut(option.value)"
          >
            <button
              type="button"
              role="radio"
              :data-mode="option.value"
              :aria-checked="workflow.mode === option.value"
              :class="$style['wf-mode-option']"
            >
              <span :class="$style['wf-mode-icon']"><i :class="`icon icon-${option.icon}`"></i></span>
              <span :class="$style['wf-mode-main']"><strong>{{ option.label }}</strong></span>
              <small :class="$style['wf-mode-hint']">{{ option.hint }}</small>
            </button>
            <WorkflowModePreview
              :mode="option.value"
              :member-names="memberNames"
              :playing="workflow.mode === option.value || hoveredMode === option.value || focusedMode === option.value"
            />
          </div>
        </div>
      </section>

      <section v-else-if="activeStep === 'members'" :class="$style['wf-step']" aria-label="选择成员">
        <div :class="$style['wf-member-toolbar']">
          <UInput v-model="agentSearch" :class="$style['wf-agent-search']" icon="i-lucide-search" placeholder="搜索 Agent 名称或描述" aria-label="搜索 Agent" />
          <span :class="[$style['wf-member-count'], 'mono', { [$style.invalid]: workflow.members.length < minimumMembers }]">已选 {{ workflow.members.length }} 个</span>
        </div>
        <div :class="$style['wf-agent-list']">
          <label
            v-for="agent in filteredAgents"
            :key="agent.id"
            :class="[$style['wf-agent-row'], { [$style.selected]: isMember(agent.id), [$style.disabled]: !agent.is_enabled && !isMember(agent.id) }]"
          >
            <UCheckbox
              :model-value="isMember(agent.id)"
              :disabled="!isMember(agent.id) && !agent.is_enabled"
              :aria-label="`选择 ${agent.name}`"
              @update:model-value="toggleMember(agent, $event)"
            />
            <span :class="$style['wf-agent-glyph']"><i class="icon icon-bot"></i></span>
            <span :class="$style['wf-agent-main']"><strong>{{ agent.name }}</strong><small>{{ agent.description || '未填写用途描述' }}</small></span>
            <small :class="[$style['wf-agent-status'], { [$style.offline]: !agent.is_enabled }]">{{ agent.is_enabled ? '已启用' : '已停用' }}</small>
          </label>
          <UEmpty v-if="!filteredAgents.length" icon="i-lucide-search-x" title="没有匹配的 Agent" description="调整关键词，或先在 Agents 页创建并启用 Agent。" variant="naked" />
        </div>
      </section>

      <section v-else :class="$style['wf-step']" aria-label="成员配置">
        <UEmpty v-if="!workflow.members.length" icon="i-lucide-users-round" title="尚未选择成员" :description="`先在「选择成员」中勾选至少 ${minimumMembers} 个 Agent。`" variant="naked" />
        <ul v-else :class="$style['wf-member-list']">
          <li
            v-for="(member, index) in workflow.members"
            :key="member.agentId"
            :class="[$style['wf-member-row'], { [$style.dragging]: dragIndex === index, [$style['drag-over']]: dragOverIndex === index && dragIndex !== index, [$style.unavailable]: !member.isAvailable }]"
            :draggable="orderSensitive"
            @dragstart="onDragStart($event, index)"
            @dragover="onDragOver($event, index)"
            @drop.prevent="onDrop(index)"
            @dragend="onDragEnd"
          >
            <span
              v-if="orderSensitive"
              :class="$style['wf-drag-handle']"
              aria-label="拖动调整顺序"
              @pointerdown="dragArmedIndex = index"
            ><i class="icon icon-grip-vertical"></i></span>
            <span v-if="orderSensitive" :class="[$style['wf-member-index'], 'mono']">{{ String(index + 1).padStart(2, '0') }}</span>
            <span :class="$style['wf-member-main']"><strong>{{ member.agentName }}</strong></span>
            <span v-if="!member.isAvailable" :class="$style['wf-member-warning']"><i class="icon icon-triangle-alert"></i>该 Agent 已停用或已删除，Workflow 将无法运行</span>
            <span :class="$style['wf-member-actions']">
              <template v-if="orderSensitive">
                <UTooltip text="上移"><UButton :class="$style['wf-icon-button']" icon="i-lucide-arrow-up" color="neutral" variant="ghost" square :disabled="index === 0" :aria-label="`上移 ${member.agentName}`" @click="moveMember(index, index - 1)" /></UTooltip>
                <UTooltip text="下移"><UButton :class="$style['wf-icon-button']" icon="i-lucide-arrow-down" color="neutral" variant="ghost" square :disabled="index === workflow.members.length - 1" :aria-label="`下移 ${member.agentName}`" @click="moveMember(index, index + 1)" /></UTooltip>
              </template>
              <UTooltip text="移除"><UButton :class="$style['wf-icon-button']" icon="i-lucide-x" color="error" variant="ghost" square :aria-label="`移除 ${member.agentName}`" @click="removeMember(index)" /></UTooltip>
            </span>
          </li>
        </ul>
      </section>
    </BuilderSteps>
  </main>
</template>

<style module src="./index.module.css"></style>
