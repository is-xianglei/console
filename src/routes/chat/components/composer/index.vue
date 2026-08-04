<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useAuthStore } from '@/stores/auth'
import { useConsoleStore } from '@/stores/console'

defineOptions({ name: 'ChatComposer' })

const consoleStore = useConsoleStore()
const agentsStore = useAgentsStore()
const authStore = useAuthStore()
const { state, dispatch, setNewSessionAgent } = consoleStore
const DEFAULT_AGENT_VALUE = 'default'
const text = ref('')
const selectedAgentId = ref(DEFAULT_AGENT_VALUE)
const activeSession = computed(() => state.sessions.find((session) => session.id === state.activeSessionId))
const persistedSession = computed(() => /^\d+$/.test(state.activeSessionId))
const agentItems = computed(() => [
  { value: DEFAULT_AGENT_VALUE, label: '平台默认 Agent' },
  ...agentsStore.state.items.map((agent) => ({
    value: String(agent.id),
    label: agent.is_enabled ? agent.name : `${agent.name}（已停用）`,
    disabled: !agent.is_enabled,
  })),
])

watch(
  () => [state.activeSessionId, activeSession.value?.agentId, state.newSessionAgentId] as const,
  () => {
    const agentId = activeSession.value?.agentId ?? state.newSessionAgentId
    selectedAgentId.value = agentId
      ? String(agentId)
      : DEFAULT_AGENT_VALUE
  },
  { immediate: true },
)

watch(selectedAgentId, (value) => {
  setNewSessionAgent(value === DEFAULT_AGENT_VALUE ? null : Number(value))
})

watch(
  () => authStore.currentWorkspaceId,
  (workspaceId) => { if (workspaceId) void agentsStore.loadAgents() },
  { immediate: true },
)

function send() {
  const value = text.value
  if (!value.trim() || state.busy) return
  if (!dispatch(value)) return
  text.value = ''
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    send()
  }
}
</script>

<template>
  <div :class="$style.composer">
    <div :class="$style['composer-inner']">
      <div :class="$style['composer-box']">
        <UTextarea v-model="text" :class="$style['composer-input']" :rows="1" autoresize :maxrows="6" variant="none" aria-label="描述任务或提出问题" placeholder="描述任务或提出问题…" @keydown="onKey" />
        <div :class="$style['composer-bar']">
          <div :class="$style['bar-tools']">
            <USelect v-model="selectedAgentId" :class="$style['agent-select']" :items="agentItems" icon="i-lucide-bot" value-key="value" label-key="label" :disabled="persistedSession || state.busy" :loading="agentsStore.state.loading" aria-label="选择新会话 Agent" />
          </div>
          <div :class="$style['bar-actions']">
            <UButton icon="i-lucide-arrow-up" square :class="$style['run-btn']" :loading="state.busy" :disabled="!text.trim()" aria-label="发送消息" @click="send" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style module src="./index.module.css"></style>
