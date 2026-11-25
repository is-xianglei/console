<script setup lang="ts">
import { AiOrb } from '@/components'
import type { MemberDisplayStatus } from '@/utils/team-runtime'

/** 右栏队友卡片：成员名、状态，第二行是角色和对应的 Agent。 */
defineOptions({ name: 'TeammateCard' })

defineProps<{
  name: string
  role: string
  agentName: string | null
  status: MemberDisplayStatus
  selected: boolean
}>()
defineEmits<{ select: [] }>()

const DOT: Record<MemberDisplayStatus['tone'], string> = {
  running: 'nominal',
  queued: 'warning',
  idle: 'idle',
  shutdown: 'idle',
}
</script>

<template>
  <button
    type="button"
    :class="[$style.card, { [$style.active]: selected }]"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <div :class="$style.top">
      <span :class="$style.icon"><i class="icon icon-users"></i></span>
      <span :class="$style.name">{{ name }}</span>
      <span :class="[$style.status, { [$style.error]: status.error }]">
        <AiOrb v-if="status.tone === 'running'" :class="$style.orb" :size="14" :label="status.label" />
        <UChip v-else as="span" standalone size="xs" :ui="{ base: `dot ${status.error ? 'error' : DOT[status.tone]}` }" />
        {{ status.label }}
      </span>
    </div>
    <div :class="$style.meta">{{ agentName ? `${role} · ${agentName}` : role }}</div>
  </button>
</template>

<style module src="./index.module.css"></style>
