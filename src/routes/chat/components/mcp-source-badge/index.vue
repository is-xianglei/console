<script setup lang="ts">
/** 工具卡、审批卡上的来源徽标：标出这个工具来自哪个外部 MCP server。 */
defineOptions({ name: 'McpSourceBadge' })

defineProps<{ serverKey: string }>()
</script>

<template>
  <span :class="$style.badge"><span :class="$style.label">MCP</span>{{ serverKey }}</span>
</template>

<style module src="./index.module.css"></style>
