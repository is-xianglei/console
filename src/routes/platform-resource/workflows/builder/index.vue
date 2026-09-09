<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { WORKFLOW_MODE_OPTIONS, minWorkflowMembers } from '@/constants/workflow'
import type { AgentResponse } from '@/interfaces/agent/api'
import type {
  WorkflowFormModel,
  WorkflowValidationIssue,
} from '@/interfaces/workflow/model'
import { focusFirstError } from '@/hooks/useFormHelpers'

defineOptions({ name: 'WorkflowBuilder' })

const props = defineProps<{
  workflow: WorkflowFormModel
  mode: 'create' | 'edit'
  issues: WorkflowValidationIssue[]
  agents: AgentResponse[]
  saving: boolean
  error?: string | null
}>()
const emit = defineEmits<{ close: []; save: [] }>()

const saveAttempted = ref(false)
const builderRoot = ref<HTMLElement | null>(null)
const agentSearch = ref('')

/** 把校验问题映射到 UFormField 的 name 上（B-8）：名称 / 成员数落到对应字段下方。 */
const formErrors = computed(() =>
  props.issues.map((issue) => ({
    name: issue.section === 'members' ? 'members' : 'name',
    message: issue.message,
  })),
)
// 拖拽排序状态：仅当从把手按下后行才可拖动，避免输入框内选中文本触发拖拽。
const dragArmedIndex = ref<number | null>(null)
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

const filteredAgents = computed(() => {
  const query = agentSearch.value.trim().toLowerCase()
  if (!query) return props.agents
  return props.agents.filter((agent) =>
    [agent.id, agent.name, agent.description ?? ''].join(' ').toLowerCase().includes(query),
  )
})
/** 顺序模式展示执行顺序并允许排序；并行与智能路由只看成员集合。 */
const orderSensitive = computed(() => props.workflow.mode === 'sequential')
const activeModeOption = computed(() =>
  WORKFLOW_MODE_OPTIONS.find((option) => option.value === props.workflow.mode)
    ?? WORKFLOW_MODE_OPTIONS[0]!,
)
const minimumMembers = computed(() => minWorkflowMembers(props.workflow.mode))

/** 校验问题按编辑器区块分组，供底部检查清单展示。 */
const SECTION_LABELS: Record<WorkflowValidationIssue['section'], string> = {
  basic: '基本信息',
  members: '成员 Agent',
}
const groupedIssues = computed(() =>
  (['basic', 'members'] as const)
    .map((section) => ({
      section,
      label: SECTION_LABELS[section],
      messages: props.issues.filter((issue) => issue.section === section).map((issue) => issue.message),
    }))
    .filter((group) => group.messages.length > 0),
)

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

/** section → 分区标题节点 id；用于无字段级问题的成员数告警滚到对应分区。 */
const SECTION_ANCHOR: Record<WorkflowValidationIssue['section'], string> = {
  basic: 'workflow-basic-title',
  members: 'workflow-members-title',
}

/** 定位到首个问题的分区：优先字段级 aria-invalid，若整区无字段（如成员数）则滚到分区标题。 */
function focusIssueSection(section: WorkflowValidationIssue['section']) {
  if (builderRoot.value && focusFirstError(builderRoot.value)) return
  document.getElementById(SECTION_ANCHOR[section])?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

async function onSave() {
  saveAttempted.value = true
  if (props.issues.length) {
    await nextTick()
    focusIssueSection(props.issues[0]!.section)
    return
  }
  emit('save')
}

function onCancel() {
  onCloseRequest()
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
  <main ref="builderRoot" :class="$style['wf-builder']">
    <header :class="$style['wf-builder-head']">
      <UTooltip text="返回 Workflows"><UButton :class="$style['wf-icon-button']" icon="i-lucide-arrow-left" color="neutral" variant="ghost" square aria-label="返回 Workflows" @click="onCloseRequest" /></UTooltip>
      <div :class="$style['wf-builder-title']"><nav><span>构建资源</span><i class="icon icon-chevron-right"></i><strong>Workflows</strong></nav><h1>{{ mode === 'create' ? '创建 Workflow' : `编辑：${workflow.name}` }}<span class="mono">API CONFIG</span></h1></div>
      <div :class="$style['wf-builder-actions']"><UButton :class="$style['wf-primary-button']" icon="i-lucide-save" label="保存" :loading="saving" :disabled="saving" @click="onSave" /></div>
    </header>
    <UAlert v-if="error" :class="$style['wf-validation-banner']" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
    <UAlert v-else-if="saveAttempted && issues.length" :class="$style['wf-validation-banner']" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="`共 ${issues.length} 处问题，已定位并滚动到首个错误字段。`" />

    <div :class="$style['wf-builder-body']">
      <section :class="$style['wf-section']" aria-labelledby="workflow-basic-title">
        <header :class="$style['wf-section-head']">
          <span :class="$style['wf-section-icon']"><i class="icon icon-id-card"></i></span>
          <div><span>01</span><h2 id="workflow-basic-title">基本信息</h2><p>设置 Workflow 名称、用途描述和启用状态；名称在工作区内唯一。</p></div>
        </header>
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

      <section :class="$style['wf-section']" aria-labelledby="workflow-mode-title">
        <header :class="$style['wf-section-head']">
          <span :class="$style['wf-section-icon']"><i class="icon icon-workflow"></i></span>
          <div><span>02</span><h2 id="workflow-mode-title">编排模式</h2><p>决定成员 Agent 如何协作处理会话消息。</p></div>
        </header>
        <div :class="$style['wf-mode-grid']" role="radiogroup" aria-label="编排模式">
          <button
            v-for="option in WORKFLOW_MODE_OPTIONS"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="workflow.mode === option.value"
            :class="[$style['wf-mode-card'], { [$style.selected]: workflow.mode === option.value }]"
            @click="workflow.mode = option.value"
          >
            <span :class="$style['wf-mode-icon']"><i :class="`icon icon-${option.icon}`"></i></span>
            <span :class="$style['wf-mode-main']"><strong>{{ option.label }}</strong><small class="mono">{{ option.value.toUpperCase() }}</small></span>
            <small :class="$style['wf-mode-hint']">{{ option.hint }}</small>
          </button>
        </div>
        <p :class="$style['wf-mode-note']"><i class="icon icon-triangle-alert"></i>顺序执行最少 {{ minWorkflowMembers('sequential') }} 个成员，并行与智能路由最少 {{ minWorkflowMembers('parallel') }} 个成员。</p>
      </section>

      <section :class="$style['wf-section']" aria-labelledby="workflow-members-title">
        <header :class="$style['wf-section-head']">
          <span :class="$style['wf-section-icon']"><i class="icon icon-bot"></i></span>
          <div><span>03</span><h2 id="workflow-members-title">成员 Agent</h2><p>从当前工作区勾选已启用的 Agent，同一 Agent 不能重复加入；已停用或已删除的成员需移除后才能保存。</p></div>
          <span :class="[$style['wf-member-count'], 'mono', { [$style.invalid]: workflow.members.length < minimumMembers }]">{{ workflow.members.length }} 人</span>
        </header>
        <UInput v-model="agentSearch" :class="$style['wf-agent-search']" icon="i-lucide-search" placeholder="搜索 Agent 名称、ID 或描述" aria-label="搜索 Agent" />
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
            <span :class="$style['wf-agent-meta']"><strong class="mono">AGT-{{ String(agent.id).padStart(4, '0') }}</strong><small :class="{ [$style.offline]: !agent.is_enabled }">{{ agent.is_enabled ? '已启用' : '已停用' }}</small></span>
          </label>
          <UEmpty v-if="!filteredAgents.length" icon="i-lucide-search-x" title="没有匹配的 Agent" description="调整关键词，或先在 Agents 页创建并启用 Agent。" variant="naked" />
        </div>
      </section>

      <section :class="$style['wf-section']" aria-labelledby="workflow-order-title">
        <header :class="$style['wf-section-head']">
          <span :class="$style['wf-section-icon']"><i :class="`icon icon-${activeModeOption.icon}`"></i></span>
          <div><span>04</span><h2 id="workflow-order-title">{{ orderSensitive ? '执行顺序' : '参与成员' }}</h2><p>{{ orderSensitive ? '拖动把手或使用按钮调整执行顺序，成员将按列表顺序依次运行。' : workflow.mode === 'llm_routing' ? '由模型根据成员描述选出最合适的一个成员，顺序不影响结果。' : '并行模式下所有成员同时处理任务，顺序不影响结果。' }}</p></div>
        </header>
        <UEmpty v-if="!workflow.members.length" icon="i-lucide-users-round" :title="orderSensitive ? '尚未选择成员' : '尚未选择参与成员'" :description="`先在上方勾选至少 ${minimumMembers} 个 Agent。`" variant="naked" />
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
            <span :class="[$style['wf-member-index'], 'mono']">{{ String(index + 1).padStart(2, '0') }}</span>
            <span :class="$style['wf-member-main']">
              <strong>{{ member.agentName }}</strong>
              <small class="mono">AGT-{{ String(member.agentId).padStart(4, '0') }}</small>
            </span>
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

      <section :class="$style['wf-section']" aria-labelledby="workflow-review-title">
        <header :class="$style['wf-section-head']">
          <span :class="$style['wf-section-icon']"><i class="icon icon-circle-check-big"></i></span>
          <div><span>05</span><h2 id="workflow-review-title">检查与保存</h2><p>按区块处理校验问题后保存；启用状态决定保存后是否立即对会话开放。</p></div>
        </header>
        <div v-if="groupedIssues.length" :class="$style['wf-issue-groups']" aria-label="校验问题列表">
          <div v-for="group in groupedIssues" :key="group.section" :class="$style['wf-issue-group']">
            <strong>{{ group.label }}</strong>
            <ul><li v-for="(message, messageIndex) in group.messages" :key="messageIndex"><i class="icon icon-triangle-alert"></i>{{ message }}</li></ul>
          </div>
        </div>
        <div v-else :class="$style['wf-issue-clear']"><i class="icon icon-circle-check-big"></i>校验通过，可以保存 Workflow。</div>
        <footer :class="$style['wf-builder-footer']">
          <UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="onCancel" />
          <UButton :class="$style['wf-primary-button']" icon="i-lucide-save" label="保存 Workflow" :loading="saving" :disabled="saving" @click="onSave" />
        </footer>
      </section>
    </div>
  </main>
</template>

<style module src="./index.module.css"></style>
