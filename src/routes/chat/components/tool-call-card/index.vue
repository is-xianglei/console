<script setup lang="ts">
import type { CliTag } from '@/interfaces'

defineOptions({ name: 'ToolCallCard' })

defineProps<{
  tag: CliTag
  fn: string
  body: string
  done: boolean
}>()
</script>

<template>
  <div :class="$style['cli-card']">
    <div :class="$style['cli-bar']">
      <span :class="[$style['cli-tag'], $style[tag.toLowerCase()]]">{{ tag }}</span>
      <span :class="$style['cli-fn']">{{ fn }}</span>
      <span :class="$style['cli-state']">
        <template v-if="done"><span :class="$style['ok']">✓</span> 完成</template>
        <template v-else><span :class="$style['cli-spin']"></span>运行</template>
      </span>
    </div>
    <div v-if="body" :class="$style['cli-body']">{{ body }}</div>
  </div>
</template>

<style module src="./index.module.css"></style>
