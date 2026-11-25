<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { StreamingText, ThinkingReasoning } from '@/components'
import { useStickToBottom } from '@/hooks'
import type { SubAgent } from '@/interfaces'
import ToolCallCard from '../tool-call-card/index.vue'

defineOptions({ name: 'AgentDetail' })

/** 队友传自己的信息块（状态、角色、Agent）和最近一次激活的失败原因；子代理用默认的 PID / 状态 / 进度 / 事件。 */
interface DetailTile {
  label: string
  value: string
  accent?: boolean
}

const props = defineProps<{
  agent: SubAgent | null
  tiles?: DetailTile[]
  notice?: string | null
  emptyText?: string
}>()

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
  interrupted: '已中断',
}

const detailTiles = computed<DetailTile[]>(() => {
  if (props.tiles) return props.tiles
  const agent = props.agent
  if (!agent) return []
  return [
    { label: 'PID', value: agent.pid },
    { label: '状态', value: statusLabel[agent.status] ?? agent.status, accent: true },
    { label: '进度', value: `${agent.progress}%` },
    { label: '事件', value: String(agent.stream.length) },
  ]
})
</script>

<template>
  <div ref="scroller" :class="$style['agent-detail']">
    <!-- 空状态 -->
    <UEmpty v-if="!agent" variant="naked" :class="$style['detail-empty']" :description="emptyText ?? '选中一个子代理以查看它的推理、回答与工具调用'">
      <template #leading>
        <svg :class="$style['hx']" viewBox="0 0 20 22" fill="none" aria-hidden="true">
          <path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" />
        </svg>
      </template>
    </UEmpty>

    <template v-else>
      <div :class="$style['detail-head']">
        <div :class="$style['detail-title-row']">
          <span :class="$style['agent-ic']"><i :class="`icon icon-${agent.icon}`"></i></span>
          <span :class="$style['detail-title']">{{ agent.name }}</span>
        </div>
        <p v-if="agent.task" :class="$style['detail-task']" :title="agent.task">{{ agent.task }}</p>
        <div :class="$style['detail-meta']">
          <div v-for="tile in detailTiles" :key="tile.label" :class="$style['detail-tile']">
            <div :class="$style['detail-tile-l']">{{ tile.label }}</div>
            <div :class="[$style['detail-tile-v'], { [$style['accent']]: tile.accent }]" :title="tile.value">{{ tile.value }}</div>
          </div>
        </div>
        <UAlert v-if="notice" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="notice" />
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
                :mcp="s.mcp"
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
