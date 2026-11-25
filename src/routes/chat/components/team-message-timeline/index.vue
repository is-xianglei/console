<script setup lang="ts">
import { computed } from 'vue'
import type { TeamMessageResponse } from '@/interfaces/console/runtime'
import { buildTeamTimeline, teamMessageTypeLabel, type ShutdownOutcome } from '@/utils/team-runtime'

/** 团队消息时间线：发送方 → 收件方、类型、内容；结论用强调样式，关停请求标出回应结果。 */
defineOptions({ name: 'TeamMessageTimeline' })

const props = defineProps<{ messages: TeamMessageResponse[] }>()

const items = computed(() => buildTeamTimeline(props.messages))

const SHUTDOWN_LABEL: Record<ShutdownOutcome, string> = {
  approved: '已批准',
  rejected: '已拒绝',
  pending: '等待回应',
}
const SHUTDOWN_COLOR: Record<ShutdownOutcome, 'success' | 'error' | 'neutral'> = {
  approved: 'success',
  rejected: 'error',
  pending: 'neutral',
}

function timeText(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}
</script>

<template>
  <ol v-if="items.length" :class="$style.timeline" aria-label="团队消息">
    <li v-for="item in items" :key="item.key" :class="$style.item">
      <div :class="$style.head">
        <span :class="$style.route">{{ item.sender }} → {{ item.recipient }}</span>
        <span :class="[$style.type, { [$style.conclusion]: item.type === 'idle_notification' }]">{{ teamMessageTypeLabel(item.type) }}</span>
        <UBadge v-if="item.shutdown" :color="SHUTDOWN_COLOR[item.shutdown]" variant="subtle" size="sm">{{ SHUTDOWN_LABEL[item.shutdown] }}</UBadge>
        <time :class="[$style.time, 'mono']" :datetime="item.createdAt">{{ timeText(item.createdAt) }}</time>
      </div>
      <p :class="[$style.content, { [$style.conclusionBody]: item.type === 'idle_notification' }]">{{ item.content }}</p>
    </li>
  </ol>
  <UEmpty v-else variant="naked" size="xs" icon="i-lucide-messages-square" title="还没有团队消息" />
</template>

<style module src="./index.module.css"></style>
