<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TeamInbox } from '@/interfaces/console/model'
import { inboxHeadingText } from '@/utils/team-runtime'

/** 队友发给主 Agent 的消息（<team-inbox>），默认折叠；自动回合的标出「由队友消息触发」。 */
defineOptions({ name: 'TeamInboxCard' })

const props = defineProps<{ inbox: TeamInbox }>()

const open = ref(false)
const entries = computed(() => props.inbox.entries.map((entry, index) => ({
  key: `${index}:${entry.heading}`,
  heading: inboxHeadingText(entry.heading),
  body: entry.body,
})))
</script>

<template>
  <section :class="$style.card" aria-label="团队消息">
    <UCollapsible v-model:open="open" :disabled="!entries.length">
      <button type="button" :class="$style.head">
        <UIcon name="i-lucide-mail" :class="$style.icon" />
        <span :class="$style.title">团队消息 · {{ entries.length }} 条</span>
        <span v-if="inbox.trigger" :class="$style.trigger">由队友消息触发</span>
        <UIcon v-if="entries.length" name="i-lucide-chevron-right" :class="[$style.chevron, { [$style.open]: open }]" />
      </button>
      <template #content>
        <ul :class="$style.entries">
          <li v-for="entry in entries" :key="entry.key" :class="$style.entry">
            <strong v-if="entry.heading">{{ entry.heading }}</strong>
            <p>{{ entry.body }}</p>
          </li>
        </ul>
      </template>
    </UCollapsible>
  </section>
</template>

<style module src="./index.module.css"></style>
