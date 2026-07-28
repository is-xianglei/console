<script setup lang="ts">
import { ref, useId } from 'vue'

defineOptions({ name: 'ThinkingBlock' })

const props = defineProps<{
  text: string
  duration: string
  collapsed: boolean
}>()

const open = ref(!props.collapsed)
const bodyId = `thinking-${useId()}`
</script>

<template>
  <div :class="[$style['think-block'], { [$style.collapsed]: !open }]">
    <button type="button" :class="$style['think-head']" :aria-expanded="open" :aria-controls="bodyId" @click="open = !open">
      <i :class="[$style['lead'], 'icon icon-brain']"></i>
      <span :class="$style['think-lbl']">推理过程</span>
      <span :class="[$style['think-dur'], 'mono']">{{ duration }}</span>
      <i :class="[$style['think-chev'], 'icon icon-chevron-down']"></i>
    </button>
    <div v-show="open" :id="bodyId" :class="$style['think-body']">{{ text }}</div>
  </div>
</template>

<style module src="./index.module.css"></style>
