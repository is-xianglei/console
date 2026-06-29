<script setup lang="ts">
import { computed } from 'vue'
import { useConsoleStore } from '../../stores/console'
import AgentCard from './AgentCard.vue'
import AgentDetail from './AgentDetail.vue'

const { state, selectAgent } = useConsoleStore()

const activeCount = computed(
  () => state.agents.filter((a) => a.status === 'think' || a.status === 'run').length,
)
const selected = computed(
  () => state.agents.find((a) => a.id === state.selectedAgentId) ?? null,
)
</script>

<template>
  <aside class="right-bar">
    <div class="right-head">
      <svg class="hx" viewBox="0 0 20 22" fill="none">
        <path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" />
      </svg>
      <span class="sec-head head-title">子代理舰队</span>
      <span class="right-head-badge">{{ activeCount }} ACTIVE</span>
    </div>

    <div class="agent-roster">
      <AgentCard
        v-for="a in state.agents"
        :key="a.id"
        :agent="a"
        :selected="a.id === state.selectedAgentId"
        @select="selectAgent(a.id)"
      />
      <div v-if="!state.agents.length" class="roster-empty mono">
        暂无派发的子代理<br />派发任务后将在此实时显示
      </div>
    </div>

    <AgentDetail :agent="selected" />
  </aside>
</template>

<style scoped>
.right-bar {
  width: var(--right-bar-w);
  flex-shrink: 0;
  background: var(--bg-panel);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.right-head {
  height: 42px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 14px;
}
.right-head .hx {
  width: 13px;
  height: 13px;
  color: var(--accent-agent);
}
.head-title {
  color: var(--text-secondary);
}
.right-head-badge {
  margin-left: auto;
  font-family: var(--font-data);
  font-size: 9px;
  font-weight: 700;
  background: var(--accent-agent-dim);
  color: var(--accent-agent);
  padding: 1px 7px;
  border-radius: var(--radius-pill);
}
.agent-roster {
  flex-shrink: 0;
  max-height: 46%;
  overflow-y: auto;
  padding: 10px 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.roster-empty {
  padding: 16px 10px;
  font-size: 10px;
  color: var(--text-dim);
  text-align: center;
  line-height: 1.7;
}
</style>
