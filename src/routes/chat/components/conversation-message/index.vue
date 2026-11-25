<script setup lang="ts">
import { computed } from 'vue'
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

const props = defineProps<{ message: ChatMessage; busy: boolean }>()

const { resendMessage } = useConsoleStore()

/** 助手消息只在有内容或回合进行中时出现，空回声不占位。 */
const visible = computed(() =>
  props.message.role !== 'ai' || !!props.message.blocks?.length || props.busy,
)

const retryActions = computed(() => props.message.retryable
  ? [{
      icon: 'i-lucide-rotate-cw',
      color: 'neutral',
      variant: 'ghost',
      size: 'xs',
      'aria-label': '重新发送',
      title: '重新发送',
      onClick: () => resendMessage(props.message.id),
    }]
  : undefined)
</script>

<template>
  <UChatMessage
    v-if="visible"
    :id="message.id"
    :role="message.role"
    :parts="[]"
    :side="message.role === 'user' ? 'right' : 'left'"
    :variant="message.role === 'user' ? 'soft' : 'naked'"
    :actions="retryActions"
    :compact="message.role === 'team'"
  >
    <template v-if="message.role !== 'team'" #header>
      <span v-if="message.role === 'user'" :class="$style.byline">
        <span v-if="message.queued" :class="$style.queued">
          <UIcon name="i-lucide-clock-3" />排队中
        </span>
        <span v-else class="mono">{{ message.time }}</span>
      </span>
      <span v-else :class="$style.byline">
        <span :class="$style.agent"><i class="icon icon-hexagon"></i>Hyperreal Agent</span>
        <span class="mono">{{ message.time }}</span>
      </span>
    </template>

    <template #content>
      <div v-if="message.role === 'user'" :class="$style['user-text']">{{ message.text }}</div>

      <TeamInboxCard v-else-if="message.role === 'team' && message.inbox" :inbox="message.inbox" />

      <div v-else :class="$style.blocks">
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
  </UChatMessage>
</template>

<style module src="./index.module.css"></style>
