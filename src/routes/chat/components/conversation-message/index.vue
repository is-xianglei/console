<script setup lang="ts">
import { StreamingText, ThinkingReasoning } from '@/components'
import type { ChatMessage } from '@/interfaces'
import ApprovalCard from '../approval-card/index.vue'
import InteractionCard from '../interaction-card/index.vue'
import TeamInboxCard from '../team-inbox-card/index.vue'
import ToolCallCard from '../tool-call-card/index.vue'
import ToolSourcesNotice from '../tool-sources-notice/index.vue'

defineOptions({ name: 'ConversationMessage' })

defineProps<{ message: ChatMessage; busy: boolean }>()
</script>

<template>
  <article :class="[$style.msg, { [$style['msg-user']]: message.role === 'user' }]">
    <template v-if="message.role === 'user'">
      <div :class="$style['bubble-user']">{{ message.text }}</div>
      <div :class="$style['msg-byline']"><span :class="[$style['byline-time'], 'mono']">{{ message.time }}</span></div>
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
