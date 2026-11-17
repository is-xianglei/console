<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { reactive, ref, watch } from 'vue'
import { useSnapshotDirty } from '@/hooks/useFormHelpers'

defineOptions({ name: 'WorkspaceAcceptModal' })

const props = defineProps<{ open: boolean; loading?: boolean }>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  accept: [workspaceId: number]
}>()
const form = reactive({ workspaceId: '' })
const confirmOpen = ref(false)
const { dirty, reset: resetDirty } = useSnapshotDirty(() => form)

watch(
  () => props.open,
  (open) => {
    if (open) {
      form.workspaceId = ''
      resetDirty()
    }
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

function updateOpen(open: boolean) {
  if (open) {
    emit('update:open', true)
    return
  }
  requestClose()
}

function requestClose() {
  if (props.loading) {
    emit('update:open', false)
    return
  }
  if (dirty.value) {
    confirmOpen.value = true
    return
  }
  emit('update:open', false)
}

function confirmDiscard() {
  confirmOpen.value = false
  emit('update:open', false)
}
</script>

<template>
  <UModal
    :open="props.open"
    title="接受工作区邀请"
    description="输入邀请记录对应的工作区 ID。"
    :close="!props.loading"
    :dismissible="!props.loading"
    @update:open="updateOpen"
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
        @click="requestClose"
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

  <UModal
    v-model:open="confirmOpen"
    title="放弃未保存的修改？"
    description="关闭后将丢失尚未保存的改动。"
    :close="true"
  >
    <template #footer>
      <UButton color="neutral" variant="outline" label="取消" @click="confirmOpen = false" />
      <UButton color="error" icon="i-lucide-trash-2" label="放弃修改" @click="confirmDiscard" />
    </template>
  </UModal>
</template>

<style module src="./index.module.css"></style>
