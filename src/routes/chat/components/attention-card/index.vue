<script setup lang="ts">
import { computed } from 'vue'
import type { UnknownToolCall } from '@/interfaces/console/model'
import { mcpToolRef } from '@/utils/mcp-tool'
import McpSourceBadge from '../mcp-source-badge/index.vue'

/**
 * 回合需要人工处理：续跑时有工具执行到一半、结果未知，后端没有自动重跑。
 * 只做提示，不提供重试；是否重做由用户判断，直接接着发言即可。
 */
defineOptions({ name: 'AttentionCard' })

const props = defineProps<{ message?: string; calls: UnknownToolCall[] }>()

/** 开始时间只显示时分秒；解析不了时原样显示。 */
function clock(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString('zh-CN', { hour12: false })
}

const rows = computed(() => props.calls.map((call, index) => {
  // MCP 工具去掉 mcp__{server_key}__ 前缀，来源单独用徽标标出。
  const ref = mcpToolRef(call.tool_name, call.source)
  return {
    key: call.tool_use_id ?? `${call.tool_name}-${index}`,
    name: ref?.toolName ?? call.tool_name,
    mcp: ref?.serverKey,
    summary: call.input_summary,
    startedAt: clock(call.started_at),
  }
}))
</script>

<template>
  <section :class="$style.card" role="status">
    <header :class="$style.header">
      <UIcon name="i-lucide-triangle-alert" :class="$style.icon" />
      <strong>需要人工处理</strong>
    </header>
    <p v-if="message" :class="$style.message">{{ message }}</p>
    <ul v-if="rows.length" :class="$style.calls">
      <li v-for="row in rows" :key="row.key" :class="$style.call">
        <div :class="$style.signature">
          <McpSourceBadge v-if="row.mcp" :server-key="row.mcp" />
          <span :class="[$style.name, 'mono']">{{ row.name }}</span>
          <code :class="$style.summary">{{ row.summary }}</code>
        </div>
        <span :class="[$style.time, 'mono']">开始于 {{ row.startedAt }}</span>
      </li>
    </ul>
  </section>
</template>

<style module src="./index.module.css"></style>
