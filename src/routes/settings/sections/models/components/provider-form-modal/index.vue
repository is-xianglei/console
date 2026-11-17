<script setup lang="ts">
import { useId, watch } from 'vue'
import { ResourceFormModal } from '@/components/resource'
import { useSnapshotDirty } from '@/hooks/useFormHelpers'
import { useModelProviderEditor } from '@/hooks/useModelProviderEditor'
import type { ModelProviderItem, ModelProviderType, ProviderSchema } from '@/interfaces/settings/models/model'
import ProviderForm from '../provider-form/index.vue'

/** 添加 / 编辑模型供应商弹窗：provider 为 null 时新增。保存成功后 emit saved。 */
defineOptions({ name: 'ProviderFormModal' })

const props = defineProps<{
  open: boolean
  provider: ModelProviderItem | null
  schemas: ProviderSchema[]
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  saved: [item: ModelProviderItem]
}>()

const formId = `model-provider-form-${useId()}`
const editor = useModelProviderEditor()
const { dirty, reset: resetDirty } = useSnapshotDirty(() => editor.draft.value)

watch(() => props.open, (open) => {
  if (!open) return
  editor.open(props.provider)
  resetDirty()
}, { immediate: true })

function onChangeType(type: ModelProviderType) {
  editor.changeType(props.schemas, type)
}

async function onSave() {
  const saved = await editor.save()
  if (!saved) return
  resetDirty()
  emit('update:open', false)
  emit('saved', saved)
}
</script>

<template>
  <ResourceFormModal
    :open="props.open"
    :title="props.provider ? '编辑模型供应商' : '添加模型供应商'"
    :form-id="formId"
    submit-label="保存"
    :dirty="dirty"
    :saving="editor.saving.value"
    @update:open="(open) => emit('update:open', open)"
  >
    <UAlert v-if="editor.error.value" class="mb-4" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="editor.error.value" role="alert" />
    <ProviderForm
      :form-id="formId"
      :model="editor.draft.value"
      :schemas="props.schemas"
      :editing="Boolean(props.provider)"
      :issues="editor.issues.value"
      :detecting-context="editor.detectingContext.value"
      :context-hint="editor.contextHint.value"
      :detecting-reasoning="editor.detectingReasoning.value"
      :reasoning-hint="editor.reasoningHint.value"
      @save="onSave"
      @change-type="onChangeType"
      @detect-context="editor.detectContext"
      @detect-reasoning="editor.detectReasoning"
    />
  </ResourceFormModal>
</template>
