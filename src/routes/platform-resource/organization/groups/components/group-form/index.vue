<script setup lang="ts">
import { computed, useCssModule } from 'vue'
import type { FormError } from '@nuxt/ui'
import {
  GROUP_JOIN_MODE_OPTIONS,
  GROUP_TYPE_OPTIONS,
  GROUP_VISIBILITY_OPTIONS,
  type GroupFormModel,
  type GroupValidationIssue,
} from '@/hooks/useGroupEditor'

defineOptions({ name: 'GroupForm' })

const props = defineProps<{
  /** UForm 的 id；弹窗 footer 的提交按钮用 form 属性指向它。 */
  formId: string
  model: GroupFormModel
  /** true 为新建，false 为编辑(仅编辑显示启用开关)。 */
  creating: boolean
  issues: GroupValidationIssue[]
}>()
const emit = defineEmits<{ save: [] }>()

const styles = useCssModule()
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
      <UFormField label="群组名称" name="name" required><UInput v-model="model.name" :class="styles.field" autofocus placeholder="例如：设备协作组" /></UFormField>
      <UFormField label="唯一标识" name="slug" required description="仅支持小写字母、数字和连字符。"><UInput v-model="model.slug" :class="[styles.field, 'mono']" placeholder="例如：device-team" /></UFormField>
    </div>
    <div :class="styles.grid">
      <UFormField label="类型" name="groupType"><USelect v-model="model.groupType" :class="styles.field" :items="GROUP_TYPE_OPTIONS" /></UFormField>
      <UFormField label="可见性" name="visibility"><USelect v-model="model.visibility" :class="styles.field" :items="GROUP_VISIBILITY_OPTIONS" /></UFormField>
    </div>
    <UFormField label="加入方式" name="joinMode" description="开放加入无需审批；申请审批需负责人或管理员批准。"><USelect v-model="model.joinMode" :class="styles.field" :items="GROUP_JOIN_MODE_OPTIONS" /></UFormField>
    <UFormField label="描述" name="description"><UTextarea v-model="model.description" :class="styles.field" autoresize :maxrows="6" placeholder="群组目标、协作范围或备注" /></UFormField>
    <div v-if="!creating" :class="styles.toggle"><span><strong>启用群组</strong><small>停用后成员关系继续保留。</small></span><USwitch v-model="model.isActive" /></div>
  </UForm>
</template>

<style module src="./index.module.css"></style>
