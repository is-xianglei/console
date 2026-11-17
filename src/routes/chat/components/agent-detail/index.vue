<script setup lang="ts">
import { ref, watch } from 'vue'
import { StreamingText, ThinkingReasoning } from '@/components'
import { useStickToBottom } from '@/hooks'
import type { SubAgent } from '@/interfaces'
import ToolCallCard from '../tool-call-card/index.vue'

defineOptions({ name: 'AgentDetail' })

const props = defineProps<{ agent: SubAgent | null }>()

const scroller = ref<HTMLElement | null>(null)
const stream = ref<HTMLElement | null>(null)

// 子代理事件流增长时自动吸底(覆盖流式文本累加);上滚可暂停跟随
const { scrollToBottom } = useStickToBottom(scroller, stream)

// 切换查看的子代理时,重置到底部看最新事件
watch(
  () => props.agent?.id,
  () => scrollToBottom(),
)

const statusLabel: Record<string, string> = {
  queued: '排队',
  think: '推理中',
  run: '执行中',
  done: '已完成',
  error: '失败',
}
</script>

<template>
  <div ref="scroller" :class="$style['agent-detail']">
    <!-- 空状态 -->
    <div v-if="!agent" :class="$style['detail-empty']">
      <svg :class="$style['hx']" viewBox="0 0 20 22" fill="none">
        <path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" />
      </svg>
      <p>选中一个子代理以查看它的推理、回答与工具调用</p>
    </div>

    <template v-else>
      <div :class="$style['detail-head']">
        <div :class="$style['detail-title-row']">
          <span :class="$style['agent-ic']"><i :class="`icon icon-${agent.icon}`"></i></span>
          <span :class="$style['detail-title']">{{ agent.name }}</span>
        </div>
        <div :class="$style['detail-meta']">
          <div :class="$style['detail-tile']">
            <div :class="$style['detail-tile-l']">PID</div>
            <div :class="$style['detail-tile-v']">{{ agent.pid }}</div>
          </div>
          <div :class="$style['detail-tile']">
            <div :class="$style['detail-tile-l']">状态</div>
            <div :class="[$style['detail-tile-v'], $style['accent']]">{{ statusLabel[agent.status] }}</div>
          </div>
          <div :class="$style['detail-tile']">
            <div :class="$style['detail-tile-l']">进度</div>
            <div :class="$style['detail-tile-v']">{{ agent.progress }}%</div>
          </div>
          <div :class="$style['detail-tile']">
            <div :class="$style['detail-tile-l']">事件</div>
            <div :class="$style['detail-tile-v']">{{ agent.stream.length }}</div>
          </div>
        </div>
      </div>

      <div ref="stream" :class="$style['detail-stream']">
        <!-- key 带上子代理 id：切换查看的子代理时整条流重新挂载，避免复用上一个子代理的揭示进度和展开状态 -->
        <div v-for="(s, i) in agent.stream" :key="`${agent.id}:${i}`" :class="$style['stream-item']">
          <template v-if="s.kind === 'tool'">
            <div :class="[$style['stream-lbl'], $style['tool']]"><i class="icon icon-terminal"></i>工具调用</div>
            <div :class="$style['stream-cli']">
              <ToolCallCard
                :tag="s.is_error ? 'ERROR' : s.done ? 'RESULT' : 'TOOL'"
                :fn="s.fn"
                :body="s.body"
                :done="s.done"
              />
            </div>
          </template>
          <!-- 推理块自带「思考中… / 已思考 N 秒」标题，不再另加标签 -->
          <ThinkingReasoning
            v-else-if="s.kind === 'think'"
            :class="$style['stream-body']"
            :text="s.text"
            :done="s.done"
            :seconds="s.seconds"
          />
          <template v-else>
            <div :class="[$style['stream-lbl'], $style['answer']]"><i class="icon icon-message-circle"></i>回答</div>
            <StreamingText :class="[$style['stream-body'], $style['stream-answer']]" :text="s.text" :streaming="s.streaming" />
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style module src="./index.module.css"></style>
