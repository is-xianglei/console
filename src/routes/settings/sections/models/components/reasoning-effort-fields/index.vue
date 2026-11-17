<script setup lang="ts">
import { computed } from 'vue'
import { REASONING_KEYS, REASONING_VALUE_MAX } from '@/constants/settings/models'
import { applyReasoningKeys, reasoningLabel, type ModelProviderFormModel } from '@/hooks/useModelProviderEditor'
import type { ReasoningKey } from '@/interfaces/settings/models/model'

/** 思考档位子表单：支持的档位、每档上游参数、默认档位。字段直接写回 model。 */
defineOptions({ name: 'ReasoningEffortFields' })

const props = defineProps<{
  model: ModelProviderFormModel
  detecting: boolean
  hint: string
}>()
const emit = defineEmits<{ detect: [] }>()

const keyItems = REASONING_KEYS.map((key) => ({ value: key, label: reasoningLabel(key) }))
const defaultItems = computed(() => props.model.reasoningKeys.map((key) => ({ value: key, label: reasoningLabel(key) })))

function onKeysChange(next: ReasoningKey[] | undefined) {
  applyReasoningKeys(props.model, next ?? [])
}
</script>

<template>
  <div :class="$style.fields">
    <UFormField help="读取上游模型元数据；只回填表单，不自动保存。">
      <UButton color="neutral" variant="outline" icon="i-lucide-radar" label="自动探测思考档位" :loading="props.detecting" @click="emit('detect')" />
    </UFormField>
    <UAlert v-if="props.hint" color="info" variant="subtle" icon="i-lucide-info" :title="props.hint" />
    <UFormField label="支持的思考档位" name="reasoningKeys" required>
      <UCheckboxGroup
        :model-value="props.model.reasoningKeys"
        :items="keyItems"
        orientation="horizontal"
        @update:model-value="(value) => onKeysChange(value as ReasoningKey[])"
      />
    </UFormField>
    <div v-if="props.model.reasoningKeys.length" :class="$style.grid">
      <UFormField
        v-for="key in props.model.reasoningKeys"
        :key="key"
        :label="`思考参数：${reasoningLabel(key)}`"
        :name="`reasoningValues.${key}`"
        required
      >
        <UInput v-model="model.reasoningValues[key]" :class="[$style.field, 'mono']" :maxlength="REASONING_VALUE_MAX" placeholder="low / high / xhigh / max / 50" />
      </UFormField>
    </div>
    <UFormField label="默认思考档位" name="defaultReasoningEffort" required>
      <USelect v-model="model.defaultReasoningEffort" :class="$style.field" :items="defaultItems" placeholder="请选择默认档位" />
    </UFormField>
  </div>
</template>

<style module src="./index.module.css"></style>
