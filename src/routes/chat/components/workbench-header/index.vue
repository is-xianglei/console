<script setup lang="ts">
import { computed } from 'vue'
import { AiOrb } from '@/components'
import type { Session, WorkbenchApp, WorkbenchMode } from '@/interfaces'

defineOptions({ name: 'WorkbenchHeader' })

const props = defineProps<{
  activeApp?: WorkbenchApp
  activeSession?: Session
  agentLabel: string
  mode: WorkbenchMode
  splitAvailable: boolean
  /** 当前会话是否绑定了 Workflow(执行图视图的可用条件) */
  planBound: boolean
}>()
const emit = defineEmits<{ selectMode: [mode: WorkbenchMode] }>()

const modes: WorkbenchMode[] = ['chat', 'split', 'app', 'graph']
const labels: Record<WorkbenchMode, string> = { chat: '对话', split: '分屏', app: '应用', graph: '执行图' }
const modeDescriptions: Record<WorkbenchMode, string> = {
  chat: '对话视图',
  split: '对话与应用分屏',
  app: '应用视图',
  graph: '编排执行图视图',
}

// 分屏/应用依赖打开的应用,执行图依赖会话绑定的 Workflow
const modeOptions = computed(() =>
  modes
    .filter((mode) => {
      if (mode === 'split') return Boolean(props.activeApp) && props.splitAvailable
      if (mode === 'app') return Boolean(props.activeApp)
      if (mode === 'graph') return props.planBound
      return true
    })
    .map((value) => ({ value, label: labels[value] })),
)

function selectMode(value: string | number) {
  emit('selectMode', value as WorkbenchMode)
}
</script>

<template>
  <header :class="$style['conv-head']">
    <div :class="$style['conv-context']">
      <span v-if="activeApp" :class="[$style['conv-path'], 'mono']">默认工作区 / {{ activeApp.name }}</span>
      <div :class="$style['conv-title-line']">
        <h1 :class="$style['conv-title']">{{ activeApp?.name ?? activeSession?.title ?? '新会话' }}</h1>
        <span v-if="activeApp" :class="[$style['scope-badge'], 'mono']">APP RUNTIME</span>
        <span v-if="activeApp" :class="[$style['status-badge'], 'mono']"><span class="dot nominal"></span>AGENT 在线</span>
        <span v-else :class="[$style['conv-id'], 'mono']">#{{ activeSession?.id ?? '—' }}</span>
      </div>
      <span v-if="activeApp && activeSession" :class="$style['session-context']">{{ activeSession.title }} · #{{ activeSession.id }}</span>
    </div>

    <UTabs
      v-if="activeApp || planBound"
      :class="$style['view-switch']"
      :model-value="mode"
      :items="modeOptions"
      :content="false"
      variant="pill"
      size="sm"
      aria-label="工作台视图"
      @update:model-value="selectMode"
    />
    <div v-else :class="$style['conv-model']"><AiOrb :class="$style['orb-fit']" :size="14" label="运行中" />{{ activeSession?.agentId ? agentLabel : activeSession?.modelName || agentLabel }}</div>
    <span :class="$style['mode-announcer']" aria-live="polite">{{ modeDescriptions[mode] }}</span>
  </header>
</template>

<style module src="./index.module.css"></style>
