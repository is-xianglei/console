<script setup lang="ts">
import type { ChatMessage } from '../../types'
import AnswerBlock from './AnswerBlock.vue'
import ApprovalCard from './ApprovalCard.vue'
import ThinkingBlock from './ThinkingBlock.vue'
import ToolCallCard from './ToolCallCard.vue'

defineProps<{ message: ChatMessage; busy: boolean }>()
</script>

<template>
  <article class="msg" :class="message.role === 'user' ? 'msg-user' : 'msg-ai'">
    <template v-if="message.role === 'user'">
      <div class="bubble-user">{{ message.text }}</div>
      <div class="msg-byline"><span class="byline-time mono">{{ message.time }}</span></div>
    </template>

    <template v-else-if="message.blocks?.length || busy">
      <div class="msg-byline">
        <span class="byline-ic ai" aria-hidden="true"><i class="icon icon-hexagon"></i></span>
        <span class="byline-name">Hyperreal Agent</span>
        <span class="byline-time mono">{{ message.time }}</span>
      </div>
      <div class="ai-blocks">
        <template v-for="(block, index) in message.blocks" :key="index">
          <ThinkingBlock
            v-if="block.kind === 'think'"
            :text="block.text"
            :duration="block.duration"
            :collapsed="block.collapsed"
          />
          <ToolCallCard
            v-else-if="block.kind === 'tool'"
            :tag="block.tag"
            :fn="block.fn"
            :body="block.body"
            :done="block.done"
          />
          <ApprovalCard
            v-else-if="block.kind === 'approval'"
            :request-id="block.requestId"
            :tool-name="block.toolName"
            :tool-input="block.toolInput"
            :reason="block.reason"
            :status="block.status"
          />
          <AnswerBlock
            v-else-if="block.kind === 'answer'"
            :text="block.text"
            :streaming="block.streaming"
          />
        </template>
      </div>
    </template>
  </article>
</template>

<style scoped>
.msg { display: flex; flex-direction: column; gap: 8px; animation: entry-appear 250ms var(--ease-out); }
.msg-user { align-items: flex-end; }
.ai-blocks { display: flex; flex-direction: column; gap: 12px; }
.bubble-user {
  max-width: 80%;
  padding: 11px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  border-bottom-right-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.55;
}
.msg-byline { display: flex; align-items: center; gap: 7px; }
.byline-ic { width: 20px; height: 20px; flex-shrink: 0; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; }
.byline-ic.ai { background: var(--accent-agent-dim); color: var(--accent-agent); }
.byline-ic i { font-size: 12px; }
.byline-name { color: var(--text-muted); font-family: var(--font-ui); font-size: 10px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; }
.byline-time { margin-left: auto; color: var(--text-dim); font-size: 9px; }
</style>
