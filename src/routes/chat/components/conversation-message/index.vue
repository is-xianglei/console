<script setup lang="ts">
import type { ChatMessage } from '@/interfaces'
import AnswerBlock from '../answer-block/index.vue'
import ApprovalCard from '../approval-card/index.vue'
import ThinkingBlock from '../thinking-block/index.vue'
import ToolCallCard from '../tool-call-card/index.vue'

defineOptions({ name: 'ConversationMessage' })

defineProps<{ message: ChatMessage; busy: boolean }>()
</script>

<template>
  <article :class="[$style.msg, { [$style['msg-user']]: message.role === 'user' }]">
    <template v-if="message.role === 'user'">
      <div :class="$style['bubble-user']">{{ message.text }}</div>
      <div :class="$style['msg-byline']"><span :class="[$style['byline-time'], 'mono']">{{ message.time }}</span></div>
    </template>

    <template v-else-if="message.blocks?.length || busy">
      <div :class="$style['msg-byline']">
        <span :class="[$style['byline-ic'], $style['ai']]" aria-hidden="true"><i class="icon icon-hexagon"></i></span>
        <span :class="$style['byline-name']">Hyperreal Agent</span>
        <span :class="[$style['byline-time'], 'mono']">{{ message.time }}</span>
      </div>
      <div :class="$style['ai-blocks']">
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

<style module src="./index.module.css"></style>
