<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStickToBottom } from '@/hooks'
import type { WorkbenchApp } from '@/interfaces'
import { useConsoleStore } from '@/stores/console'
import { useTeamsStore } from '@/stores/teams'
import Composer from '../composer/index.vue'
import ConversationMessage from '../conversation-message/index.vue'
import TaskBar from '../task-bar/index.vue'

defineOptions({ name: 'ConversationPane' })

defineProps<{ activeApp?: WorkbenchApp; split: boolean }>()

const { state, sessionTeamId } = useConsoleStore()
const teamsStore = useTeamsStore()

/** 新会话草稿选了 Team：对话区先列出名单，名单成员在第一条消息发出后才在右栏出现。 */
const draftTeam = computed(() => {
  if (/^\d+$/.test(state.activeSessionId)) return null
  const teamId = sessionTeamId(state.activeSessionId)
  return teamId == null ? null : teamsStore.state.items.find((team) => team.id === teamId) ?? null
})
const scroller = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
useStickToBottom(scroller, inner)
</script>

<template>
  <section :class="[$style['conversation-pane'], { [$style.split]: split }]" aria-label="对话">
    <div ref="scroller" :class="$style['conv-scroll']" role="log" aria-live="polite" :aria-busy="state.busy">
      <div ref="inner" :class="$style['conv-inner']">
        <div v-if="!state.messages.length && draftTeam" :class="[$style['conversation-empty'], $style['team-draft']]" role="status">
          <span :class="$style['empty-mark']" aria-hidden="true"><i class="icon icon-users-round"></i></span>
          <h2>{{ draftTeam.name }}</h2>
          <ul :class="$style.roster" aria-label="Team 成员">
            <li v-for="member in draftTeam.members" :key="member.name">
              <strong>{{ member.name }}</strong>
              <span>{{ member.role }}</span>
              <small :class="{ [$style.missing]: member.agent_name === null }">{{ member.agent_name ?? 'Agent 已删除' }}</small>
            </li>
          </ul>
          <p>给主 Agent 发消息，由它分派任务</p>
        </div>
        <div v-else-if="!state.messages.length" :class="$style['conversation-empty']" role="status">
          <span :class="$style['empty-mark']" aria-hidden="true"><i class="icon icon-hexagon"></i></span>
          <h2>{{ activeApp ? '等待制造任务' : '新对话' }}</h2>
          <p>{{ activeApp ? `${activeApp.subject} · ${activeApp.team}` : 'CONVERSATION READY' }}</p>
        </div>
        <ConversationMessage
          v-for="message in state.messages"
          :key="message.id"
          :message="message"
          :busy="state.busy"
        />
      </div>
    </div>
    <TaskBar />
    <Composer />
  </section>
</template>

<style module src="./index.module.css"></style>
