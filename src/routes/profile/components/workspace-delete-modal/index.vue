<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WorkspaceResponse } from '@/interfaces/workspace/model'

defineOptions({ name: 'WorkspaceDeleteModal' })

const props = defineProps<{
  open: boolean
  workspace: WorkspaceResponse | null
  loading?: boolean
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  confirm: []
}>()

const step = ref<'warning' | 'verify'>('warning')
const confirmation = ref('')
const confirmed = computed(() => confirmation.value === props.workspace?.slug)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    step.value = 'warning'
    confirmation.value = ''
  },
)

function close() {
  if (!props.loading) emit('update:open', false)
}
</script>

<template>
  <UModal
    :open="props.open"
    title="删除工作区"
    :description="step === 'warning'
      ? `即将删除「${props.workspace?.display_name ?? ''}」，此操作无法撤销。`
      : `输入 ${props.workspace?.slug ?? ''} 以确认删除。`"
    :close="!props.loading"
    @update:open="(open) => { if (!open) close() }"
  >
    <template #body>
      <div v-if="step === 'warning'" :class="$style.warning">
        <UIcon name="i-lucide-triangle-alert" aria-hidden="true" />
        <p>工作区内的成员关系和业务数据可能一并失效。删除期间会临时切换工作区，请勿关闭页面。</p>
      </div>
      <UFormField v-else label="工作区标识" name="confirmation" required>
        <UInput
          v-model="confirmation"
          :class="$style.input"
          :placeholder="props.workspace?.slug"
          autocomplete="off"
          :disabled="props.loading"
          @keydown.enter.prevent="confirmed && emit('confirm')"
        />
      </UFormField>
    </template>

    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        :label="step === 'warning' ? '取消' : '返回'"
        :disabled="props.loading"
        @click="step === 'warning' ? close() : (step = 'warning')"
      />
      <UButton
        v-if="step === 'warning'"
        color="error"
        label="继续"
        icon="i-lucide-arrow-right"
        @click="step = 'verify'"
      />
      <UButton
        v-else
        color="error"
        label="永久删除"
        icon="i-lucide-trash-2"
        :disabled="!confirmed"
        :loading="props.loading"
        @click="emit('confirm')"
      />
    </template>
  </UModal>
</template>

<style module src="./index.module.css"></style>
