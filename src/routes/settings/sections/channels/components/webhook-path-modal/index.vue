<script setup lang="ts">
import { useClipboard } from '@vueuse/core'

/** 绑定 webhook 模式机器人后，展示后端回吐的回调地址供复制。 */
defineOptions({ name: 'ChannelWebhookPathModal' })

const props = defineProps<{
  open: boolean
  path: string
}>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const { copy, copied } = useClipboard({ legacy: true })
</script>

<template>
  <UModal
    :open="props.open"
    title="回调地址"
    description="请将回调地址填回渠道后台。"
    :ui="{ footer: 'justify-end' }"
    @update:open="(open) => emit('update:open', open)"
  >
    <template #body>
      <UInput :model-value="props.path" class="mono w-full" readonly aria-label="回调地址" :ui="{ trailing: 'pe-1' }">
        <template #trailing>
          <UButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            :aria-label="copied ? '已复制' : '复制回调地址'"
            size="sm"
            color="neutral"
            variant="link"
            @click="copy(props.path)"
          />
        </template>
      </UInput>
    </template>
    <template #footer>
      <UButton label="完成" @click="emit('update:open', false)" />
    </template>
  </UModal>
</template>
