<script setup lang="ts">
import { computed, watch } from 'vue'
import { useConsoleStore } from '../../stores/console'
import { useRuntimePaneResize } from '../../composables/useRuntimePaneResize'
import { getWorkbenchApp } from '../../data/appRegistry'
import type { WorkbenchMode } from '../../types'
import AppRuntimePanel from '../apps/runtime/AppRuntimePanel.vue'
import ConversationPane from './ConversationPane.vue'
import WorkbenchHeader from './WorkbenchHeader.vue'

const { state, setWorkbenchMode } = useConsoleStore()
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
const activeApp = computed(() => getWorkbenchApp(state.activeAppId))
const effectiveMode = computed<WorkbenchMode>(() => {
  if (!activeApp.value) return 'chat'
  return !splitAvailable.value && state.workbenchMode === 'split' ? 'app' : state.workbenchMode
})
const workAreaStyle = computed(() => effectiveMode.value === 'split' ? splitStyle.value : undefined)

function setWorkArea(element: unknown) {
  workArea.value = element instanceof HTMLElement ? element : null
}

watch(effectiveMode, (mode) => {
  if (mode !== 'split') stopResize()
})
</script>

<template>
  <main class="center" :class="`mode-${effectiveMode}`">
    <WorkbenchHeader
      :active-app="activeApp"
      :active-session="activeSession"
      :mode="effectiveMode"
      :split-available="splitAvailable"
      @select-mode="setWorkbenchMode"
    />

    <div :ref="setWorkArea" class="work-area" :style="workAreaStyle">
      <ConversationPane
        v-show="effectiveMode !== 'app'"
        :active-app="activeApp"
        :split="effectiveMode === 'split'"
        :aria-hidden="effectiveMode === 'app'"
        :inert="effectiveMode === 'app'"
      />

      <div
        v-if="activeApp && effectiveMode === 'split'"
        class="split-resizer"
        :class="{ resizing }"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整应用区域宽度"
        :aria-valuemin="runtimeMinWidth"
        :aria-valuemax="runtimeMaxWidth"
        :aria-valuenow="Math.round(runtimePaneWidth)"
        tabindex="0"
        title="拖动调整应用区域宽度，双击恢复默认"
        @pointerdown="startResize"
        @keydown="resizeWithKeyboard"
        @dblclick="resetWidth"
      ></div>

      <div
        v-if="activeApp"
        v-show="effectiveMode !== 'chat'"
        :key="activeApp.id"
        class="runtime-pane"
        :aria-hidden="effectiveMode === 'chat'"
        :inert="effectiveMode === 'chat'"
      >
        <AppRuntimePanel :app="activeApp" />
      </div>
    </div>
  </main>
</template>

<style scoped>
.center {
  flex: 1;
  min-width: 0;
  background: var(--bg-deep);
  display: flex;
  flex-direction: column;
}
.work-area {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
}
.runtime-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
}
.mode-split .runtime-pane {
  width: var(--runtime-pane-width);
  flex: 0 0 var(--runtime-pane-width);
}
.split-resizer {
  position: relative;
  width: 10px;
  flex: 0 0 10px;
  align-self: stretch;
  border: 0;
  outline: 0;
  background: var(--bg-deep);
  cursor: col-resize;
  touch-action: none;
}
.split-resizer::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: var(--border-visible);
  content: '';
  transform: translateX(-50%);
  transition: background var(--dur-fast), box-shadow var(--dur-fast);
}
.split-resizer:hover::before,
.split-resizer:focus-visible::before,
.split-resizer.resizing::before {
  background: var(--accent-agent);
  box-shadow: 0 0 10px var(--accent-agent-glow);
}
.split-resizer:focus-visible { box-shadow: none; }
</style>
