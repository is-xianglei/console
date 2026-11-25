<script setup lang="ts">
import { computed } from 'vue'
import type { CliTag } from '@/interfaces'
import McpSourceBadge from '../mcp-source-badge/index.vue'

defineOptions({ name: 'ToolCallCard' })

const props = defineProps<{
  tag: CliTag
  fn: string
  body: string
  done: boolean
  /** 来自 MCP server 时为 server_key。 */
  mcp?: string
}>()

const failed = computed(() => props.tag === 'ERROR')
const running = computed(() => !props.done && !failed.value)

const TAG_ICON: Record<CliTag, string> = {
  START: 'i-lucide-play',
  THINK: 'i-lucide-brain',
  TOOL: 'i-lucide-wrench',
  SPAWN: 'i-lucide-users-round',
  RESULT: 'i-lucide-square-check',
  ERROR: 'i-lucide-circle-x',
  WARN: 'i-lucide-triangle-alert',
  DONE: 'i-lucide-circle-check',
}
const icon = computed(() => TAG_ICON[props.tag] ?? 'i-lucide-wrench')

/** 触发行右侧：来源与终态压在同一个副标签里，不再额外加徽章行。 */
const suffix = computed(() =>
  [
    props.mcp ? `MCP · ${props.mcp}` : '',
    failed.value ? '失败' : props.done ? '' : '运行中',
  ].filter(Boolean).join(' · ') || undefined,
)
</script>

<template>
  <UChatTool
    :text="fn"
    :suffix="suffix"
    :icon="icon"
    :streaming="running"
    :loading="running"
    :error="failed"
    variant="card"
    chevron="leading"
    :class="$style.card"
  >
    <template v-if="body || mcp" #default>
      <div v-if="mcp" :class="$style.source">
        <McpSourceBadge :server-key="mcp" />
      </div>
      <pre v-if="body" :class="$style.body">{{ body }}</pre>
    </template>
  </UChatTool>
</template>

<style module src="./index.module.css"></style>
