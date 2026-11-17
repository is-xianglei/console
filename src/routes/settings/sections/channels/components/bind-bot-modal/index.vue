<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import type { FormError } from '@nuxt/ui'
import { ResourceFormModal } from '@/components'
import { CHANNEL_CREDENTIAL_FIELD_META, CHANNEL_LABELS, LARK_TRANSPORT_OPTIONS } from '@/constants/settings/channels'
import { useSnapshotDirty } from '@/hooks/useFormHelpers'
import {
  bindFormToPayload,
  canChooseTransport,
  emptyBindForm,
  getCredentialFields,
  resolveTransport,
  switchBindFormChannel,
  validateBindForm,
  type ChannelBindForm,
} from '@/hooks/useSettingsChannels'
import type { ChannelBotCreateRequest } from '@/interfaces/settings/channels/api'
import type { ChannelAdapterInfo, ChannelType } from '@/interfaces/settings/channels/model'

/** 绑定机器人弹窗：凭据字段按渠道 credential_fields 动态渲染。提交后由父组件调接口并决定是否关闭。 */
defineOptions({ name: 'ChannelBindBotModal' })

const props = defineProps<{
  open: boolean
  adapters: ChannelAdapterInfo[]
  saving: boolean
  /** 绑定失败的提示。 */
  error: string
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  submit: [payload: ChannelBotCreateRequest]
}>()

const formId = `channel-bind-form-${useId()}`
const form = ref<ChannelBindForm>(emptyBindForm(props.adapters[0]))
const { dirty, reset: resetDirty } = useSnapshotDirty(() => form.value)

const adapter = computed(() => props.adapters.find((item) => item.channel_type === form.value.channelType))
const fields = computed(() => getCredentialFields(adapter.value))
const showTransport = computed(() => canChooseTransport(form.value.channelType))
const showLarkWebhook = computed(() => form.value.channelType === 'lark' && resolveTransport(form.value, adapter.value) === 'webhook')
const channelItems = computed(() => props.adapters.map((item) => ({
  value: item.channel_type,
  label: CHANNEL_LABELS[item.channel_type] ?? item.channel_type,
})))
const formErrors = computed<FormError[]>(() => validateBindForm(form.value))

watch(() => props.open, (open) => {
  if (!open) return
  form.value = emptyBindForm(props.adapters[0])
  resetDirty()
}, { immediate: true })

function onChannelChange(channelType: ChannelType) {
  const next = props.adapters.find((item) => item.channel_type === channelType)
  if (next && channelType !== form.value.channelType) form.value = switchBindFormChannel(form.value, next)
}

function submit() {
  emit('submit', bindFormToPayload(form.value, adapter.value))
}
</script>

<template>
  <ResourceFormModal
    :open="props.open"
    title="绑定机器人"
    :form-id="formId"
    submit-label="绑定"
    :dirty="dirty"
    :saving="props.saving"
    @update:open="(open) => emit('update:open', open)"
  >
    <UAlert v-if="props.error" :class="$style.error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="props.error" role="alert" />
    <UForm :id="formId" :state="form" :validate="() => formErrors" :class="$style.form" @submit="submit">
      <div :class="$style.grid">
        <UFormField label="渠道" name="channelType">
          <USelect :model-value="form.channelType" :class="$style.field" :items="channelItems" @update:model-value="onChannelChange" />
        </UFormField>
        <UFormField v-if="showTransport" label="接入方式" name="transport">
          <USelect v-model="form.transport" :class="$style.field" :items="LARK_TRANSPORT_OPTIONS" />
        </UFormField>
      </div>
      <UFormField label="名称" name="displayName">
        <UInput v-model="form.displayName" :class="$style.field" placeholder="机器人名称（可选）" autofocus />
      </UFormField>
      <div :class="$style.grid">
        <UFormField
          v-for="field in fields"
          :key="field"
          :label="CHANNEL_CREDENTIAL_FIELD_META[field].label"
          :name="field"
          :required="field === 'app_id' || field === 'app_secret'"
        >
          <UInput
            v-model="form.credentials[field]"
            :class="[$style.field, 'mono']"
            :type="CHANNEL_CREDENTIAL_FIELD_META[field].password ? 'password' : 'text'"
            :autocomplete="CHANNEL_CREDENTIAL_FIELD_META[field].password ? 'new-password' : 'off'"
          />
        </UFormField>
        <template v-if="showLarkWebhook">
          <UFormField label="Encrypt Key" name="encryptKey">
            <UInput v-model="form.encryptKey" :class="[$style.field, 'mono']" type="password" autocomplete="new-password" placeholder="飞书事件加密时填" />
          </UFormField>
          <UFormField label="Verification Token" name="verificationToken">
            <UInput v-model="form.verificationToken" :class="[$style.field, 'mono']" autocomplete="off" placeholder="可选" />
          </UFormField>
        </template>
      </div>
      <UAlert
        v-if="form.channelType === 'wecom'"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        title="企业微信走回调模式：绑定后把回吐的回调地址填回「企业微信后台 → 自建应用 → 接收消息」。"
      />
    </UForm>
  </ResourceFormModal>
</template>

<style module src="./index.module.css"></style>
