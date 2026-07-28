<script setup lang="ts">
import { ref } from 'vue'
import { useStickToBottom } from '@/hooks'
import type { WorkbenchApp } from '@/interfaces'
import { useConsoleStore } from '@/stores/console'
import Composer from '../composer/index.vue'
import ConversationMessage from '../conversation-message/index.vue'
import TaskBar from '../task-bar/index.vue'

defineOptions({ name: 'ConversationPane' })

defineProps<{ activeApp?: WorkbenchApp; split: boolean }>()

const { state } = useConsoleStore()
const scroller = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
useStickToBottom(scroller, inner)
</script>

<template>
  <section :class="[$style['conversation-pane'], { [$style.split]: split }]" aria-label="对话">
    <div ref="scroller" :class="$style['conv-scroll']" role="log" aria-live="polite" :aria-busy="state.busy">
      <div ref="inner" :class="$style['conv-inner']">
        <div v-if="!state.messages.length" :class="$style['conversation-empty']" role="status">
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
