<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SelectItem } from '@nuxt/ui'
import { PLAN_MODE_LABEL } from '@/hooks/useOrchestrationPlanManager'
import type { PlanResponse } from '@/interfaces/orchestration-plan/api'
import { useAgentsStore } from '@/stores/agents'
import { useAuthStore } from '@/stores/auth'
import { useConsoleStore } from '@/stores/console'
import { useOrchestrationPlansStore } from '@/stores/orchestrationPlans'

defineOptions({ name: 'ChatComposer' })

const consoleStore = useConsoleStore()
const agentsStore = useAgentsStore()
const plansStore = useOrchestrationPlansStore()
const authStore = useAuthStore()
const { state, dispatch, setNewSessionAgent, setNewSessionPlan } = consoleStore
/** 单个下拉同时承载两种运行目标，用前缀区分；后端二者互斥（同时传 409）。 */
const DEFAULT_TARGET = 'default'
const AGENT_PREFIX = 'agent:'
const PLAN_PREFIX = 'plan:'
const text = ref('')
const selectedTarget = ref(DEFAULT_TARGET)
const activeSession = computed(() => state.sessions.find((session) => session.id === state.activeSessionId))
const persistedSession = computed(() => /^\d+$/.test(state.activeSessionId))

/** 方案可运行的前提：自身启用且全部成员 Agent 未被停用。 */
function planRunnable(plan: PlanResponse): boolean {
  return plan.is_enabled && plan.members.every((member) => member.is_available)
}

function planLabel(plan: PlanResponse): string {
  const base = `${plan.name} · ${PLAN_MODE_LABEL[plan.mode]}`
  if (!plan.is_enabled) return `${base}（已停用）`
  return planRunnable(plan) ? base : `${base}（成员失效）`
}

const targetItems = computed<SelectItem[]>(() => {
  const items: SelectItem[] = [{ value: DEFAULT_TARGET, label: '平台默认 Agent' }]
  const agents = agentsStore.state.items
  if (agents.length) {
    items.push({ type: 'label', label: '我的 Agent' })
    for (const agent of agents) {
      items.push({
        value: `${AGENT_PREFIX}${agent.id}`,
        label: agent.is_enabled ? agent.name : `${agent.name}（已停用）`,
        disabled: !agent.is_enabled,
      })
    }
  }
  const plans = plansStore.state.items
  if (plans.length) {
    items.push({ type: 'separator' }, { type: 'label', label: '编排方案' })
    for (const plan of plans) {
      items.push({
        value: `${PLAN_PREFIX}${plan.id}`,
        label: planLabel(plan),
        disabled: !planRunnable(plan),
      })
    }
  }
  return items
})

const planSelected = computed(() => selectedTarget.value.startsWith(PLAN_PREFIX))

watch(
  () => [
    state.activeSessionId,
    activeSession.value?.agentId,
    activeSession.value?.orchestrationPlanId,
    state.newSessionAgentId,
    state.newSessionPlanId,
  ] as const,
  () => {
    // 方案优先：绑定方案的会话不再有 agentId，回显必须先看方案
    const planId = activeSession.value?.orchestrationPlanId ?? state.newSessionPlanId
    if (planId != null) {
      selectedTarget.value = `${PLAN_PREFIX}${planId}`
      return
    }
    const agentId = activeSession.value?.agentId ?? state.newSessionAgentId
    selectedTarget.value = agentId != null ? `${AGENT_PREFIX}${agentId}` : DEFAULT_TARGET
  },
  { immediate: true },
)

watch(selectedTarget, (value) => {
  if (value.startsWith(PLAN_PREFIX)) {
    setNewSessionPlan(Number(value.slice(PLAN_PREFIX.length)))
    return
  }
  // setNewSessionAgent(null) 不会清方案绑定，从方案切回 Agent/默认时须显式解绑
  if (state.newSessionPlanId != null) setNewSessionPlan(null)
  setNewSessionAgent(value === DEFAULT_TARGET ? null : Number(value.slice(AGENT_PREFIX.length)))
})

watch(
  () => authStore.currentWorkspaceId,
  (workspaceId) => {
    if (!workspaceId) return
    void agentsStore.loadAgents()
    void plansStore.loadPlans()
  },
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
            <USelect v-model="selectedTarget" :class="$style['agent-select']" :items="targetItems" :icon="planSelected ? 'i-lucide-workflow' : 'i-lucide-bot'" value-key="value" label-key="label" :disabled="persistedSession || state.busy" :loading="agentsStore.state.loading || plansStore.state.loading" aria-label="选择新会话的 Agent 或编排方案" />
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
