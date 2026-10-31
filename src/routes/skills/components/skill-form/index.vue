<script setup lang="ts">
import { computed, ref, useCssModule } from 'vue'
import type { FormError } from '@nuxt/ui'
import { SKILL_LIMITS, charCount, type SkillFormIssue, type SkillFormModel } from '@/hooks/useSkillEditor'
import { renderMarkdown } from '@/utils/markdown'

defineOptions({ name: 'SkillForm' })

const props = defineProps<{
  model: SkillFormModel
  /** true 为新建（名称可填），false 为编辑（名称只读）。 */
  creating: boolean
  issues: SkillFormIssue[]
  /** 不能对应到字段的错误，显示在表单顶部。 */
  formError?: string
}>()
const emit = defineEmits<{ save: [] }>()

const styles = useCssModule()
const formRef = ref<{
  submit: () => Promise<void>
  validate: (opts: { silent: boolean }) => Promise<unknown>
} | null>(null)
const bodyTab = ref<'edit' | 'preview'>('edit')
const bodyTabs = [
  { value: 'edit', label: '编辑' },
  { value: 'preview', label: '预览' },
]

const formErrors = computed<FormError[]>(() =>
  props.issues.map((issue) => ({ name: issue.field, message: issue.message })),
)
const descriptionCount = computed(() => `${charCount(props.model.description)}/${SKILL_LIMITS.description}`)
const previewHtml = computed(() => (bodyTab.value === 'preview' ? renderMarkdown(props.model.body) : ''))

/** 页头「保存」按钮在表单外，通过它触发 UForm 校验 + 提交。 */
function submit() {
  return formRef.value?.submit()
}

/** 服务端字段错误到达后重新跑一遍校验，让错误显示到对应字段上。 */
function showErrors() {
  return formRef.value?.validate({ silent: true })
}

defineExpose({ submit, showErrors })
</script>

<template>
  <UForm ref="formRef" :state="model" :validate="() => formErrors" :class="styles.form" @submit="emit('save')">
    <UAlert v-if="formError" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="formError" role="alert" />

    <div :class="styles.grid">
      <UFormField label="名称" name="name" required eager-validation>
        <UInput v-model="model.name" class="w-full" :class="!creating && 'mono'" :disabled="!creating" placeholder="pdf-extract" autocomplete="off" />
      </UFormField>
      <UFormField label="版本" name="version">
        <UInput v-model="model.version" class="w-full" placeholder="1.0.0" autocomplete="off" />
      </UFormField>
    </div>

    <UFormField label="描述" name="description" required>
      <template #hint><span :class="['mono', styles.counter]">{{ descriptionCount }}</span></template>
      <UTextarea v-model="model.description" class="w-full" autoresize :rows="2" :maxrows="6" />
    </UFormField>

    <UFormField label="兼容性" name="compatibility">
      <UInput v-model="model.compatibility" class="w-full" placeholder="需要 Python 3" />
    </UFormField>

    <UFormField label="metadata" name="metadata">
      <UTextarea v-model="model.metadata" :class="styles.code" autoresize :rows="3" :maxrows="12" placeholder="{ &quot;author&quot;: &quot;...&quot; }" />
    </UFormField>

    <UFormField label="正文" name="body" required>
      <UTabs v-model="bodyTab" :items="bodyTabs" :content="false" variant="link" size="sm" :class="styles.tabs" />
      <UTextarea v-if="bodyTab === 'edit'" v-model="model.body" :class="styles.code" autoresize :rows="14" :maxrows="30" placeholder="# 用法" />
      <div v-else-if="previewHtml" class="md" :class="styles.preview" v-html="previewHtml"></div>
      <div v-else :class="styles.preview"></div>
    </UFormField>
  </UForm>
</template>

<style module src="./index.module.css"></style>
