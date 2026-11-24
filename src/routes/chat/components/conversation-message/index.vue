<script setup lang="ts">
import { StreamingText, ThinkingReasoning } from '@/components'
import type { ChatMessage } from '@/interfaces'
import { useConsoleStore } from '@/stores/console'
import ApprovalCard from '../approval-card/index.vue'
import AttentionCard from '../attention-card/index.vue'
import InteractionCard from '../interaction-card/index.vue'
import TeamInboxCard from '../team-inbox-card/index.vue'
import ToolCallCard from '../tool-call-card/index.vue'
import ToolSourcesNotice from '../tool-sources-notice/index.vue'

defineOptions({ name: 'ConversationMessage' })

defineProps<{ message: ChatMessage; busy: boolean }>()

const { resendMessage } = useConsoleStore()
</script>

<template>
  <article :class="[$style.msg, { [$style['msg-user']]: message.role === 'user' }]">
    <template v-if="message.role === 'user'">
      <div :class="$style['user-row']">
        <UTooltip v-if="message.retryable" text="重新发送">
          <UButton
            icon="i-lucide-rotate-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="重新发送"
            @click="resendMessage(message.id)"
          />
        </UTooltip>
        <div :class="[$style['bubble-user'], { [$style.queued]: message.queued }]">{{ message.text }}</div>
      </div>
      <div :class="$style['msg-byline']">
        <span v-if="message.queued" :class="[$style['byline-time'], $style['queued-tag']]">
          <UIcon name="i-lucide-clock-3" />排队中
        </span>
        <span v-else :class="[$style['byline-time'], 'mono']">{{ message.time }}</span>
      </div>
    </template>

    <TeamInboxCard v-else-if="message.role === 'team' && message.inbox" :inbox="message.inbox" />

    <template v-else-if="message.blocks?.length || busy">
      <div :class="$style['msg-byline']">
        <span :class="[$style['byline-ic'], $style['ai']]" aria-hidden="true"><i class="icon icon-hexagon"></i></span>
        <span :class="$style['byline-name']">Hyperreal Agent</span>
        <span :class="[$style['byline-time'], 'mono']">{{ message.time }}</span>
      </div>
      <div :class="$style['ai-blocks']">
        <template v-for="(block, index) in message.blocks" :key="index">
          <ThinkingReasoning
            v-if="block.kind === 'think'"
            :text="block.text"
            :done="block.done"
            :seconds="block.seconds"
          />
          <ToolCallCard
            v-else-if="block.kind === 'tool'"
            :tag="block.tag"
            :fn="block.fn"
            :body="block.body"
            :done="block.done"
            :mcp="block.mcp"
          />
          <ToolSourcesNotice v-else-if="block.kind === 'sources'" :faults="block.faults" />
          <AttentionCard v-else-if="block.kind === 'attention'" :message="block.message" :calls="block.calls" />
          <ApprovalCard
            v-else-if="block.kind === 'approval'"
            :request-id="block.requestId"
            :tool-name="block.toolName"
            :tool-input="block.toolInput"
            :reason="block.reason"
            :status="block.status"
          />
          <InteractionCard
            v-else-if="block.kind === 'interaction'"
            :interaction="block.interaction"
            :status="block.status"
            :response-label="block.responseLabel"
          />
          <StreamingText
            v-else-if="block.kind === 'answer'"
            :text="block.text"
            :streaming="block.streaming"
          />
        </template>
      </div>
    </template>
  </article>
</template>

<style module src="./index.module.css"></style>
