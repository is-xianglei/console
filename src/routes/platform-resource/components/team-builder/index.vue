<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { FormError } from '@nuxt/ui'
import type { AgentResponse } from '@/interfaces/agent/api'
import {
  MAX_CONCURRENCY,
  MAX_TEAM_MEMBERS,
  MIN_CONCURRENCY,
  MIN_TEAM_MEMBERS,
  TEAM_MODE_OPTIONS,
  type TeamFormModel,
  type TeamValidationIssue,
} from '@/interfaces/platform-team/model'
import { focusFirstError } from '@/hooks/useFormHelpers'
import { useAgentsStore } from '@/stores/agents'

defineOptions({ name: 'TeamBuilder' })

const props = defineProps<{
  team: TeamFormModel
  mode: 'create' | 'edit'
  issues: TeamValidationIssue[]
  saving: boolean
  error?: string
}>()
const emit = defineEmits<{ close: []; save: []; publish: [] }>()

const agentsStore = useAgentsStore()
const saveAttempted = ref(false)
const builderRoot = ref<HTMLElement | null>(null)
const agentSearch = ref('')

/** 成员数组可能因外部草稿被清空而缺失，统一走这个安全视图。 */
const members = computed(() => props.team.members ?? [])

/**
 * 把校验问题映射到 UFormField 的 name 上：错误落到对应字段下方。
 * 容器级问题（成员数量、入口未指定）挂到成员区，运行策略统一挂并发字段。
 */
const formErrors = computed<FormError[]>(() =>
  props.issues.map((issue) => {
    let name: string
    if (issue.section === 'basic') name = 'name'
    else if (issue.section === 'members') name = 'members'
    else name = issue.message.includes('超时') ? 'timeoutSeconds' : 'concurrency'
    return { name, message: issue.message }
  }),
)

/** 分区标签固定在组件内维护，与 TeamValidationIssue.section 一一对应。 */
const SECTION_LABELS: Record<TeamValidationIssue['section'], string> = {
  basic: '基本信息',
  members: '成员 Agent',
  runtime: '运行策略',
}
const groupedIssues = computed(() =>
  (['basic', 'members', 'runtime'] as const)
    .map((section) => ({
      section,
      label: SECTION_LABELS[section],
      messages: props.issues.filter((issue) => issue.section === section).map((issue) => issue.message),
    }))
    .filter((group) => group.messages.length > 0),
)

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
    [agent.id, agent.name, agent.description ?? ''].join(' ').toLowerCase().includes(query),
  )
})

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

/** section → 分区标题节点 id；容器级问题（无字段可标记）滚到分区标题。 */
const SECTION_ANCHOR: Record<TeamValidationIssue['section'], string> = {
  basic: 'team-basic-title',
  members: 'team-members-title',
  runtime: 'team-runtime-title',
}

function focusIssueSection(section: TeamValidationIssue['section']) {
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

async function onPublish() {
  saveAttempted.value = true
  if (props.issues.length) {
    await nextTick()
    focusIssueSection(props.issues[0]!.section)
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
      <div :class="$style['tm-builder-title']"><nav><span>构建资源</span><i class="icon icon-chevron-right"></i><strong>智能体编排</strong><i class="icon icon-chevron-right"></i><strong>{{ mode === 'create' ? '创建 Team' : team.name }}</strong></nav><h1>{{ mode === 'create' ? '创建 Team' : '编辑 Team' }}<span class="mono">LOCAL DRAFT</span></h1></div>
      <div :class="$style['tm-builder-actions']"><UButton :class="$style['tm-secondary-button']" icon="i-lucide-save" color="neutral" variant="outline" label="保存草稿" :loading="saving" :disabled="saving" @click="onSave" /><UButton :class="$style['tm-primary-button']" icon="i-lucide-circle-check-big" label="保存并启用" :loading="saving" :disabled="saving" @click="onPublish" /></div>
    </header>
    <UAlert v-if="error" :class="$style['tm-validation-banner']" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
    <UAlert v-else-if="saveAttempted && issues.length" :class="$style['tm-validation-banner']" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="`共 ${issues.length} 处问题，已定位并滚动到首个错误字段。`" />

    <div :class="$style['tm-builder-body']">
      <UForm :class="$style['tm-builder-form']" :state="team" :validate="() => formErrors">
      <section :class="$style['tm-section']" aria-labelledby="team-basic-title">
        <header :class="$style['tm-section-head']">
          <span :class="$style['tm-section-icon']"><i class="icon icon-id-card"></i></span>
          <div><span>01</span><h2 id="team-basic-title">基本信息</h2><p>设置 Team 名称、运行状态和用途描述；名称用于列表与详情页展示。</p></div>
        </header>
        <div :class="$style['tm-form-grid']">
          <UFormField :class="$style['tm-field']" label="名称" name="name" required>
            <UInput v-model="team.name" autocomplete="off" maxlength="40" placeholder="例如：故障诊断协作组" />
          </UFormField>
          <UFormField :class="$style['tm-field']" label="运行状态" name="status" help="停用后该 Team 不会接收新任务。">
            <USwitch :model-value="team.status === 'nominal'" :label="team.status === 'nominal' ? '已启用' : '未启用'" @update:model-value="(value: boolean) => { team.status = value ? 'nominal' : 'idle' }" />
          </UFormField>
          <UFormField :class="[$style['tm-field'], $style['tm-span-2']]" label="用途描述" name="description">
            <UTextarea v-model="team.description" :rows="3" autoresize :maxrows="6" placeholder="说明该 Team 解决什么场景，帮助会话选择合适的编排。" />
          </UFormField>
        </div>
      </section>

      <section :class="$style['tm-section']" aria-labelledby="team-mode-title">
        <header :class="$style['tm-section-head']">
          <span :class="$style['tm-section-icon']"><i class="icon icon-workflow"></i></span>
          <div><span>02</span><h2 id="team-mode-title">编排模式</h2><p>决定成员 Agent 之间如何分派任务与交接结果。</p></div>
        </header>
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
            <span :class="$style['tm-mode-main']"><strong>{{ option.label }}</strong><small class="mono">{{ option.value.toUpperCase() }}</small></span>
            <small :class="$style['tm-mode-hint']">{{ option.hint }}</small>
          </button>
        </div>
      </section>

      <section :class="$style['tm-section']" aria-labelledby="team-members-title">
        <header :class="$style['tm-section-head']">
          <span :class="$style['tm-section-icon']"><i class="icon icon-users-round"></i></span>
          <div><span>03</span><h2 id="team-members-title">成员 Agent</h2><p>从当前工作区勾选 {{ MIN_TEAM_MEMBERS }}-{{ MAX_TEAM_MEMBERS }} 个已启用的 Agent，同一 Agent 不能重复加入。</p></div>
          <span :class="[$style['tm-member-count'], 'mono', { [$style.invalid]: members.length < MIN_TEAM_MEMBERS || members.length > MAX_TEAM_MEMBERS }]">{{ members.length }} / {{ MAX_TEAM_MEMBERS }}</span>
        </header>
        <UFormField :class="$style['tm-field']" label="选择 Agent" name="members" help="停用的 Agent 不可加入；已加入的成员即使被停用也可移除。">
          <div :class="$style['tm-member-picker']">
            <UInput v-model="agentSearch" :class="$style['tm-agent-search']" icon="i-lucide-search" placeholder="搜索 Agent 名称、ID 或描述" aria-label="搜索 Agent" />
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
                <span :class="$style['tm-agent-meta']"><strong class="mono">AGT-{{ String(agent.id).padStart(4, '0') }}</strong><small>{{ agent.is_enabled ? '已启用' : '已停用' }}</small></span>
              </label>
              <UEmpty v-if="!filteredAgents.length" icon="i-lucide-search-x" title="没有匹配的 Agent" description="调整关键词，或先在 Agents 页创建并启用 Agent。" variant="naked" />
            </div>
          </div>
        </UFormField>
        <UEmpty v-if="!members.length" icon="i-lucide-users-round" title="尚未选择成员" description="先在上方勾选至少两个 Agent。" variant="naked" />
        <ul v-else :class="$style['tm-member-list']" aria-label="已选成员">
          <li v-for="(member, index) in members" :key="member.agentId" :class="[$style['tm-member-row'], { [$style['is-entry']]: team.entryIndex === index }]">
            <span :class="[$style['tm-member-index'], 'mono']">{{ String(index + 1).padStart(2, '0') }}</span>
            <span :class="$style['tm-member-main']"><strong>{{ member.agentName }}</strong><small class="mono">AGT-{{ member.agentId }}</small></span>
            <UFormField :class="[$style['tm-field'], $style['tm-member-duty']]" :label="`${member.agentName} 的职责`" :name="`duty-${index}`" :aria-label="`${member.agentName} 的职责`">
              <UInput v-model="member.duty" maxlength="64" placeholder="例如：检索历史工单并给出处置建议" />
            </UFormField>
            <span :class="$style['tm-member-entry']">
              <label :class="$style['tm-entry-radio']"><input type="radio" name="team-entry" :checked="team.entryIndex === index" @change="setEntry(index)" /><span>入口</span></label>
              <span v-if="team.entryIndex === index" :class="[$style['tm-entry-badge'], 'mono']">ENTRY</span>
            </span>
            <span :class="$style['tm-member-actions']">
              <UTooltip text="上移"><UButton :class="$style['tm-icon-button']" icon="i-lucide-arrow-up" color="neutral" variant="ghost" square :disabled="index === 0" :aria-label="`上移 ${member.agentName}`" @click="moveMember(index, index - 1)" /></UTooltip>
              <UTooltip text="下移"><UButton :class="$style['tm-icon-button']" icon="i-lucide-arrow-down" color="neutral" variant="ghost" square :disabled="index === members.length - 1" :aria-label="`下移 ${member.agentName}`" @click="moveMember(index, index + 1)" /></UTooltip>
              <UTooltip text="移除"><UButton :class="$style['tm-icon-button']" icon="i-lucide-x" color="error" variant="ghost" square :aria-label="`移除 ${member.agentName}`" @click="removeMember(index)" /></UTooltip>
            </span>
          </li>
        </ul>
      </section>

      <section :class="$style['tm-section']" aria-labelledby="team-runtime-title">
        <header :class="$style['tm-section-head']">
          <span :class="$style['tm-section-icon']"><i class="icon icon-gauge"></i></span>
          <div><span>04</span><h2 id="team-runtime-title">运行策略</h2><p>控制成员之间的上下文共享、人工审批节点，以及单次运行的并发与超时上限。</p></div>
        </header>
        <div :class="$style['tm-form-grid']">
          <UFormField :class="$style['tm-field']" label="共享上下文" name="sharedContext" help="开启后所有成员共享同一份任务上下文。">
            <USwitch v-model="team.sharedContext" :label="team.sharedContext ? '共享' : '各自独立'" />
          </UFormField>
          <UFormField :class="$style['tm-field']" label="需要人工审批" name="requiresApproval" help="关键步骤执行前需人工确认。">
            <USwitch v-model="team.requiresApproval" :label="team.requiresApproval ? '需要审批' : '无需审批'" />
          </UFormField>
          <UFormField :class="$style['tm-field']" label="并发上限" name="concurrency" :help="`${MIN_CONCURRENCY}-${MAX_CONCURRENCY} 之间的整数。`">
            <UInputNumber v-model="team.concurrency" :min="MIN_CONCURRENCY" :max="MAX_CONCURRENCY" :step="1" aria-label="并发上限" />
          </UFormField>
          <UFormField :class="$style['tm-field']" label="超时秒数" name="timeoutSeconds" help="10-600 秒，超时后本次运行标记为失败。">
            <UInputNumber v-model="team.timeoutSeconds" :min="10" :max="600" :step="1" aria-label="超时秒数" />
          </UFormField>
        </div>
      </section>

      <section :class="$style['tm-section']" aria-labelledby="team-review-title">
        <header :class="$style['tm-section-head']">
          <span :class="$style['tm-section-icon']"><i class="icon icon-circle-check-big"></i></span>
          <div><span>05</span><h2 id="team-review-title">检查与保存</h2><p>按区块处理校验问题后保存；保存并启用会立即把该 Team 标记为正常状态。</p></div>
        </header>
        <div v-if="groupedIssues.length" :class="$style['tm-issue-groups']" aria-label="校验问题列表">
          <div v-for="group in groupedIssues" :key="group.section" :class="$style['tm-issue-group']">
            <strong>{{ group.label }}</strong>
            <ul><li v-for="(message, messageIndex) in group.messages" :key="messageIndex"><i class="icon icon-triangle-alert"></i>{{ message }}</li></ul>
          </div>
        </div>
        <div v-else :class="$style['tm-issue-clear']"><i class="icon icon-circle-check-big"></i>校验通过，可以保存。</div>
        <footer :class="$style['tm-builder-footer']">
          <UButton :class="$style['tm-secondary-button']" icon="i-lucide-save" color="neutral" variant="outline" label="保存草稿" :loading="saving" :disabled="saving" @click="onSave" />
          <UButton :class="$style['tm-primary-button']" icon="i-lucide-circle-check-big" label="保存并启用" :loading="saving" :disabled="saving" @click="onPublish" />
        </footer>
      </section>
      </UForm>
    </div>
  </main>
</template>

<style module src="./index.module.css"></style>
