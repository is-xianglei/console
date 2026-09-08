<script setup lang="ts">
import { computed, watch } from 'vue'
import { getWorkbenchApp } from '@/constants'
import { useRuntimePaneResize } from '@/hooks'
import type { WorkbenchMode } from '@/interfaces'
import { useAgentsStore } from '@/stores/agents'
import { useConsoleStore } from '@/stores/console'
import AppRuntimePanel from './components/app-runtime-panel/index.vue'
import ConversationPane from './components/conversation-pane/index.vue'
import WorkbenchHeader from './components/workbench-header/index.vue'
import WorkflowGraph from './components/workflow-graph/index.vue'

defineOptions({ name: 'ChatPage' })

const { state, setWorkbenchMode } = useConsoleStore()
const agentsStore = useAgentsStore()
const {
  workArea,
  resizing,
  splitAvailable,
  runtimeMinWidth,
  runtimeMaxWidth,
  runtimePaneWidth,
  splitStyle,
  startResize,
  stopResize,
  resetWidth,
  resizeWithKeyboard,
} = useRuntimePaneResize()

const activeSession = computed(() =>
  state.sessions.find((session) => session.id === state.activeSessionId),
)
const activeAgentLabel = computed(() => {
  const agentId = activeSession.value?.agentId ?? state.newSessionAgentId
  if (!agentId) return '平台默认 Agent'
  return agentsStore.state.items.find((agent) => agent.id === agentId)?.name ?? `Agent #${agentId}`
})
const activeApp = computed(() => getWorkbenchApp(state.activeAppId))
/** 当前会话绑定的编排方案 ID;本地草稿会话回退到 newSessionPlanId。 */
const activePlanId = computed(() =>
  activeSession.value?.orchestrationPlanId ?? state.newSessionPlanId,
)
/** 当前会话绑定的 Workflow ID;本地草稿会话回退到 newSessionWorkflowId。 */
const activeWorkflowId = computed(() =>
  activeSession.value?.workflowId ?? state.newSessionWorkflowId,
)
const effectiveMode = computed<WorkbenchMode>(() => {
  // 执行图不依赖应用,只要会话绑了编排(方案或 Workflow)就允许存活
  if (state.workbenchMode === 'graph') {
    return activePlanId.value != null || activeWorkflowId.value != null ? 'graph' : 'chat'
  }
  if (!activeApp.value) return 'chat'
  return !splitAvailable.value && state.workbenchMode === 'split' ? 'app' : state.workbenchMode
})
/** 执行图与应用分屏共用同一条可拖拽侧栏,宽度变量也共用。 */
const sideBySide = computed(() =>
  effectiveMode.value === 'split' || effectiveMode.value === 'graph',
)
const workAreaStyle = computed(() => sideBySide.value ? splitStyle.value : undefined)

function setWorkArea(element: unknown) {
  workArea.value = element instanceof HTMLElement ? element : null
}

watch(sideBySide, (enabled) => {
  if (!enabled) stopResize()
})
</script>

<template>
  <main :class="[$style.center, $style[`mode-${effectiveMode}`]]">
    <WorkbenchHeader
      :active-app="activeApp"
      :active-session="activeSession"
      :agent-label="activeAgentLabel"
      :mode="effectiveMode"
      :split-available="splitAvailable"
      :plan-bound="activePlanId != null || activeWorkflowId != null"
      @select-mode="setWorkbenchMode"
    />

    <div :ref="setWorkArea" :class="$style['work-area']" :style="workAreaStyle">
      <Transition name="workbench-pane">
        <ConversationPane
          v-show="effectiveMode !== 'app'"
          :active-app="activeApp"
          :split="sideBySide"
          :aria-hidden="effectiveMode === 'app'"
          :inert="effectiveMode === 'app'"
        />
      </Transition>

      <Transition name="split-divider">
        <div
          v-if="sideBySide"
          :class="[$style['split-resizer'], { [$style.resizing]: resizing }]"
          role="separator"
          aria-orientation="vertical"
          :aria-label="effectiveMode === 'graph' ? '调整执行图宽度' : '调整应用区域宽度'"
          :aria-valuemin="runtimeMinWidth"
          :aria-valuemax="runtimeMaxWidth"
          :aria-valuenow="Math.round(runtimePaneWidth)"
          tabindex="0"
          title="拖动调整侧栏宽度，双击恢复默认"
          @pointerdown="startResize"
          @keydown="resizeWithKeyboard"
          @dblclick="resetWidth"
        ></div>
      </Transition>

      <Transition name="workbench-pane">
        <div
          v-if="activeApp"
          v-show="effectiveMode !== 'chat' && effectiveMode !== 'graph'"
          :key="activeApp.id"
          :class="$style['runtime-pane']"
          :aria-hidden="effectiveMode === 'chat' || effectiveMode === 'graph'"
          :inert="effectiveMode === 'chat' || effectiveMode === 'graph'"
        >
          <AppRuntimePanel :app="activeApp" />
        </div>
      </Transition>

      <!-- 执行图占右侧栏,对话区留在左边:编排跑起来时两边要能同时看。 -->
      <Transition name="workbench-pane">
        <div v-if="effectiveMode === 'graph'" :class="$style['graph-pane']">
          <WorkflowGraph :plan-id="activePlanId" :workflow-id="activeWorkflowId" />
        </div>
      </Transition>
    </div>
  </main>
</template>

<style module src="./index.module.css"></style>
