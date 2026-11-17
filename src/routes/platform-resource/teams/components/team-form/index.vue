<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ActionIconButton } from '@/components'
import { focusFirstError } from '@/hooks/useFormHelpers'
import { emptyTeamMember, suggestMemberName, teamSaveErrorRows } from '@/hooks/useTeamEditor'
import {
  MAX_TEAM_MEMBER_NAME_LENGTH,
  MAX_TEAM_MEMBER_ROLE_LENGTH,
  MAX_TEAM_NAME_LENGTH,
  type TeamFormModel,
  type TeamMemberField,
  type TeamValidationIssue,
} from '@/interfaces/team-definition/model'
import { useAgentsStore } from '@/stores/agents'
import type { TeamSaveError } from '@/stores/teams'

/** 新建 / 编辑共用的 Team 表单：页头操作 + 基本信息、成员两组。 */
defineOptions({ name: 'TeamForm' })

const props = defineProps<{
  team: TeamFormModel
  title: string
  issues: TeamValidationIssue[]
  saving: boolean
  loading?: boolean
  /** 后端保存失败的定位信息，message 显示在表单顶部。 */
  saveError?: TeamSaveError | null
}>()
const emit = defineEmits<{ close: []; save: [] }>()

const agentsStore = useAgentsStore()
const rootRef = ref<HTMLElement | null>(null)
/** 点过保存后才标红字段、列出问题。 */
const attempted = ref(false)

interface AgentOption {
  value: number
  label: string
}

/** 本工作区自建 Agent；停用的也能选，名称后标出，建会话时后端会拒绝。 */
const agentItems = computed<AgentOption[]>(() => {
  const items: AgentOption[] = agentsStore.state.items.map((agent) => ({
    value: agent.id,
    label: agent.is_enabled ? agent.name : `${agent.name}（已停用）`,
  }))
  // Agent 列表还没加载到、但成员行带着名称时补一项，下拉框能显示当前选择。
  for (const member of props.team.members) {
    if (member.agentId != null && member.agentName != null && !items.some((item) => item.value === member.agentId)) {
      items.push({ value: member.agentId, label: member.agentName })
    }
  }
  return items
})

const nameError = computed(() => {
  if (attempted.value) {
    const issue = props.issues.find((item) => item.field === 'name')
    if (issue) return issue.message
  }
  // 后端的名称错误（如重名）文字在顶部，这里只标红。
  return props.saveError?.field === 'name' ? true : undefined
})

/** 成员相关的问题文字集中列在名单上方，控件只标红。 */
const memberMessages = computed(() => attempted.value ? props.issues.filter((issue) => issue.field === 'members').map((issue) => issue.message) : [])

const backendRows = computed(() => new Set(teamSaveErrorRows(props.saveError ?? null, props.team)))

function fieldInvalid(index: number, field: TeamMemberField): boolean {
  if (attempted.value && props.issues.some((issue) => issue.memberIndex === index && issue.memberField === field)) return true
  if (!backendRows.value.has(index)) return false
  const member = props.team.members[index]!
  const error = props.saveError!
  // 后端能定位到列时只标那一列，只有下标时整行标红。
  if (error.agentIds.length || error.memberNames.length) {
    if (field === 'agent') return member.agentId != null && error.agentIds.includes(member.agentId)
    if (field === 'name') return error.memberNames.includes(member.name.trim())
    return false
  }
  return true
}

function agentPlaceholder(index: number) {
  const member = props.team.members[index]!
  return member.agentId != null && member.agentName == null ? 'Agent 已删除，请重新选择' : '选择 Agent'
}

function onAgentChange(index: number, value: unknown) {
  const member = props.team.members[index]
  if (!member) return
  const agentId = typeof value === 'number' ? value : null
  const agent = agentsStore.state.items.find((item) => item.id === agentId)
  member.agentId = agentId
  member.agentName = agent?.name ?? null
  if (agent && !member.name.trim()) {
    const taken = props.team.members.filter((_, other) => other !== index).map((other) => other.name)
    member.name = suggestMemberName(agent.name, taken)
  }
}

function addMember() {
  props.team.members.push(emptyTeamMember())
}

function removeMember(index: number) {
  props.team.members.splice(index, 1)
}

async function onSave() {
  if (props.saving || props.loading) return
  attempted.value = true
  if (props.issues.length) {
    await nextTick()
    if (rootRef.value) focusFirstError(rootRef.value)
    return
  }
  emit('save')
}

/** 焦点在弹窗或下拉浮层里时，Esc 交给浮层自己关闭。 */
function inOverlay(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[role="dialog"], [data-reka-popper-content-wrapper]'))
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !event.defaultPrevented && !inOverlay(event.target)) emit('close')
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void onSave()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  if (!agentsStore.state.items.length && !agentsStore.state.loading) void agentsStore.loadAgents()
})
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <main ref="rootRef" :class="$style.page">
    <div :class="$style.inner">
      <header :class="$style.header">
        <ActionIconButton label="返回" icon="i-lucide-arrow-left" @click="emit('close')" />
        <h1 :class="$style.title">{{ title }}</h1>
        <div :class="$style.actions">
          <UButton label="保存" color="primary" :loading="saving" :disabled="saving || loading" @click="onSave" />
        </div>
      </header>

      <UAlert v-if="saveError" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="saveError.message" role="alert" />

      <div v-if="loading" :class="$style.skeletons" aria-busy="true">
        <USkeleton v-for="n in 2" :key="n" :class="$style.skeleton" />
      </div>

      <template v-else>
        <section :class="$style.group">
          <h2 :class="$style.groupTitle">基本信息</h2>
          <div :class="$style.card">
            <div :class="[$style.cardBody, $style.formGrid]">
              <UFormField label="名称" name="name" required :error="nameError">
                <UInput v-model="team.name" class="w-full" :maxlength="MAX_TEAM_NAME_LENGTH" autocomplete="off" />
              </UFormField>
              <UFormField label="启用" name="isEnabled">
                <USwitch v-model="team.isEnabled" :class="$style.switch" :aria-label="team.isEnabled ? '已启用' : '已停用'" />
              </UFormField>
              <UFormField label="描述" name="description" :class="$style.span2">
                <UTextarea v-model="team.description" class="w-full" :rows="2" autoresize :maxrows="6" />
              </UFormField>
            </div>
          </div>
        </section>

        <section :class="$style.group">
          <h2 :class="$style.groupTitle">成员<span :class="$style.count">{{ team.members.length }}</span></h2>
          <UAlert
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            title="会话的主 Agent 担任 lead，不在名单里；成员间发消息协作。"
            description="新建会话时按名单建好成员，之后改 Team 不影响已有会话。"
          />
          <ul v-if="memberMessages.length" :class="$style.issues" role="alert">
            <li v-for="message in memberMessages" :key="message">{{ message }}</li>
          </ul>
          <div :class="$style.card">
            <div :class="[$style.cardBody, $style.formGrid, $style.members]">
              <div v-if="team.members.length" :class="[$style.memberRow, $style.memberHead]" aria-hidden="true">
                <span>成员名</span>
                <span>角色</span>
                <span>Agent</span>
                <span></span>
              </div>
              <div v-for="(member, index) in team.members" :key="member.key" :class="$style.memberRow">
                <UInput
                  v-model="member.name"
                  :class="['w-full', 'mono']"
                  :maxlength="MAX_TEAM_MEMBER_NAME_LENGTH"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="如 writer"
                  :color="fieldInvalid(index, 'name') ? 'error' : undefined"
                  :highlight="fieldInvalid(index, 'name')"
                  :aria-invalid="fieldInvalid(index, 'name') || undefined"
                  :aria-label="`第 ${index + 1} 个成员的成员名`"
                />
                <UInput
                  v-model="member.role"
                  class="w-full"
                  :maxlength="MAX_TEAM_MEMBER_ROLE_LENGTH"
                  autocomplete="off"
                  placeholder="如 撰写初稿"
                  :color="fieldInvalid(index, 'role') ? 'error' : undefined"
                  :highlight="fieldInvalid(index, 'role')"
                  :aria-invalid="fieldInvalid(index, 'role') || undefined"
                  :aria-label="`第 ${index + 1} 个成员的角色`"
                />
                <USelectMenu
                  :model-value="member.agentId ?? undefined"
                  :items="agentItems"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                  :placeholder="agentPlaceholder(index)"
                  :search-input="{ placeholder: '搜索 Agent' }"
                  :loading="agentsStore.state.loading"
                  :color="fieldInvalid(index, 'agent') ? 'error' : undefined"
                  :highlight="fieldInvalid(index, 'agent')"
                  :aria-invalid="fieldInvalid(index, 'agent') || undefined"
                  :aria-label="`第 ${index + 1} 个成员的 Agent`"
                  @update:model-value="(value: unknown) => onAgentChange(index, value)"
                />
                <ActionIconButton label="移除成员" icon="i-lucide-x" @click="removeMember(index)" />
              </div>
              <UButton icon="i-lucide-plus" label="添加成员" color="neutral" variant="ghost" size="sm" :class="$style.addMember" @click="addMember" />
            </div>
          </div>
        </section>
      </template>
    </div>
  </main>
</template>

<style module src="./index.module.css"></style>
