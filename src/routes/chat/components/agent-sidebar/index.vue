<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useConsoleStore } from '@/stores/console'
import { useTeamRuntimeStore } from '@/stores/team-runtime'
import { useTeamsStore } from '@/stores/teams'
import { latestActivation, memberDisplayStatus } from '@/utils/team-runtime'
import AgentCard from '../agent-card/index.vue'
import AgentDetail from '../agent-detail/index.vue'
import TeamMessageTimeline from '../team-message-timeline/index.vue'
import TeammateCard from '../teammate-card/index.vue'

/**
 * 右栏：有队友时分「成员 | 消息」两个标签。成员标签里是队友（按成员名，跨激活保留）和 Agent 工具派出的子代理，
 * 点卡片在下方看输出；消息标签是团队消息时间线。没有队友时保持原来的子代理舰队。
 */
defineOptions({ name: 'AgentSidebar' })

const consoleStore = useConsoleStore()
const { state, selectAgent } = consoleStore
const teamRuntime = useTeamRuntimeStore()
const teamsStore = useTeamsStore()
const agentsStore = useAgentsStore()

type SidebarTab = 'members' | 'messages'
const tab = ref<SidebarTab>('members')
/** 手动选中的队友成员名；'' 表示手动选了子代理，null 表示还没选过（默认看队友）。 */
const selectedMember = ref<string | null>(null)

const teamId = computed(() => consoleStore.sessionTeamId(state.activeSessionId))
const showTeam = computed(() => teamRuntime.hasTeam || teamId.value != null)

watch(teamId, (id) => { if (id != null) void teamsStore.resolveTeamName(id) }, { immediate: true })
watch(() => state.activeSessionId, () => {
  selectedMember.value = null
  tab.value = 'members'
})

const title = computed(() => {
  if (teamId.value != null) {
    const name = teamsStore.teamName(teamId.value)
    return name === null ? 'Team 已删除' : name ?? 'Team'
  }
  return showTeam.value ? '团队' : '子代理舰队'
})

const teammates = computed(() => teamRuntime.state.members.map((member) => {
  const activation = latestActivation(member, teamRuntime.state.activations)
  const agentName = member.agent_id != null
    ? agentsStore.state.items.find((agent) => agent.id === member.agent_id)?.name ?? `Agent #${member.agent_id}`
    : member.agent_type
  return { member, agentName, status: memberDisplayStatus(member, activation) }
}))
const allIdle = computed(() => teammates.value.length > 0 && teammates.value.every((item) => item.member.status === 'idle'))

const activeCount = computed(() =>
  teammates.value.filter((item) => item.status.tone === 'running').length
  + state.agents.filter((agent) => agent.status === 'think' || agent.status === 'run').length,
)

const tabItems = computed(() => [
  { value: 'members', label: '成员' },
  { value: 'messages', label: teamRuntime.state.messages.length ? `消息 ${teamRuntime.state.messages.length}` : '消息' },
])

/** 手动选了谁就看谁；没选过时优先看运行中的队友，再看第一个队友，没有队友才看子代理。 */
const effectiveMember = computed(() => {
  const chosen = selectedMember.value ? teammates.value.find((item) => item.member.name === selectedMember.value) : undefined
  if (chosen) return chosen
  const subagentSelected = state.selectedAgentId != null && state.agents.some((agent) => agent.id === state.selectedAgentId)
  if (selectedMember.value === '' && subagentSelected) return null
  return teammates.value.find((item) => item.status.tone === 'running') ?? teammates.value[0] ?? null
})

const selectedSubagent = computed(() =>
  effectiveMember.value ? null : state.agents.find((agent) => agent.id === state.selectedAgentId) ?? null,
)

const detailAgent = computed(() => {
  const member = effectiveMember.value
  if (!member) return selectedSubagent.value
  return teamRuntime.state.panels.find((panel) => panel.id === member.member.name) ?? null
})

const detailTiles = computed(() => {
  const member = effectiveMember.value
  if (!member) return undefined
  return [
    { label: '状态', value: member.status.label, accent: true },
    { label: '角色', value: member.member.role },
    { label: 'Agent', value: member.agentName ?? '—' },
    { label: '事件', value: String(detailAgent.value?.stream.length ?? 0) },
  ]
})

function onSelectTeammate(name: string) {
  selectedMember.value = name
}

function onSelectSubagent(id: string) {
  // 用空串表示「明确选了子代理」，和「还没选过」（null）区分开。
  selectedMember.value = ''
  selectAgent(id)
}
</script>

<template>
  <aside :class="$style['right-bar']">
    <div :class="$style['right-head']">
      <template v-if="showTeam">
        <i :class="[$style['team-icon'], 'icon icon-users-round']"></i>
        <span :class="$style['team-title']" :title="title">{{ title }}</span>
        <UTabs
          v-model="tab"
          :class="$style.tabs"
          :items="tabItems"
          :content="false"
          variant="pill"
          size="xs"
          aria-label="团队视图"
        />
      </template>
      <template v-else>
        <svg :class="$style['hx']" viewBox="0 0 20 22" fill="none">
          <path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" />
        </svg>
        <span :class="[$style['head-title'], 'sec-head']">子代理舰队</span>
        <span :class="$style['right-head-badge']">{{ activeCount }} ACTIVE</span>
      </template>
    </div>

    <template v-if="!showTeam || tab === 'members'">
      <div :class="$style['agent-roster']">
        <template v-if="showTeam">
          <p v-if="allIdle" :class="$style['roster-hint']">给主 Agent 发消息，由它分派任务</p>
          <div v-if="teammates.length" :class="$style['group-label']">队友 {{ teammates.length }}</div>
          <TeammateCard
            v-for="item in teammates"
            :key="item.member.id"
            :name="item.member.name"
            :role="item.member.role"
            :agent-name="item.agentName"
            :status="item.status"
            :selected="effectiveMember?.member.id === item.member.id"
            @select="onSelectTeammate(item.member.name)"
          />
          <div v-if="state.agents.length" :class="$style['group-label']">子代理 {{ state.agents.length }}</div>
        </template>
        <AgentCard
          v-for="a in state.agents"
          :key="a.id"
          :agent="a"
          :selected="!effectiveMember && a.id === state.selectedAgentId"
          @select="onSelectSubagent(a.id)"
        />
        <div v-if="!state.agents.length && !teammates.length" :class="[$style['roster-empty'], 'mono']">
          暂无派发的子代理<br />派发任务后将在此实时显示
        </div>
      </div>

      <AgentDetail
        :agent="detailAgent"
        :tiles="detailTiles"
        :notice="effectiveMember?.status.error"
        :empty-text="showTeam ? '选中一个成员以查看它最近一次的推理、回答与工具调用' : undefined"
      />
    </template>

    <div v-else :class="$style['message-pane']">
      <TeamMessageTimeline :messages="teamRuntime.state.messages" />
    </div>
  </aside>
</template>

<style module src="./index.module.css"></style>
