<script setup lang="ts">
import { computed, onMounted, ref, useId } from 'vue'
import { ActionIconButton } from '@/components'
import { useSettingsChannels } from '@/hooks/useSettingsChannels'
import type { ChannelBotCreateRequest } from '@/interfaces/settings/channels/api'
import type { ChannelBot } from '@/interfaces/settings/channels/model'
import BindBotModal from './components/bind-bot-modal/index.vue'
import BotItem from './components/bot-item/index.vue'
import WebhookPathModal from './components/webhook-path-modal/index.vue'

defineOptions({ name: 'ChannelsSection' })

const channels = useSettingsChannels()
const { adapters, bots, loading, loaded, error, busy, creating, createError } = channels

const titleId = `channels-title-${useId()}`
const bindOpen = ref(false)
const webhookPath = ref('')
const webhookOpen = ref(false)
const deleteTarget = ref<ChannelBot | null>(null)
const deleteOpen = computed({
  get: () => deleteTarget.value != null,
  set: (open) => { if (!open && !deleting.value) deleteTarget.value = null },
})
const deleting = computed(() => deleteTarget.value != null && busy.value[deleteTarget.value.channel_id] === 'delete')

onMounted(() => { void channels.refresh() })

function openBind() {
  createError.value = ''
  bindOpen.value = true
}

async function onBind(payload: ChannelBotCreateRequest) {
  const bot = await channels.createBot(payload)
  if (!bot) return
  bindOpen.value = false
  if (bot.webhook_path) {
    webhookPath.value = bot.webhook_path
    webhookOpen.value = true
  }
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  if (await channels.removeBot(target)) deleteTarget.value = null
}
</script>

<template>
  <div :class="$style.stack">
    <section :class="$style.group" :aria-labelledby="titleId">
      <div :class="$style.groupHeader">
        <h3 :id="titleId" :class="$style.groupTitle">
          机器人
          <span v-if="bots.length" :class="$style.count">{{ bots.length }}</span>
        </h3>
        <div :class="$style.groupActions">
          <ActionIconButton label="刷新" icon="i-lucide-refresh-cw" :loading="loading" @click="channels.refresh()" />
          <UButton icon="i-lucide-plus" label="绑定机器人" :disabled="!adapters.length" @click="openBind" />
        </div>
      </div>
      <p :class="$style.notice">
        <UIcon name="i-lucide-triangle-alert" :class="[$style.noticeIcon, $style.noticeWarning]" aria-hidden="true" />
        <span>机器人以你本人的权限运行，群里任何人 @ 它都能用到你的知识库与技能。</span>
      </p>
      <p v-if="error" :class="[$style.notice, $style.noticeError]" role="alert">
        <UIcon name="i-lucide-circle-alert" :class="$style.noticeIcon" aria-hidden="true" />
        <span>{{ error }}</span>
      </p>

      <UCard v-if="!error || bots.length" :ui="{ body: 'py-0 sm:py-0' }">
        <ul v-if="!loaded" :class="$style.rows" aria-busy="true" aria-label="加载中">
          <li v-for="index in 2" :key="index" :class="$style.row">
            <USkeleton class="h-10 w-full" />
          </li>
        </ul>
        <UEmpty v-else-if="!bots.length" variant="naked" size="sm" icon="i-lucide-bot" title="还没有机器人" />
        <ul v-else :class="$style.rows">
          <BotItem
            v-for="bot in bots"
            :key="bot.channel_id"
            :bot="bot"
            :can-observe="Boolean(channels.adapterOf(bot.channel_type)?.supports_group_observe)"
            :busy="busy[bot.channel_id]"
            @update:enabled="(enabled) => channels.setEnabled(bot, enabled)"
            @update:observe="(observe) => channels.setGroupObserve(bot, observe)"
            @test="channels.testBot(bot)"
            @remove="deleteTarget = bot"
          />
        </ul>
      </UCard>
    </section>

    <BindBotModal v-model:open="bindOpen" :adapters="adapters" :saving="creating" :error="createError" @submit="onBind" />
    <WebhookPathModal v-model:open="webhookOpen" :path="webhookPath" />

    <UModal
      v-model:open="deleteOpen"
      title="确认删除该机器人？将清除凭据。"
      :description="deleteTarget ? `将删除「${deleteTarget.display_name}」。` : undefined"
      :close="!deleting"
      :dismissible="!deleting"
      :ui="{ footer: 'justify-end' }"
    >
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="deleting" @click="deleteOpen = false" />
        <UButton label="删除" color="error" :loading="deleting" @click="confirmDelete" />
      </template>
    </UModal>
  </div>
</template>

<style module src="./index.module.css"></style>
