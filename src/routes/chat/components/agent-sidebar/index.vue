<script setup lang="ts">
import { computed } from 'vue'
import { useConsoleStore } from '@/stores/console'
import AgentCard from '../agent-card/index.vue'
import AgentDetail from '../agent-detail/index.vue'

defineOptions({ name: 'AgentSidebar' })

const { state, selectAgent } = useConsoleStore()

const activeCount = computed(
  () => state.agents.filter((a) => a.status === 'think' || a.status === 'run').length,
)
const selected = computed(
  () => state.agents.find((a) => a.id === state.selectedAgentId) ?? null,
)
</script>

<template>
  <aside :class="$style['right-bar']">
    <div :class="$style['right-head']">
      <svg :class="$style['hx']" viewBox="0 0 20 22" fill="none">
        <path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" />
      </svg>
      <span :class="[$style['head-title'], 'sec-head']">子代理舰队</span>
      <span :class="$style['right-head-badge']">{{ activeCount }} ACTIVE</span>
    </div>

    <div :class="$style['agent-roster']">
      <AgentCard
        v-for="a in state.agents"
        :key="a.id"
        :agent="a"
        :selected="a.id === state.selectedAgentId"
        @select="selectAgent(a.id)"
      />
      <div v-if="!state.agents.length" :class="[$style['roster-empty'], 'mono']">
        暂无派发的子代理<br />派发任务后将在此实时显示
      </div>
    </div>

    <AgentDetail :agent="selected" />
  </aside>
</template>

<style module src="./index.module.css"></style>
