<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AgentResponse } from '@/interfaces/agent/api'
import {
  MAX_CONCURRENCY,
  MAX_TEAM_MEMBERS,
  MIN_CONCURRENCY,
  MIN_TEAM_MEMBERS,
  TEAM_MODE_OPTIONS,
  type TeamFormModel,
  type TeamMember,
  type TeamValidationIssue,
} from '@/interfaces/platform-team/model'
import BuilderSteps from '@/components/resource/builder-steps/index.vue'
import { groupIssuesByStep, useBuilderSteps, type BuilderStepDef } from '@/hooks/useBuilderSteps'
import { useAgentsStore } from '@/stores/agents'
import {
  MAX_TEAM_NAME_LENGTH,
  MAX_TEAM_TIMEOUT_SECONDS,
  MIN_TEAM_TIMEOUT_SECONDS,
  type TeamIssue,
  type TeamIssueField,
} from '@/stores/teams'

defineOptions({ name: 'TeamBuilder' })

const props = defineProps<{
  team: TeamFormModel
  mode: 'create' | 'edit'
  issues: TeamIssue[]
  saving: boolean
  error?: string
  /** 新建页草稿已从已有 Team 预填（?duplicate= 命中）；编辑模式无需传。 */
  prefilled?: boolean
}>()
const emit = defineEmits<{ close: []; save: []; publish: [] }>()

/** 步骤 id 与标题固定，不随编排模式变化。 */
type StepId = 'basic' | 'mode' | 'members' | 'runtime'
const steps: BuilderStepDef<StepId>[] = [
  { id: 'basic', label: '基本信息' },
  { id: 'mode', label: '编排模式' },
  { id: 'members', label: '成员' },
  { id: 'runtime', label: '运行策略' },
]
/** issue.section → 步骤（编排模式有默认值，目前不产生 issue）；Record 保证每个 section 都有归属。 */
const SECTION_STEP: Record<TeamValidationIssue['section'], StepId> = {
  basic: 'basic',
  members: 'members',
  runtime: 'runtime',
}

const agentsStore = useAgentsStore()
const saveAttempted = ref(false)
const builderRoot = ref<HTMLElement | null>(null)
const agentSearch = ref('')

const stepIssues = computed(() => groupIssuesByStep(props.issues, (issue) => SECTION_STEP[issue.section]))

const { active: activeStep, items: stepItems, focusFirstIssue } = useBuilderSteps({
  steps,
  issues: stepIssues,
  attempted: saveAttempted,
  fromExisting: () => props.mode === 'edit' || Boolean(props.prefilled),
})

/**
 * 点过保存后仍有问题的字段：标成 error（红框 + aria-invalid，供 focusFirstIssue 聚焦），
 * 问题文字只由 BuilderSteps 列在该步顶部，字段下不重复。
 * 成员问题是整组计数 / 入口类问题，不标记单个控件，由该步问题提示和「n / 8」计数表达。
 */
const invalidFields = computed(() => new Set<TeamIssueField>(saveAttempted.value ? props.issues.map((issue) => issue.field) : []))

function fieldError(field: Exclude<TeamIssueField, 'members'>) {
  return invalidFields.value.has(field) || undefined
}

/** 成员数组可能因外部草稿被清空而缺失，统一走这个安全视图。 */
const members = computed(() => props.team.members ?? [])

const agentItems = computed<AgentResponse[]>(() => agentsStore.state.items)

/** 编排模式卡片的图标：TEAM_MODE_OPTIONS 只带 label/hint，图标在此映射。 */
const MODE_ICONS: Record<TeamFormModel['mode'], string> = {
  supervisor: 'users',
  parallel: 'layers',
  pipeline: 'git-branch',
}

const filteredAgents = computed(() => {
  const query = agentSearch.value.trim().toLowerCase()
  if (!query) return agentItems.value
  return agentItems.value.filter((agent) =>
    [agent.name, agent.description ?? ''].join(' ').toLowerCase().includes(query),
  )
})

/**
 * 只有流水线按成员顺序依次交接，展示执行序号与上移 / 下移；主管式由入口分派、并行同时处理，只看成员集合与入口。
 */
const orderSensitive = computed(() => props.team.mode === 'pipeline')

/** 目录播种的成员行可能还没指定 Agent（agentName 为空），展示时给出占位名。 */
function memberLabel(member: TeamMember) {
  return member.agentName.trim() || '未指定 Agent'
}

function memberIndex(agentId: number) {
  return members.value.findIndex((member) => member.agentId === String(agentId))
}

function isMember(agentId: number) {
  return memberIndex(agentId) >= 0
}

/** AgentResponse.id 是 number，TeamMember.agentId 是目录串，这里统一转成 String。 */
function toggleMember(agent: AgentResponse, value: boolean | 'indeterminate') {
  if (value === true) {
    if (isMember(agent.id) || !agent.is_enabled || members.value.length >= MAX_TEAM_MEMBERS) return
    props.team.members.push({
      agentId: String(agent.id),
      agentName: agent.name,
      duty: '',
      isEntry: false,
    })
    if (props.team.entryIndex < 0) props.team.entryIndex = 0
    return
  }
  removeMember(memberIndex(agent.id))
}

function removeMember(index: number) {
  if (index < 0) return
  props.team.members.splice(index, 1)
  // 删除后修正入口下标：删掉入口则顺延到同位置的下一位，越界则回落到 0。
  if (props.team.entryIndex === index) {
    props.team.entryIndex = members.value.length ? Math.min(index, members.value.length - 1) : -1
  } else if (props.team.entryIndex > index) {
    props.team.entryIndex -= 1
  }
}

/** 上下移同步入口下标，避免入口指向错误的成员。 */
function moveMember(from: number, to: number) {
  if (to < 0 || to >= members.value.length || from === to) return
  const [moved] = props.team.members.splice(from, 1)
  props.team.members.splice(to, 0, moved!)
  if (props.team.entryIndex === from) props.team.entryIndex = to
  else if (props.team.entryIndex === to) props.team.entryIndex = from
}

function setEntry(index: number) {
  props.team.entryIndex = index
}

function onCloseRequest() {
  emit('close')
}

/**
 * 点过保存 / 保存并启用：issues 由 validateTeam 实时计算，改好后即可再次提交。
 * 有问题时跳到第一个有问题的步骤并聚焦错误字段，返回 false 阻止提交。
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
    onSave()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  if (!agentsStore.state.items.length) void agentsStore.loadAgents()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <main ref="builderRoot" :class="$style['tm-builder']">
    <header :class="$style['tm-builder-head']">
      <UTooltip text="返回 Teams"><UButton :class="$style['tm-icon-button']" icon="i-lucide-arrow-left" color="neutral" variant="ghost" square aria-label="返回 Teams" @click="onCloseRequest" /></UTooltip>
      <div :class="$style['tm-builder-title']"><nav><span>Teams</span><template v-if="mode === 'edit'"><i class="icon icon-chevron-right"></i><strong>{{ team.name }}</strong></template></nav><h1>{{ mode === 'create' ? '创建 Team' : '编辑 Team' }}</h1></div>
      <div :class="$style['tm-builder-actions']"><UButton :class="$style['tm-secondary-button']" icon="i-lucide-save" color="neutral" variant="outline" label="保存草稿" :loading="saving" :disabled="saving" @click="onSave" /><UButton :class="$style['tm-primary-button']" icon="i-lucide-circle-check-big" label="保存并启用" :loading="saving" :disabled="saving" @click="onPublish" /></div>
    </header>
    <UAlert v-if="error" :class="$style['tm-validation-banner']" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
    <UAlert v-else-if="saveAttempted && issues.length" :class="$style['tm-validation-banner']" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="`还有 ${issues.length} 项配置需要处理。`" />

    <BuilderSteps v-model="activeStep" :items="stepItems">
      <section v-if="activeStep === 'basic'" :class="$style['tm-step']" aria-label="基本信息">
        <UForm :class="$style['tm-form-grid']" :state="team">
          <UFormField :class="$style['tm-field']" label="名称" name="name" required :error="fieldError('name')">
            <UInput v-model="team.name" autocomplete="off" :maxlength="MAX_TEAM_NAME_LENGTH" placeholder="例如：故障诊断协作组" />
          </UFormField>
          <UFormField :class="$style['tm-field']" label="运行状态" name="status" help="停用后该 Team 不会接收新任务。">
            <USwitch :model-value="team.status === 'nominal'" :label="team.status === 'nominal' ? '已启用' : '未启用'" @update:model-value="(value: boolean) => { team.status = value ? 'nominal' : 'idle' }" />
          </UFormField>
          <UFormField :class="[$style['tm-field'], $style['tm-span-2']]" label="用途描述" name="description">
            <UTextarea v-model="team.description" :rows="3" autoresize :maxrows="6" placeholder="说明该 Team 解决什么场景，帮助会话选择合适的编排。" />
          </UFormField>
        </UForm>
      </section>

      <section v-else-if="activeStep === 'mode'" :class="$style['tm-step']" aria-label="编排模式">
        <div :class="$style['tm-mode-grid']" role="radiogroup" aria-label="编排模式">
          <button
            v-for="option in TEAM_MODE_OPTIONS"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="team.mode === option.value"
            :class="[$style['tm-mode-card'], { [$style.selected]: team.mode === option.value }]"
            @click="team.mode = option.value"
          >
            <span :class="$style['tm-mode-icon']"><i :class="`icon icon-${MODE_ICONS[option.value]}`"></i></span>
            <strong :class="$style['tm-mode-label']">{{ option.label }}</strong>
            <small :class="$style['tm-mode-hint']">{{ option.hint }}</small>
          </button>
        </div>
      </section>

      <section v-else-if="activeStep === 'members'" :class="$style['tm-step']" aria-label="成员">
        <UForm :state="team">
          <UFormField :class="$style['tm-field']" label="选择 Agent" name="members">
            <template #hint><span :class="[$style['tm-member-count'], 'mono', { [$style.invalid]: members.length < MIN_TEAM_MEMBERS || members.length > MAX_TEAM_MEMBERS }]">{{ members.length }} / {{ MAX_TEAM_MEMBERS }}</span></template>
            <div :class="$style['tm-member-picker']">
              <UInput v-model="agentSearch" :class="$style['tm-agent-search']" icon="i-lucide-search" placeholder="搜索 Agent 名称或描述" aria-label="搜索 Agent" />
              <div :class="$style['tm-agent-list']">
                <label
                  v-for="agent in filteredAgents"
                  :key="agent.id"
                  :class="[$style['tm-agent-row'], { [$style.selected]: isMember(agent.id), [$style.disabled]: !agent.is_enabled && !isMember(agent.id) }]"
                >
                  <UCheckbox
                    :model-value="isMember(agent.id)"
                    :disabled="!isMember(agent.id) && (!agent.is_enabled || members.length >= MAX_TEAM_MEMBERS)"
                    :aria-label="`选择 ${agent.name}`"
                    @update:model-value="toggleMember(agent, $event)"
                  />
                  <span :class="$style['tm-agent-glyph']"><i class="icon icon-bot"></i></span>
                  <span :class="$style['tm-agent-main']"><strong>{{ agent.name }}</strong><small>{{ agent.description || '未填写用途描述' }}</small></span>
                  <small :class="$style['tm-agent-state']">{{ agent.is_enabled ? '已启用' : '已停用' }}</small>
                </label>
                <UEmpty v-if="!filteredAgents.length" icon="i-lucide-search-x" title="没有匹配的 Agent" description="调整关键词，或先在 Agents 页创建并启用 Agent。" variant="naked" />
              </div>
            </div>
          </UFormField>
          <UEmpty v-if="!members.length" icon="i-lucide-users-round" title="尚未选择成员" description="先在上方勾选至少两个 Agent。" variant="naked" />
          <ul v-else :class="$style['tm-member-list']" aria-label="已选成员">
            <li v-for="(member, index) in members" :key="member.agentId || `slot-${index}`" :class="[$style['tm-member-row'], { [$style['is-entry']]: team.entryIndex === index }]">
              <span v-if="orderSensitive" :class="[$style['tm-member-index'], 'mono']">{{ String(index + 1).padStart(2, '0') }}</span>
              <strong :class="$style['tm-member-name']">{{ memberLabel(member) }}</strong>
              <UFormField :class="[$style['tm-field'], $style['tm-member-duty']]" :label="`${memberLabel(member)} 的职责`" :name="`duty-${index}`" :aria-label="`${memberLabel(member)} 的职责`">
                <UInput v-model="member.duty" maxlength="64" placeholder="例如：检索历史工单并给出处置建议" />
              </UFormField>
              <span :class="$style['tm-member-entry']">
                <label :class="$style['tm-entry-radio']"><input type="radio" name="team-entry" :checked="team.entryIndex === index" @change="setEntry(index)" /><span>入口</span></label>
                <span v-if="team.entryIndex === index" :class="[$style['tm-entry-badge'], 'mono']">ENTRY</span>
              </span>
              <span :class="$style['tm-member-actions']">
                <template v-if="orderSensitive">
                  <UTooltip text="上移"><UButton :class="$style['tm-icon-button']" icon="i-lucide-arrow-up" color="neutral" variant="ghost" square :disabled="index === 0" :aria-label="`上移 ${memberLabel(member)}`" @click="moveMember(index, index - 1)" /></UTooltip>
                  <UTooltip text="下移"><UButton :class="$style['tm-icon-button']" icon="i-lucide-arrow-down" color="neutral" variant="ghost" square :disabled="index === members.length - 1" :aria-label="`下移 ${memberLabel(member)}`" @click="moveMember(index, index + 1)" /></UTooltip>
                </template>
                <UTooltip text="移除"><UButton :class="$style['tm-icon-button']" icon="i-lucide-x" color="error" variant="ghost" square :aria-label="`移除 ${memberLabel(member)}`" @click="removeMember(index)" /></UTooltip>
              </span>
            </li>
          </ul>
        </UForm>
      </section>

      <section v-else :class="$style['tm-step']" aria-label="运行策略">
        <UForm :class="$style['tm-form-grid']" :state="team">
          <UFormField :class="$style['tm-field']" label="共享上下文" name="sharedContext" help="开启后所有成员共享同一份任务上下文。">
            <USwitch v-model="team.sharedContext" :label="team.sharedContext ? '共享' : '各自独立'" />
          </UFormField>
          <UFormField :class="$style['tm-field']" label="需要人工审批" name="requiresApproval" help="关键步骤执行前需人工确认。">
            <USwitch v-model="team.requiresApproval" :label="team.requiresApproval ? '需要审批' : '无需审批'" />
          </UFormField>
          <UFormField :class="$style['tm-field']" label="并发上限" name="concurrency" :error="fieldError('concurrency')">
            <UInputNumber v-model="team.concurrency" :min="MIN_CONCURRENCY" :max="MAX_CONCURRENCY" :step="1" aria-label="并发上限" />
          </UFormField>
          <UFormField :class="$style['tm-field']" label="超时秒数" name="timeoutSeconds" help="超时后本次运行标记为失败。" :error="fieldError('timeoutSeconds')">
            <UInputNumber v-model="team.timeoutSeconds" :min="MIN_TEAM_TIMEOUT_SECONDS" :max="MAX_TEAM_TIMEOUT_SECONDS" :step="1" aria-label="超时秒数" />
          </UFormField>
        </UForm>
      </section>
    </BuilderSteps>
  </main>
</template>

<style module src="./index.module.css"></style>