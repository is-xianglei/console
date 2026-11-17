<script setup lang="ts">
import { computed } from 'vue'
import { CHANNEL_LABELS, CHANNEL_STATUS_META, CHANNEL_TRANSPORT_LABELS } from '@/constants/settings/channels'
import type { ChannelBotAction } from '@/hooks/useSettingsChannels'
import type { ChannelBot } from '@/interfaces/settings/channels/model'

/** 卡内一行机器人：状态图标 + 名称，渠道 · 接入方式 · App ID（· 群聊旁听），右侧启停 / 测试 / 删除。 */
defineOptions({ name: 'ChannelBotItem' })

const props = defineProps<{
  bot: ChannelBot
  /** 渠道是否可能投递未 @ 的群消息；否则不显示群聊旁听。 */
  canObserve: boolean
  /** 正在进行的操作，进行中整行禁用。 */
  busy?: ChannelBotAction
}>()
const emit = defineEmits<{
  'update:enabled': [enabled: boolean]
  'update:observe': [observe: boolean]
  test: []
  remove: []
}>()

const OBSERVE_HINT = '读取群里未 @ 它的消息作为上下文（只读不回复）'

const status = computed(() => CHANNEL_STATUS_META[props.bot.status])
const channelLabel = computed(() => CHANNEL_LABELS[props.bot.channel_type] ?? props.bot.channel_type)
const showError = computed(() => props.bot.status === 'error' && Boolean(props.bot.last_error))
</script>

<template>
  <li :class="$style.row">
    <div :class="$style.rowMain">
      <div :class="$style.rowTitle">
        <UTooltip :text="status.label">
          <UIcon :name="status.icon" :class="$style.status" :data-tone="status.tone" aria-hidden="true" />
        </UTooltip>
        <span>{{ props.bot.display_name }}</span>
        <span class="sr-only">（{{ status.label }}）</span>
      </div>
      <div :class="[$style.rowMeta, $style.metaLine]">
        <span>{{ channelLabel }}</span>
        <span :class="$style.sep" aria-hidden="true">·</span>
        <span>{{ CHANNEL_TRANSPORT_LABELS[props.bot.transport] }}</span>
        <span :class="$style.sep" aria-hidden="true">·</span>
        <span class="mono">{{ props.bot.app_id }}</span>
        <template v-if="props.canObserve">
          <span :class="$style.sep" aria-hidden="true">·</span>
          <span :class="$style.observe">
            <UCheckbox
              label="群聊旁听"
              :class="$style.observeCheckbox"
              :model-value="props.bot.group_listen_mode === 'observe_all'"
              :disabled="Boolean(props.busy)"
              @update:model-value="(value: boolean | 'indeterminate') => emit('update:observe', value === true)"
            />
            <UTooltip :text="OBSERVE_HINT">
              <span :class="$style.hint" tabindex="0" role="img" :aria-label="OBSERVE_HINT">
                <UIcon name="i-lucide-info" :class="$style.hintIcon" aria-hidden="true" />
              </span>
            </UTooltip>
          </span>
        </template>
      </div>
      <span v-if="showError" :class="$style.error">{{ props.bot.last_error }}</span>
    </div>
    <div :class="$style.rowActions">
      <USwitch
        :model-value="props.bot.enabled"
        :disabled="Boolean(props.busy)"
        :aria-label="props.bot.enabled ? '停用机器人' : '启用机器人'"
        @update:model-value="(value) => emit('update:enabled', value)"
      />
      <UButton
        label="测试"
        color="neutral"
        variant="ghost"
        :loading="props.busy === 'test'"
        :disabled="Boolean(props.busy) && props.busy !== 'test'"
        @click="emit('test')"
      />
      <UButton
        label="删除"
        color="error"
        variant="ghost"
        :disabled="Boolean(props.busy)"
        @click="emit('remove')"
      />
    </div>
  </li>
</template>

<style module src="./index.module.css"></style>
