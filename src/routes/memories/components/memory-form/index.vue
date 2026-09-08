<script setup lang="ts">
import { computed, useCssModule } from 'vue'
import type { FormError } from '@nuxt/ui'
import type { MemoryType } from '@/interfaces/memory/model'
import type { MemoryFormModel, MemoryValidationIssue } from '@/hooks/useMemoryEditor'

defineOptions({ name: 'MemoryForm' })

const props = defineProps<{
  model: MemoryFormModel
  /** true 为新建（稳定标识可编辑），false 为编辑（稳定标识只读）。 */
  creating: boolean
  issues: MemoryValidationIssue[]
  saving: boolean
  error?: string | null
}>()
const emit = defineEmits<{ cancel: []; save: [] }>()

const styles = useCssModule()
const typeItems: Array<{ label: string; value: MemoryType }> = [
  { label: '用户', value: 'user' },
  { label: '反馈', value: 'feedback' },
  { label: '项目', value: 'project' },
  { label: '参考', value: 'reference' },
]
const formErrors = computed<FormError[]>(() =>
  props.issues.map((issue) => ({ name: issue.field, message: issue.message })),
)

function submit() {
  emit('save')
}
</script>

<template>
  <UForm :state="model" :validate="() => formErrors" :class="styles.form" @submit="submit">
    <div :class="styles.formBody">
      <div :class="styles.formGrid">
        <UFormField label="稳定标识" name="memoryKey" required>
          <UInput v-model="model.memoryKey" class="w-full" :disabled="!creating" placeholder="project-conventions" />
        </UFormField>
        <UFormField label="类型" name="memoryType" required>
          <USelect v-model="model.memoryType" class="w-full" :items="typeItems" />
        </UFormField>
      </div>
      <UFormField label="标题" name="name" required><UInput v-model="model.name" class="w-full" /></UFormField>
      <UFormField label="摘要" name="description" required><UTextarea v-model="model.description" class="w-full" autoresize :maxrows="4" /></UFormField>
      <UFormField label="Markdown 正文" name="body" required><UTextarea v-model="model.body" :class="styles.bodyInput" autoresize :maxrows="22" /></UFormField>
    </div>
    <div :class="styles.formActions">
      <UButton color="neutral" variant="outline" label="取消" @click="emit('cancel')" />
      <UButton type="submit" icon="i-lucide-save" label="保存" :loading="saving" />
    </div>
  </UForm>
</template>

<style module src="./index.module.css"></style>
