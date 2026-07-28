<script setup lang="ts">
import { computed, watch } from 'vue'
import { getWorkbenchApp } from '@/constants'
import { useRuntimePaneResize } from '@/hooks'
import type { WorkbenchMode } from '@/interfaces'
import { useConsoleStore } from '@/stores/console'
import AppRuntimePanel from './components/app-runtime-panel/index.vue'
import ConversationPane from './components/conversation-pane/index.vue'
import WorkbenchHeader from './components/workbench-header/index.vue'

defineOptions({ name: 'ChatPage' })

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
  <main :class="[$style.center, $style[`mode-${effectiveMode}`]]">
    <WorkbenchHeader
      :active-app="activeApp"
      :active-session="activeSession"
      :mode="effectiveMode"
      :split-available="splitAvailable"
      @select-mode="setWorkbenchMode"
    />

    <div :ref="setWorkArea" :class="$style['work-area']" :style="workAreaStyle">
      <Transition name="workbench-pane">
        <ConversationPane
          v-show="effectiveMode !== 'app'"
          :active-app="activeApp"
          :split="effectiveMode === 'split'"
          :aria-hidden="effectiveMode === 'app'"
          :inert="effectiveMode === 'app'"
        />
      </Transition>

      <Transition name="split-divider">
        <div
          v-if="activeApp && effectiveMode === 'split'"
          :class="[$style['split-resizer'], { [$style.resizing]: resizing }]"
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
      </Transition>

      <Transition name="workbench-pane">
        <div
          v-if="activeApp"
          v-show="effectiveMode !== 'chat'"
          :key="activeApp.id"
          :class="$style['runtime-pane']"
          :aria-hidden="effectiveMode === 'chat'"
          :inert="effectiveMode === 'chat'"
        >
          <AppRuntimePanel :app="activeApp" />
        </div>
      </Transition>
    </div>
  </main>
</template>

<style module src="./index.module.css"></style>
