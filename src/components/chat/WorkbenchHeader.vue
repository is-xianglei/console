<script setup lang="ts">
import type { WorkbenchApp } from '../../data/appRegistry'
import type { Session, WorkbenchMode } from '../../types'

const props = defineProps<{
  activeApp?: WorkbenchApp
  activeSession?: Session
  mode: WorkbenchMode
  splitAvailable: boolean
}>()
const emit = defineEmits<{ selectMode: [mode: WorkbenchMode] }>()

const modes: WorkbenchMode[] = ['chat', 'split', 'app']
const labels: Record<WorkbenchMode, string> = { chat: '对话', split: '分屏', app: '应用' }
const modeDescriptions: Record<WorkbenchMode, string> = {
  chat: '对话视图',
  split: '对话与应用分屏',
  app: '应用视图',
}

function onModeKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  const availableModes: WorkbenchMode[] = props.splitAvailable ? modes : ['chat', 'app']
  const current = Math.max(0, availableModes.indexOf(props.mode))
  const delta = event.key === 'ArrowRight' ? 1 : -1
  const next = availableModes[(current + delta + availableModes.length) % availableModes.length]
  const group = event.currentTarget as HTMLElement
  event.preventDefault()
  emit('selectMode', next)
  requestAnimationFrame(() => {
    group.querySelector<HTMLButtonElement>(`button[data-mode="${next}"]`)?.focus()
  })
}
</script>

<template>
  <header class="conv-head">
    <div class="conv-context">
      <span v-if="activeApp" class="conv-path mono">默认工作区 / {{ activeApp.name }}</span>
      <div class="conv-title-line">
        <h1 class="conv-title">{{ activeApp?.name ?? activeSession?.title ?? '新会话' }}</h1>
        <span v-if="activeApp" class="scope-badge mono">APP RUNTIME</span>
        <span v-if="activeApp" class="status-badge mono"><span class="dot nominal"></span>AGENT 在线</span>
        <span v-else class="conv-id mono">#{{ activeSession?.id ?? '—' }}</span>
      </div>
      <span v-if="activeApp && activeSession" class="session-context">{{ activeSession.title }} · #{{ activeSession.id }}</span>
    </div>

    <div v-if="activeApp" class="view-switch" role="group" aria-label="工作台视图" @keydown="onModeKeydown">
      <button
        v-for="item in modes"
        v-show="item !== 'split' || splitAvailable"
        :key="item"
        type="button"
        :data-mode="item"
        :class="{ active: mode === item }"
        :aria-pressed="mode === item"
        @click="emit('selectMode', item)"
      >{{ labels[item] }}</button>
    </div>
    <div v-else class="conv-model"><span class="dot think"></span> Fable-5 · MYTHOS</div>
    <span class="mode-announcer" aria-live="polite">{{ modeDescriptions[mode] }}</span>
  </header>
</template>

<style scoped>
.conv-head { min-height: 58px; flex-shrink: 0; padding: 7px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
.conv-context { min-width: 0; flex: 1; }
.conv-path { display: block; margin-bottom: 2px; color: var(--text-dim); font-size: 8px; }
.conv-title-line { display: flex; align-items: center; gap: 7px; }
.conv-title { color: var(--text-primary); font-family: var(--font-ui); font-size: 13px; font-weight: 600; }
.session-context { display: block; margin-top: 1px; overflow: hidden; color: var(--text-dim); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.scope-badge,.status-badge { min-height: 18px; padding: 2px 6px; border: 1px solid var(--border); border-radius: 3px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 5px; font-size: 7px; white-space: nowrap; }
.scope-badge { border-color: rgba(45,212,191,.25); color: var(--accent-agent); }
.view-switch { padding: 2px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--bg-elevated); display: flex; gap: 2px; }
.view-switch button { min-width: 42px; height: 26px; padding: 0 9px; border: 0; border-radius: 3px; background: transparent; color: var(--text-muted); font-family: var(--font-ui); font-size: 9px; font-weight: 600; cursor: pointer; }
.view-switch button:hover { color: var(--text-primary); }
.view-switch button.active { background: var(--bg-surface); color: var(--accent-agent); }
.conv-id { color: var(--text-dim); font-size: 10px; }
.conv-model { margin-left: auto; padding: 3px 9px; border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--bg-surface); color: var(--text-muted); display: flex; align-items: center; gap: 6px; font-family: var(--font-data); font-size: 10px; }
.mode-announcer { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
