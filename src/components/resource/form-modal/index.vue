<script setup lang="ts">
import { ref, useCssModule, watch } from 'vue'

/**
 * 资源新建 / 编辑弹窗壳（部门 / 群组 / 人员共用）：
 * - 受控 open：X、ESC、遮罩、取消四个入口统一走 requestClose；
 * - 表单有改动（dirty）先弹「放弃未保存的修改？」，没改动直接关；保存中（saving）不能关闭；
 * - footer 放取消 / 提交，提交按钮用 form 属性指向 UForm 的 id；
 * - loading 时显示骨架，loadError 时显示错误提示且禁用提交。
 * 表单本身、hook 的组合与保存后的动作由各资源弹窗负责。
 */
defineOptions({ name: 'ResourceFormModal' })

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  /** 默认插槽里 UForm 的 id；footer 提交按钮通过 form 属性提交它。 */
  formId: string
  submitLabel: string
  /** 表单相对打开时的快照是否有改动。 */
  dirty?: boolean
  /** 保存中：禁止关闭、提交按钮 loading。 */
  saving?: boolean
  /** 加载详情中：显示骨架、禁用提交。 */
  loading?: boolean
  /** 详情加载失败的提示；非空时不渲染表单、禁用提交。 */
  loadError?: string
}>(), { dirty: false, saving: false, loading: false, loadError: '' })

const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const styles = useCssModule()
const confirmOpen = ref(false)

// 弹窗被外部关闭（例如保存成功）时，顺手收起确认框。
watch(() => props.open, (open) => {
  if (!open) confirmOpen.value = false
})

function onUpdateOpen(open: boolean) {
  if (open) emit('update:open', true)
  else requestClose()
}

function requestClose() {
  if (props.saving) return
  if (props.dirty) {
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
    :title="props.title"
    :close="!props.saving"
    :dismissible="!props.saving"
    :ui="{ content: 'sm:max-w-2xl', footer: 'justify-end' }"
    @update:open="onUpdateOpen"
  >
    <template #body>
      <div v-if="props.loading" :class="styles.loading" aria-busy="true" aria-label="加载中">
        <USkeleton class="h-8 w-full" />
        <USkeleton class="h-8 w-full" />
        <USkeleton class="h-24 w-full" />
      </div>
      <UAlert v-else-if="props.loadError" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="props.loadError" role="alert" />
      <slot v-else />
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" label="取消" :disabled="props.saving" @click="requestClose" />
      <UButton
        type="submit"
        :form="props.formId"
        icon="i-lucide-save"
        :label="props.submitLabel"
        :loading="props.saving"
        :disabled="props.loading || Boolean(props.loadError)"
      />
    </template>
  </UModal>

  <UModal v-model:open="confirmOpen" title="放弃未保存的修改？" description="当前修改尚未保存到后端，离开后将丢失。">
    <template #footer>
      <UButton label="继续编辑" color="neutral" variant="outline" @click="confirmOpen = false" />
      <UButton label="放弃修改" color="error" @click="confirmDiscard" />
    </template>
  </UModal>
</template>

<style module src="./index.module.css"></style>
