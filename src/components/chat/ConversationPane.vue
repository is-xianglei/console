<script setup lang="ts">
import { ref } from 'vue'
import type { WorkbenchApp } from '../../data/appRegistry'
import { useStickToBottom } from '../../composables/useStickToBottom'
import { useConsoleStore } from '../../stores/console'
import Composer from './Composer.vue'
import ConversationMessage from './ConversationMessage.vue'
import TaskBar from './TaskBar.vue'

defineProps<{ activeApp?: WorkbenchApp; split: boolean }>()

const { state } = useConsoleStore()
const scroller = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
useStickToBottom(scroller, inner)
</script>

<template>
  <section class="conversation-pane" :class="{ split }" aria-label="对话">
    <div ref="scroller" class="conv-scroll" role="log" aria-live="polite" :aria-busy="state.busy">
      <div ref="inner" class="conv-inner">
        <div v-if="!state.messages.length" class="conversation-empty" role="status">
          <span class="empty-mark" aria-hidden="true"><i class="icon icon-hexagon"></i></span>
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

<style scoped>
.conversation-pane { flex: 1; min-width: 0; min-height: 0; background: var(--bg-deep); display: flex; flex-direction: column; }
.conv-scroll { flex: 1; overflow-y: auto; padding: 24px 0 12px; }
.conv-inner { max-width: var(--content-max); margin: 0 auto; padding: 0 40px; display: flex; flex-direction: column; gap: 22px; }
.conversation-empty { min-height: 260px; color: var(--text-dim); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.empty-mark { width: 54px; height: 54px; color: var(--accent-agent); display: grid; place-items: center; opacity: .22; animation: glow-breathe 3s var(--ease-in-out) infinite; }
.empty-mark i { font-size: 42px; }
.conversation-empty h2 { margin-top: 8px; color: var(--text-secondary); font-family: var(--font-ui); font-size: 13px; font-weight: 600; }
.conversation-empty p { margin-top: 4px; font-family: var(--font-data); font-size: 8px; }
@media (max-width: 1180px) { .conversation-pane.split .conv-inner { padding-left: 20px; padding-right: 20px; } }
</style>
