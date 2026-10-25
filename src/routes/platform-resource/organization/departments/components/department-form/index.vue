<script setup lang="ts">
import { computed, useCssModule } from 'vue'
import type { FormError } from '@nuxt/ui'
import type { DepartmentFormModel, DepartmentValidationIssue } from '@/hooks/useDepartmentEditor'
import { SELECT_NONE_VALUE, type SelectOption } from '@/hooks/useOrganizationSupport'

defineOptions({ name: 'DepartmentForm' })

const props = defineProps<{
  /** UForm 的 id；弹窗 footer 的提交按钮用 form 属性指向它。 */
  formId: string
  model: DepartmentFormModel
  issues: DepartmentValidationIssue[]
  parentOptions: SelectOption[]
  userOptions: SelectOption[]
}>()
const emit = defineEmits<{ save: [] }>()

const styles = useCssModule()
const managerOptions = computed<SelectOption[]>(() => [{ value: SELECT_NONE_VALUE, label: '暂不设置' }, ...props.userOptions])

function normalizeSelectValue(value: unknown): string {
  return value === SELECT_NONE_VALUE ? '' : String(value ?? '')
}
const formErrors = computed<FormError[]>(() =>
  props.issues.map((issue) => ({ name: issue.field, message: issue.message })),
)

function submit() {
  emit('save')
}
</script>

<template>
  <UForm :id="formId" :state="model" :validate="() => formErrors" :class="styles.form" @submit="submit">
    <div :class="styles.grid">
      <UFormField label="部门名称" name="name" required><UInput v-model="model.name" :class="styles.field" autofocus placeholder="例如：设备工程部" /></UFormField>
      <UFormField label="部门编码" name="code"><UInput v-model="model.code" :class="[styles.field, 'mono']" placeholder="例如：DEV-ENG" /></UFormField>
    </div>
    <div :class="styles.grid">
      <UFormField label="上级部门" name="parentId"><USelect :model-value="model.parentId || SELECT_NONE_VALUE" :class="styles.field" :items="parentOptions" @update:model-value="(value: unknown) => { model.parentId = normalizeSelectValue(value) }" /></UFormField>
      <UFormField label="负责人" name="managerId"><USelect :model-value="model.managerId || SELECT_NONE_VALUE" :class="styles.field" :items="managerOptions" @update:model-value="(value: unknown) => { model.managerId = normalizeSelectValue(value) }" /></UFormField>
    </div>
    <UFormField label="排序" name="sortOrder" description="数值越小越靠前。"><UInputNumber v-model="model.sortOrder" :class="styles.field" :min="0" /></UFormField>
    <UFormField label="描述" name="description"><UTextarea v-model="model.description" :class="styles.field" autoresize :maxrows="6" placeholder="部门职责、范围或备注" /></UFormField>
    <div :class="styles.toggle"><span><strong>启用部门</strong><small>停用后仍保留组织与成员关系。</small></span><USwitch v-model="model.isActive" /></div>
  </UForm>
</template>

<style module src="./index.module.css"></style>
