<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AgentResponse } from '@/interfaces/agent/api'
import type { PlanBuilderStep, PlanFormModel, PlanValidationIssue } from '@/interfaces/orchestration-plan/model'
import BuilderSteps from '@/components/resource/builder-steps/index.vue'
import { groupIssuesByStep, useBuilderSteps, type BuilderStepDef } from '@/hooks/useBuilderSteps'
import {
  MAX_ITERATIONS,
  MAX_MEMBERS,
  MIN_ITERATIONS,
  MIN_MEMBERS,
  PLAN_MODE_OPTIONS,
  planIssueFieldName,
  planIssueStep,
} from '@/hooks/useOrchestrationPlanManager'

defineOptions({ name: 'PlanBuilder' })

const props = defineProps<{
  plan: PlanFormModel
  mode: 'create' | 'edit'
  issues: PlanValidationIssue[]
  agents: AgentResponse[]
  saving: boolean
  error?: string
  /** 新建页草稿已从已有方案预填（?duplicate= 复制成功）；编辑模式无需传。 */
  prefilled?: boolean
}>()
const emit = defineEmits<{ close: []; save: []; publish: [] }>()

const saveAttempted = ref(false)
const builderRoot = ref<HTMLElement | null>(null)
const agentSearch = ref('')
// 拖拽排序状态：仅当从把手按下后行才可拖动，避免路由输入框内选中文本触发拖拽。
const dragArmedIndex = ref<number | null>(null)
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const NO_FALLBACK_VALUE = '__no_fallback__'

/** 固定 4 步；loop / routing 模式才追加「模式配置」。 */
const BASE_STEPS: BuilderStepDef<PlanBuilderStep>[] = [
  { id: 'basic', label: '基本信息' },
  { id: 'mode', label: '编排模式' },
  { id: 'members', label: '选择成员' },
  { id: 'order', label: '成员配置' },
]
const CONFIG_STEP: BuilderStepDef<PlanBuilderStep> = { id: 'config', label: '模式配置' }
const hasModeConfigStep = computed(() => props.plan.mode === 'loop' || props.plan.mode === 'routing')
const steps = computed(() => (hasModeConfigStep.value ? [...BASE_STEPS, CONFIG_STEP] : BASE_STEPS))

const stepIssues = computed(() => groupIssuesByStep(props.issues, planIssueStep))

function isStepComplete(step: PlanBuilderStep) {
  if (step === 'basic') return Boolean(props.plan.name.trim())
  if (step === 'members') return !stepIssues.value.members?.length
  if (step === 'order') return props.plan.members.length >= MIN_MEMBERS && !stepIssues.value.order?.length
  return !stepIssues.value[step]?.length
}

const { active: activeStep, items: stepItems, focusFirstIssue } = useBuilderSteps({
  steps,
  issues: stepIssues,
  attempted: saveAttempted,
  fromExisting: () => props.mode === 'edit' || Boolean(props.prefilled),
  isComplete: isStepComplete,
})

/**
 * 点过保存后仍有问题的字段：标成 error（红框 + aria-invalid，供 focusFirstIssue 聚焦），
 * 问题文字只由 BuilderSteps 列在该步顶部，字段下不重复。
 * 按 issue 自带的 field / memberIndex 命名（routeKey-1 等），由 issues 实时算出，排序 / 增删成员后不会过期；
 * 成员数量这类容器级问题（field = members）没有对应控件，只由该步问题提示表达。
 */
const invalidFields = computed(() => new Set(saveAttempted.value ? props.issues.map(planIssueFieldName) : []))

function fieldError(name: string) {
  return invalidFields.value.has(name) || undefined
}

const filteredAgents = computed(() => {
  const query = agentSearch.value.trim().toLowerCase()
  if (!query) return props.agents
  return props.agents.filter((agent) =>
    [agent.name, agent.description ?? ''].join(' ').toLowerCase().includes(query),
  )
})
const orderSensitive = computed(() => props.plan.mode === 'sequential' || props.plan.mode === 'loop')
const fallbackItems = computed(() => [
  { label: '不设置兜底', value: NO_FALLBACK_VALUE },
  ...props.plan.members
    .map((member) => member.routeKey.trim())
    .filter(Boolean)
    .map((key) => ({ label: key, value: key })),
])
function memberIndex(agentId: number) {
  return props.plan.members.findIndex((member) => member.agentId === agentId)
}

function isMember(agentId: number) {
  return memberIndex(agentId) >= 0
}

/** 勾选/取消成员；同一 Agent 不可重复，仅已启用 Agent 可加入，超出上限时拒绝新增。 */
function toggleMember(agent: AgentResponse, value: boolean | 'indeterminate') {
  if (value === true) {
    if (isMember(agent.id) || !agent.is_enabled || props.plan.members.length >= MAX_MEMBERS) return
    props.plan.members.push({
      agentId: agent.id,
      agentName: agent.name,
      routeKey: '',
      when: '',
      isAvailable: agent.is_enabled,
    })
    return
  }
  const index = memberIndex(agent.id)
  if (index >= 0) props.plan.members.splice(index, 1)
}

function removeMember(index: number) {
  props.plan.members.splice(index, 1)
}

function moveMember(from: number, to: number) {
  if (to < 0 || to >= props.plan.members.length || from === to) return
  const [moved] = props.plan.members.splice(from, 1)
  props.plan.members.splice(to, 0, moved!)
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

/**
 * 点过保存 / 发布：有问题时跳到第一个有问题的步骤并聚焦错误字段，返回 false 阻止提交。
 * 成员数量这类无字段的问题，焦点落在该步顶部的问题提示上。
 */
function attemptSubmit() {
  saveAttempted.value = true
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

/** 按下把手但未启动拖拽时清理武装状态，避免后续文本拖动误触发行排序。 */
function handlePointerUp() {
  dragArmedIndex.value = null
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('pointerup', handlePointerUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('pointerup', handlePointerUp)
})
</script>

<template>
  <main ref="builderRoot" :class="$style['pl-builder']">
    <header :class="$style['pl-builder-head']">
      <UTooltip text="返回编排方案"><UButton :class="$style['pl-icon-button']" icon="i-lucide-arrow-left" color="neutral" variant="ghost" square aria-label="返回编排方案" @click="onCloseRequest" /></UTooltip>
      <div :class="$style['pl-builder-title']"><nav><span>编排方案</span><template v-if="mode === 'edit'"><i class="icon icon-chevron-right"></i><strong>{{ plan.name }}</strong></template></nav><h1>{{ mode === 'create' ? '创建编排方案' : '编辑编排方案' }}</h1></div>
      <div :class="$style['pl-builder-actions']"><UButton :class="$style['pl-secondary-button']" icon="i-lucide-save" color="neutral" variant="outline" label="保存配置" :loading="saving" :disabled="saving" @click="onSave" /><UButton :class="$style['pl-primary-button']" icon="i-lucide-circle-check-big" label="保存并启用" :loading="saving" :disabled="saving" @click="onPublish" /></div>
    </header>
    <UAlert v-if="error" :class="$style['pl-validation-banner']" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
    <UAlert v-else-if="saveAttempted && issues.length" :class="$style['pl-validation-banner']" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="`还有 ${issues.length} 项配置需要处理。`" />

    <BuilderSteps v-model="activeStep" :items="stepItems">
      <!-- 单个 UForm 包住各步；字段错误只经 :error 标红框 + aria-invalid，问题文字由 BuilderSteps 列在该步顶部。 -->
      <UForm :state="plan">
      <section v-if="activeStep === 'basic'" :class="$style['pl-step']" aria-label="基本信息">
        <div :class="$style['pl-form-grid']">
          <UFormField :class="$style['pl-field']" label="名称" name="name" required :error="fieldError('name')">
            <UInput v-model="plan.name" autocomplete="off" maxlength="128" placeholder="例如：故障诊断三段式方案" />
          </UFormField>
          <UFormField :class="$style['pl-field']" label="运行状态" name="isEnabled" help="停用后会话无法绑定该方案。">
            <USwitch v-model="plan.isEnabled" :label="plan.isEnabled ? '已启用' : '已停用'" />
          </UFormField>
          <UFormField :class="[$style['pl-field'], $style['pl-span-2']]" label="用途描述" name="description">
            <UTextarea v-model="plan.description" :rows="3" autoresize :maxrows="6" placeholder="说明方案解决什么场景，帮助会话选择合适的编排。" />
          </UFormField>
        </div>
      </section>

      <section v-else-if="activeStep === 'mode'" :class="$style['pl-step']" aria-label="编排模式">
        <div :class="$style['pl-mode-grid']" role="radiogroup" aria-label="编排模式">
          <button
            v-for="option in PLAN_MODE_OPTIONS"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="plan.mode === option.value"
            :class="[$style['pl-mode-card'], { [$style.selected]: plan.mode === option.value }]"
            @click="plan.mode = option.value"
          >
            <span :class="$style['pl-mode-icon']"><i :class="`icon icon-${option.icon}`"></i></span>
            <span :class="$style['pl-mode-main']"><strong>{{ option.label }}</strong></span>
            <small :class="$style['pl-mode-hint']">{{ option.hint }}</small>
          </button>
        </div>
      </section>

      <section v-else-if="activeStep === 'members'" :class="$style['pl-step']" aria-label="选择成员">
        <div :class="$style['pl-member-toolbar']">
          <UInput v-model="agentSearch" :class="$style['pl-agent-search']" icon="i-lucide-search" placeholder="搜索 Agent 名称或描述" aria-label="搜索 Agent" />
          <span :class="[$style['pl-member-count'], 'mono', { [$style.invalid]: plan.members.length < MIN_MEMBERS || plan.members.length > MAX_MEMBERS }]">{{ plan.members.length }} / {{ MAX_MEMBERS }}</span>
        </div>
        <div :class="$style['pl-agent-list']">
          <label
            v-for="agent in filteredAgents"
            :key="agent.id"
            :class="[$style['pl-agent-row'], { [$style.selected]: isMember(agent.id), [$style.disabled]: !agent.is_enabled && !isMember(agent.id) }]"
          >
            <UCheckbox
              :model-value="isMember(agent.id)"
              :disabled="!isMember(agent.id) && (!agent.is_enabled || plan.members.length >= MAX_MEMBERS)"
              :aria-label="`选择 ${agent.name}`"
              @update:model-value="toggleMember(agent, $event)"
            />
            <span :class="$style['pl-agent-glyph']"><i class="icon icon-bot"></i></span>
            <span :class="$style['pl-agent-main']"><strong>{{ agent.name }}</strong><small>{{ agent.description || '未填写用途描述' }}</small></span>
            <span :class="$style['pl-agent-meta']">{{ agent.is_enabled ? '已启用' : '已停用' }}</span>
          </label>
          <UEmpty v-if="!filteredAgents.length" icon="i-lucide-search-x" title="没有匹配的 Agent" description="调整关键词，或先在 Agents 页创建并启用 Agent。" variant="naked" />
        </div>
      </section>

      <section v-else-if="activeStep === 'order'" :class="$style['pl-step']" aria-label="成员配置">
        <UEmpty v-if="!plan.members.length" icon="i-lucide-users-round" title="尚未选择成员" description="先在「选择成员」步骤勾选至少两个 Agent。" variant="naked" />
        <ul v-else :class="$style['pl-member-list']">
          <li
            v-for="(member, index) in plan.members"
            :key="member.agentId"
            :class="[$style['pl-member-row'], { [$style.dragging]: dragIndex === index, [$style['drag-over']]: dragOverIndex === index && dragIndex !== index, [$style.unavailable]: !member.isAvailable }]"
            :draggable="orderSensitive"
            @dragstart="onDragStart($event, index)"
            @dragover="onDragOver($event, index)"
            @drop.prevent="onDrop(index)"
            @dragend="onDragEnd"
          >
            <span
              v-if="orderSensitive"
              :class="$style['pl-drag-handle']"
              aria-label="拖动调整顺序"
              @pointerdown="dragArmedIndex = index"
            ><i class="icon icon-grip-vertical"></i></span>
            <span v-if="orderSensitive" :class="[$style['pl-member-index'], 'mono']">{{ String(index + 1).padStart(2, '0') }}</span>
            <span :class="$style['pl-member-main']"><strong>{{ member.agentName }}</strong></span>
            <span v-if="!member.isAvailable" :class="$style['pl-member-warning']"><i class="icon icon-triangle-alert"></i>该 Agent 已停用，方案将无法运行</span>
            <span :class="$style['pl-member-actions']">
              <template v-if="orderSensitive">
                <UTooltip text="上移"><UButton :class="$style['pl-icon-button']" icon="i-lucide-arrow-up" color="neutral" variant="ghost" square :disabled="index === 0" :aria-label="`上移 ${member.agentName}`" @click="moveMember(index, index - 1)" /></UTooltip>
                <UTooltip text="下移"><UButton :class="$style['pl-icon-button']" icon="i-lucide-arrow-down" color="neutral" variant="ghost" square :disabled="index === plan.members.length - 1" :aria-label="`下移 ${member.agentName}`" @click="moveMember(index, index + 1)" /></UTooltip>
              </template>
              <UTooltip text="移除"><UButton :class="$style['pl-icon-button']" icon="i-lucide-x" color="error" variant="ghost" square :aria-label="`移除 ${member.agentName}`" @click="removeMember(index)" /></UTooltip>
            </span>
            <div v-if="plan.mode === 'routing'" :class="$style['pl-route-config']">
              <UFormField :class="$style['pl-field']" label="路由标识" :name="`routeKey-${index}`" required :error="fieldError(`routeKey-${index}`)">
                <UInput v-model="member.routeKey" class="mono" maxlength="64" placeholder="例如：billing" />
              </UFormField>
              <UFormField :class="$style['pl-field']" label="触发条件" :name="`when-${index}`" required :error="fieldError(`when-${index}`)">
                <UInput v-model="member.when" maxlength="256" placeholder="例如：账单、发票、扣款相关问题" />
              </UFormField>
            </div>
          </li>
        </ul>
      </section>

      <section v-else-if="activeStep === 'config'" :class="$style['pl-step']" aria-label="模式配置">
        <div :class="$style['pl-form-grid']">
          <UFormField v-if="plan.mode === 'loop'" :class="$style['pl-field']" label="循环轮数" name="maxIterations" required :error="fieldError('maxIterations')">
            <UInputNumber v-model="plan.maxIterations" :min="MIN_ITERATIONS" :max="MAX_ITERATIONS" :step="1" aria-label="循环轮数" />
          </UFormField>
          <UFormField v-if="plan.mode === 'routing'" :class="$style['pl-field']" label="兜底路由" name="fallback" help="从已填写的路由标识中选择；不设置时未命中任务将直接失败。" :error="fieldError('fallback')">
            <USelect :model-value="plan.fallback || NO_FALLBACK_VALUE" :items="fallbackItems" aria-label="兜底路由" placeholder="不设置兜底" @update:model-value="(value: unknown) => { plan.fallback = value === NO_FALLBACK_VALUE ? '' : String(value ?? '') }" />
          </UFormField>
        </div>
      </section>

      </UForm>
    </BuilderSteps>
  </main>
</template>

<style module src="./index.module.css"></style>
