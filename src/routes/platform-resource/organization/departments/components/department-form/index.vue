<script setup lang="ts">
import { computed, useCssModule } from 'vue'
import type { FormError } from '@nuxt/ui'
import type { DepartmentFormModel, DepartmentValidationIssue } from '@/hooks/useDepartmentEditor'
import { SELECT_NONE_VALUE, type SelectOption } from '@/hooks/useOrganizationSupport'

defineOptions({ name: 'DepartmentForm' })

const props = defineProps<{
  model: DepartmentFormModel
  /** true 为新建，false 为编辑。 */
  creating: boolean
  issues: DepartmentValidationIssue[]
  parentOptions: SelectOption[]
  userOptions: SelectOption[]
  saving: boolean
}>()
const emit = defineEmits<{ cancel: []; save: [] }>()

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
  <UForm :state="model" :validate="() => formErrors" :class="styles.form" @submit="submit">
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
    <div :class="styles.actions">
      <UButton color="neutral" variant="outline" label="取消" :disabled="saving" @click="emit('cancel')" />
      <UButton type="submit" icon="i-lucide-save" :label="creating ? '创建部门' : '保存修改'" :loading="saving" />
    </div>
  </UForm>
</template>

<style module src="./index.module.css"></style>
