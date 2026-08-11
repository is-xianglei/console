<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AgentResponse } from '@/interfaces/agent/api'
import type { PlanFormModel, PlanValidationIssue } from '@/interfaces/orchestration-plan/model'
import {
  MAX_ITERATIONS,
  MAX_MEMBERS,
  MIN_ITERATIONS,
  MIN_MEMBERS,
  PLAN_MODE_OPTIONS,
} from '@/hooks/useOrchestrationPlanManager'

defineOptions({ name: 'PlanBuilder' })

const props = defineProps<{
  plan: PlanFormModel
  mode: 'create' | 'edit'
  issues: PlanValidationIssue[]
  agents: AgentResponse[]
  saving: boolean
  error?: string
}>()
const emit = defineEmits<{ close: []; save: []; publish: [] }>()

const saveAttempted = ref(false)
const closeConfirmOpen = ref(false)
const agentSearch = ref('')
// 拖拽排序状态：仅当从把手按下后行才可拖动，避免路由输入框内选中文本触发拖拽。
const dragArmedIndex = ref<number | null>(null)
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
let savedSnapshot = ''

const filteredAgents = computed(() => {
  const query = agentSearch.value.trim().toLowerCase()
  if (!query) return props.agents
  return props.agents.filter((agent) =>
    [agent.id, agent.name, agent.description ?? ''].join(' ').toLowerCase().includes(query),
  )
})
const orderSensitive = computed(() => props.plan.mode === 'sequential' || props.plan.mode === 'loop')
const fallbackItems = computed(() => [
  { label: '不设置兜底', value: '' },
  ...props.plan.members
    .map((member) => member.routeKey.trim())
    .filter(Boolean)
    .map((key) => ({ label: key, value: key })),
])
const activeModeOption = computed(() =>
  PLAN_MODE_OPTIONS.find((option) => option.value === props.plan.mode) ?? PLAN_MODE_OPTIONS[0]!,
)
const hasModeConfigSection = computed(() => props.plan.mode === 'loop' || props.plan.mode === 'routing')
const reviewIndex = computed(() => (hasModeConfigSection.value ? '06' : '05'))

/** 校验问题按编辑器区块分组，供底部检查清单展示。 */
const SECTION_LABELS: Record<PlanValidationIssue['section'], string> = {
  basic: '基本信息',
  members: '成员 Agent',
  config: '模式配置',
}
const groupedIssues = computed(() =>
  (['basic', 'members', 'config'] as const)
    .map((section) => ({
      section,
      label: SECTION_LABELS[section],
      messages: props.issues.filter((issue) => issue.section === section).map((issue) => issue.message),
    }))
    .filter((group) => group.messages.length > 0),
)

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
  if (JSON.stringify(props.plan) !== savedSnapshot) closeConfirmOpen.value = true
  else emit('close')
}

function onSave() {
  saveAttempted.value = true
  if (props.issues.length) return
  emit('save')
}

function onPublish() {
  saveAttempted.value = true
  if (props.issues.length) return
  emit('publish')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !closeConfirmOpen.value) onCloseRequest()
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    onSave()
  }
}

/** 按下把手但未启动拖拽时清理武装状态，避免后续文本拖动误触发行排序。 */
function handlePointerUp() {
  dragArmedIndex.value = null
}

watch(() => props.plan, () => {
  savedSnapshot = JSON.stringify(props.plan)
})

onMounted(() => {
  savedSnapshot = JSON.stringify(props.plan)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('pointerup', handlePointerUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('pointerup', handlePointerUp)
})
</script>

<template>
  <main :class="$style['pl-builder']">
    <header :class="$style['pl-builder-head']">
      <UTooltip text="返回编排方案"><UButton :class="$style['pl-icon-button']" icon="i-lucide-arrow-left" color="neutral" variant="ghost" square aria-label="返回编排方案" @click="onCloseRequest" /></UTooltip>
      <div :class="$style['pl-builder-title']"><nav><span>编排方案</span><i class="icon icon-chevron-right"></i><strong>{{ mode === 'create' ? '创建方案' : plan.name }}</strong></nav><h1>{{ mode === 'create' ? '创建编排方案' : '编辑编排方案' }}<span class="mono">API CONFIG</span></h1></div>
      <div :class="$style['pl-builder-actions']"><UButton :class="$style['pl-secondary-button']" icon="i-lucide-save" color="neutral" variant="outline" label="保存配置" :loading="saving" :disabled="saving" @click="onSave" /><UButton :class="$style['pl-primary-button']" icon="i-lucide-circle-check-big" label="保存并启用" :loading="saving" :disabled="saving" @click="onPublish" /></div>
    </header>
    <UAlert v-if="error" :class="$style['pl-validation-banner']" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
    <UAlert v-else-if="saveAttempted && issues.length" :class="$style['pl-validation-banner']" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="issues[0]!.message" />

    <div :class="$style['pl-builder-body']">
      <section :class="$style['pl-section']" aria-labelledby="plan-basic-title">
        <header :class="$style['pl-section-head']">
          <span :class="$style['pl-section-icon']"><i class="icon icon-id-card"></i></span>
          <div><span>01</span><h2 id="plan-basic-title">基本信息</h2><p>设置方案名称、用途描述和启用状态；名称在工作区内唯一。</p></div>
        </header>
        <UForm :class="$style['pl-form-grid']" :state="plan">
          <UFormField :class="$style['pl-field']" label="名称" name="name" required>
            <UInput v-model="plan.name" autocomplete="off" maxlength="128" placeholder="例如：故障诊断三段式方案" />
          </UFormField>
          <UFormField :class="$style['pl-field']" label="运行状态" name="isEnabled" help="停用后会话无法绑定该方案。">
            <USwitch v-model="plan.isEnabled" :label="plan.isEnabled ? '已启用' : '已停用'" />
          </UFormField>
          <UFormField :class="[$style['pl-field'], $style['pl-span-2']]" label="用途描述" name="description">
            <UTextarea v-model="plan.description" :rows="3" autoresize :maxrows="6" placeholder="说明方案解决什么场景，帮助会话选择合适的编排。" />
          </UFormField>
        </UForm>
      </section>

      <section :class="$style['pl-section']" aria-labelledby="plan-mode-title">
        <header :class="$style['pl-section-head']">
          <span :class="$style['pl-section-icon']"><i class="icon icon-workflow"></i></span>
          <div><span>02</span><h2 id="plan-mode-title">编排模式</h2><p>决定成员 Agent 如何协作处理会话消息。</p></div>
        </header>
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
            <span :class="$style['pl-mode-main']"><strong>{{ option.label }}</strong><small class="mono">{{ option.value.toUpperCase() }}</small></span>
            <small :class="$style['pl-mode-hint']">{{ option.hint }}</small>
          </button>
        </div>
      </section>

      <section :class="$style['pl-section']" aria-labelledby="plan-members-title">
        <header :class="$style['pl-section-head']">
          <span :class="$style['pl-section-icon']"><i class="icon icon-bot"></i></span>
          <div><span>03</span><h2 id="plan-members-title">成员 Agent</h2><p>从当前工作区勾选 {{ MIN_MEMBERS }}-{{ MAX_MEMBERS }} 个已启用的 Agent，同一 Agent 不能重复加入。</p></div>
          <span :class="[$style['pl-member-count'], 'mono', { [$style.invalid]: plan.members.length < MIN_MEMBERS || plan.members.length > MAX_MEMBERS }]">{{ plan.members.length }} / {{ MAX_MEMBERS }}</span>
        </header>
        <UInput v-model="agentSearch" :class="$style['pl-agent-search']" icon="i-lucide-search" placeholder="搜索 Agent 名称、ID 或描述" aria-label="搜索 Agent" />
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
            <span :class="$style['pl-agent-meta']"><strong class="mono">AGT-{{ String(agent.id).padStart(4, '0') }}</strong><small>{{ agent.is_enabled ? '已启用' : '已停用' }}</small></span>
          </label>
          <UEmpty v-if="!filteredAgents.length" icon="i-lucide-search-x" title="没有匹配的 Agent" description="调整关键词，或先在 Agents 页创建并启用 Agent。" variant="naked" />
        </div>
      </section>

      <section :class="$style['pl-section']" aria-labelledby="plan-order-title">
        <header :class="$style['pl-section-head']">
          <span :class="$style['pl-section-icon']"><i :class="`icon icon-${activeModeOption.icon}`"></i></span>
          <div><span>04</span><h2 id="plan-order-title">{{ orderSensitive ? '执行顺序' : '成员配置' }}</h2><p>{{ orderSensitive ? '拖动把手调整执行顺序，成员将按列表顺序依次运行。' : plan.mode === 'routing' ? '为每个成员填写路由标识与触发条件，任务将分发给命中的成员。' : '并行模式下所有成员同时执行，顺序不影响结果。' }}</p></div>
        </header>
        <UEmpty v-if="!plan.members.length" icon="i-lucide-users-round" title="尚未选择成员" description="先在上方勾选至少两个 Agent。" variant="naked" />
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
            <span :class="[$style['pl-member-index'], 'mono']">{{ String(index + 1).padStart(2, '0') }}</span>
            <span :class="$style['pl-member-main']">
              <strong>{{ member.agentName }}</strong>
              <small class="mono">AGT-{{ String(member.agentId).padStart(4, '0') }}</small>
            </span>
            <span v-if="!member.isAvailable" :class="$style['pl-member-warning']"><i class="icon icon-triangle-alert"></i>该 Agent 已停用，方案将无法运行</span>
            <span :class="$style['pl-member-actions']">
              <template v-if="orderSensitive">
                <UTooltip text="上移"><UButton :class="$style['pl-icon-button']" icon="i-lucide-arrow-up" color="neutral" variant="ghost" square :disabled="index === 0" :aria-label="`上移 ${member.agentName}`" @click="moveMember(index, index - 1)" /></UTooltip>
                <UTooltip text="下移"><UButton :class="$style['pl-icon-button']" icon="i-lucide-arrow-down" color="neutral" variant="ghost" square :disabled="index === plan.members.length - 1" :aria-label="`下移 ${member.agentName}`" @click="moveMember(index, index + 1)" /></UTooltip>
              </template>
              <UTooltip text="移除"><UButton :class="$style['pl-icon-button']" icon="i-lucide-x" color="error" variant="ghost" square :aria-label="`移除 ${member.agentName}`" @click="removeMember(index)" /></UTooltip>
            </span>
            <div v-if="plan.mode === 'routing'" :class="$style['pl-route-config']">
              <UFormField :class="$style['pl-field']" label="路由标识" required help="方案内唯一，供路由决策与兜底引用。">
                <UInput v-model="member.routeKey" class="mono" maxlength="64" placeholder="例如：billing" />
              </UFormField>
              <UFormField :class="$style['pl-field']" label="触发条件" required help="描述什么样的任务应交给该成员。">
                <UInput v-model="member.when" maxlength="256" placeholder="例如：账单、发票、扣款相关问题" />
              </UFormField>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="hasModeConfigSection" :class="$style['pl-section']" aria-labelledby="plan-config-title">
        <header :class="$style['pl-section-head']">
          <span :class="$style['pl-section-icon']"><i class="icon icon-settings-2"></i></span>
          <div><span>05</span><h2 id="plan-config-title">模式配置</h2><p>{{ plan.mode === 'loop' ? '设置循环执行的轮数上限。' : '可选设置未命中任何路由时的兜底成员。' }}</p></div>
        </header>
        <UForm :class="$style['pl-form-grid']" :state="plan">
          <UFormField v-if="plan.mode === 'loop'" :class="$style['pl-field']" label="循环轮数" name="maxIterations" required :help="`必填，${MIN_ITERATIONS}-${MAX_ITERATIONS} 的整数。`">
            <UInputNumber v-model="plan.maxIterations" :min="MIN_ITERATIONS" :max="MAX_ITERATIONS" :step="1" aria-label="循环轮数" />
          </UFormField>
          <UFormField v-if="plan.mode === 'routing'" :class="$style['pl-field']" label="兜底路由" name="fallback" help="从已填写的路由标识中选择；不设置时未命中任务将直接失败。">
            <USelect v-model="plan.fallback" :items="fallbackItems" aria-label="兜底路由" placeholder="不设置兜底" />
          </UFormField>
        </UForm>
      </section>

      <section :class="$style['pl-section']" aria-labelledby="plan-review-title">
        <header :class="$style['pl-section-head']">
          <span :class="$style['pl-section-icon']"><i class="icon icon-circle-check-big"></i></span>
          <div><span>{{ reviewIndex }}</span><h2 id="plan-review-title">检查与保存</h2><p>按区块处理校验问题后保存；启用并保存会立即对会话开放该方案。</p></div>
        </header>
        <div v-if="groupedIssues.length" :class="$style['pl-issue-groups']" aria-label="校验问题列表">
          <div v-for="group in groupedIssues" :key="group.section" :class="$style['pl-issue-group']">
            <strong>{{ group.label }}</strong>
            <ul><li v-for="(message, messageIndex) in group.messages" :key="messageIndex"><i class="icon icon-triangle-alert"></i>{{ message }}</li></ul>
          </div>
        </div>
        <div v-else :class="$style['pl-issue-clear']"><i class="icon icon-circle-check-big"></i>校验通过，可以保存方案。</div>
        <footer :class="$style['pl-builder-footer']">
          <UButton :class="$style['pl-secondary-button']" icon="i-lucide-save" color="neutral" variant="outline" label="保存" :loading="saving" :disabled="saving" @click="onSave" />
          <UButton :class="$style['pl-primary-button']" icon="i-lucide-circle-check-big" label="启用并保存" :loading="saving" :disabled="saving" @click="onPublish" />
        </footer>
      </section>
    </div>

    <UModal v-model:open="closeConfirmOpen" class="ag-confirm-modal" title="放弃未保存的修改？" description="当前修改尚未保存到后端，离开后将丢失。">
      <template #body><p :class="$style['pl-modal-copy']">当前修改尚未保存到后端，离开后将丢失。</p></template>
      <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="closeConfirmOpen = false" /><UButton label="放弃修改" color="error" @click="emit('close')" /></template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>

