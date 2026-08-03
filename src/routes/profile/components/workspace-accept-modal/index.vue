<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { reactive, watch } from 'vue'

defineOptions({ name: 'WorkspaceAcceptModal' })

const props = defineProps<{ open: boolean; loading?: boolean }>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  accept: [workspaceId: number]
}>()
const form = reactive({ workspaceId: '' })

watch(
  () => props.open,
  (open) => {
    if (open) form.workspaceId = ''
  },
)

function validate(values: Partial<typeof form>): FormError[] {
  const workspaceId = Number(values.workspaceId)
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    return [{ name: 'workspaceId', message: '请输入有效的工作区 ID' }]
  }
  return []
}

function onSubmit() {
  emit('accept', Number(form.workspaceId))
}
</script>

<template>
  <UModal
    :open="props.open"
    title="接受工作区邀请"
    description="输入邀请记录对应的工作区 ID。"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <UForm
        id="workspace-accept-form"
        :state="form"
        :validate="validate"
        :disabled="props.loading"
        @submit="onSubmit"
      >
        <UFormField label="工作区 ID" name="workspaceId" required>
          <UInput
            v-model="form.workspaceId"
            :class="$style.input"
            inputmode="numeric"
            placeholder="103"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        label="取消"
        :disabled="props.loading"
        @click="emit('update:open', false)"
      />
      <UButton
        type="submit"
        form="workspace-accept-form"
        icon="i-lucide-mail-check"
        label="接受邀请"
        :loading="props.loading"
      />
    </template>
  </UModal>
</template>

<style module src="./index.module.css"></style>
