<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * 填写原因或意见的确认弹窗：驳回、强制下架（原因必填）和审核通过（意见选填）共用。
 * 弹窗只负责收集文本和必填校验；调接口、成功后关闭由父组件负责。
 */
defineOptions({ name: 'MarketReasonModal' })

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  /** 输入框标题，例如「驳回理由」。 */
  label: string
  submitLabel: string
  /** 是否必填；必填时只有空白也不能提交，与后端校验一致。 */
  required?: boolean
  submitColor?: 'primary' | 'error'
  /** 提交中：禁止关闭，提交按钮 loading。 */
  saving?: boolean
}>(), { description: '', required: false, submitColor: 'primary', saving: false })

const emit = defineEmits<{
  'update:open': [open: boolean]
  submit: [text: string]
}>()

const text = ref('')
const submitted = ref(false)

// 每次打开都清空上一次的输入。
watch(() => props.open, (open) => {
  if (!open) return
  text.value = ''
  submitted.value = false
})

/** 点过提交之后才显示必填提示，避免一打开就标红。 */
const errorText = computed(() => {
  if (!submitted.value) return undefined
  if (props.required && !text.value.trim()) return `请填写${props.label}`
  return undefined
})

function onSubmit() {
  submitted.value = true
  if (props.required && !text.value.trim()) return
  emit('submit', text.value.trim())
}

function onUpdateOpen(open: boolean) {
  if (props.saving) return
  emit('update:open', open)
}
</script>

<template>
  <UModal
    :open="props.open"
    :title="props.title"
    :description="props.description || undefined"
    :dismissible="!props.saving"
    :close="!props.saving"
    :ui="{ footer: 'justify-end' }"
    @update:open="onUpdateOpen"
  >
    <template #body>
      <UFormField :label="props.label" :required="props.required" :error="errorText">
        <UTextarea
          v-model="text"
          :class="$style.input"
          :rows="4"
          autoresize
          :maxrows="12"
          :placeholder="props.required ? `请输入${props.label}` : `${props.label}（选填）`"
          autofocus
        />
      </UFormField>
    </template>
    <template #footer>
      <UButton label="取消" color="neutral" variant="outline" :disabled="props.saving" @click="onUpdateOpen(false)" />
      <UButton :label="props.submitLabel" :color="props.submitColor" :loading="props.saving" :disabled="props.saving" @click="onSubmit" />
    </template>
  </UModal>
</template>

<style module src="./index.module.css"></style>
