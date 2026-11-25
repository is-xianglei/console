<script setup lang="ts">
import { computed } from 'vue'
import type { FormError } from '@nuxt/ui'
import { MODEL_DISPLAY_NAME_MAX, MODEL_TYPE_OPTIONS } from '@/constants/settings/models'
import { providerOptionsForType, usesOpenAIFastMapping, type ModelProviderFormModel, type ModelProviderIssue } from '@/hooks/useModelProviderEditor'
import type { ModelProviderType, ProviderSchema } from '@/interfaces/settings/models/model'
import ReasoningEffortFields from '../reasoning-effort-fields/index.vue'

/** 供应商表单：字段直接写回 model；用途联动、探测由父级弹窗处理。 */
defineOptions({ name: 'ProviderForm' })

const props = defineProps<{
  /** UForm 的 id；弹窗 footer 的提交按钮用 form 属性指向它。 */
  formId: string
  model: ModelProviderFormModel
  schemas: ProviderSchema[]
  editing: boolean
  issues: ModelProviderIssue[]
  detectingContext: boolean
  contextHint: string
  detectingReasoning: boolean
  reasoningHint: string
}>()
const emit = defineEmits<{
  save: []
  'change-type': [type: ModelProviderType]
  'detect-context': []
  'detect-reasoning': []
}>()

const formErrors = computed<FormError[]>(() => props.issues.map((issue) => ({ name: issue.field, message: issue.message })))
const providerItems = computed(() => providerOptionsForType(props.schemas, props.model.providerType))
const isAudio = computed(() => props.model.providerType === 'audio')
const isChat = computed(() => props.model.providerType === 'chat')
const showFastMapping = computed(() => usesOpenAIFastMapping(props.model))
</script>

<template>
  <UForm :id="formId" :state="model" :validate="() => formErrors" :class="$style.form" @submit="emit('save')">
    <UFormField label="显示名称" name="displayName" required>
      <UInput v-model="model.displayName" :class="$style.field" :maxlength="MODEL_DISPLAY_NAME_MAX" autofocus placeholder="如：DeepSeek 官方" />
    </UFormField>
    <div :class="$style.grid">
      <UFormField label="厂商 / 协议" name="provider" required>
        <USelectMenu
          v-model="model.provider"
          :class="$style.field"
          :items="providerItems"
          value-key="value"
          :search-input="{ placeholder: '搜索厂商' }"
          placeholder="请选择厂商 / 协议"
        />
      </UFormField>
      <UFormField label="用途" name="providerType" required>
        <USelect
          :model-value="model.providerType"
          :class="$style.field"
          :items="MODEL_TYPE_OPTIONS"
          @update:model-value="(value) => emit('change-type', value as ModelProviderType)"
        />
      </UFormField>
    </div>
    <UFormField label="base_url" name="baseUrl" :required="isAudio" :help="isAudio ? '请填写已部署的转写服务地址；连通测试会上传 1 秒静音 WAV，可能产生少量用量' : undefined">
      <UInput v-model="model.baseUrl" :class="[$style.field, 'mono']" :placeholder="isAudio ? 'http://<asr-host>:8000/v1' : 'https://api.deepseek.com'" />
    </UFormField>
    <UFormField label="API Key" name="apiKey" :help="editing ? '留空表示不修改现有密钥' : undefined">
      <UInput v-model="model.apiKey" :class="[$style.field, 'mono']" type="password" autocomplete="new-password" :placeholder="editing ? '••••••••' : 'sk-...'" />
    </UFormField>
    <UFormField label="模型名" name="modelName" required>
      <UInput v-model="model.modelName" :class="[$style.field, 'mono']" :placeholder="isAudio ? 'Qwen3-ASR-0.6B' : 'deepseek-chat'" />
    </UFormField>
    <UFormField label="上下文窗口（token）" name="contextLength" :help="contextHint || undefined">
      <div :class="$style.inline">
        <UInputNumber v-model="model.contextLength" :class="$style.field" :min="1" :step="1024" :increment="false" :decrement="false" placeholder="131072" />
        <UButton color="neutral" variant="outline" icon="i-lucide-radar" label="自动探测" :loading="detectingContext" @click="emit('detect-context')" />
      </div>
    </UFormField>
    <div :class="$style.toggle"><strong>启用</strong><USwitch v-model="model.isActive" aria-label="启用" /></div>
    <template v-if="isChat">
      <UFormField v-if="showFastMapping" label="快速档位映射" name="fastReasoningEffort" help="仅当上游模型明确支持 reasoning_effort=none 时开启。保存时会实际验证；未配置时快速档位遵循模型默认思考行为。">
        <USwitch :model-value="model.fastReasoningEffort === 'none'" label="快速时发送 reasoning_effort=none" @update:model-value="model.fastReasoningEffort = $event ? 'none' : undefined" />
      </UFormField>
      <div :class="$style.toggle"><strong>支持多档思考强度</strong><USwitch v-model="model.supportsReasoningEffort" aria-label="支持多档思考强度" /></div>
      <ReasoningEffortFields
        v-if="model.supportsReasoningEffort"
        :model="model"
        :detecting="detectingReasoning"
        :hint="reasoningHint"
        @detect="emit('detect-reasoning')"
      />
      <div :class="$style.toggle">
        <span><strong>支持读图（多模态）</strong><small>开启后图片会原样送给模型；纯文本模型（DeepSeek、Qwen 文本版等）保持关闭。</small></span>
        <USwitch v-model="model.supportsVision" aria-label="支持读图" />
      </div>
    </template>
  </UForm>
</template>

<style module src="./index.module.css"></style>
