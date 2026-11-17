<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { computed, reactive, ref, watch } from 'vue'
import { useSnapshotDirty } from '@/hooks/useFormHelpers'
import type {
  WorkspaceCreateRequest,
  WorkspaceUpdateRequest,
} from '@/interfaces/workspace/api'
import type { WorkspaceResponse, WorkspaceType } from '@/interfaces/workspace/model'

defineOptions({ name: 'WorkspaceEditorModal' })

const props = defineProps<{
  open: boolean
  mode: 'create' | 'edit'
  workspace?: WorkspaceResponse | null
  loading?: boolean
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  save: [payload: WorkspaceCreateRequest | WorkspaceUpdateRequest]
}>()

const form = reactive({
  name: '',
  slug: '',
  displayName: '',
  workspaceType: 'team' as WorkspaceType,
  logoUrl: '',
  industry: '',
  companySize: '',
  billingEmail: '',
})
const typeItems: Array<{ label: string; value: WorkspaceType }> = [
  { label: '个人', value: 'personal' },
  { label: '团队', value: 'team' },
  { label: '企业', value: 'enterprise' },
]
const typeLabel = computed(() => (
  typeItems.find((item) => item.value === form.workspaceType)?.label ?? form.workspaceType
))
const creating = computed(() => props.mode === 'create')
const title = computed(() => (creating.value ? '创建工作区' : '编辑当前工作区'))
const description = computed(() => (
  creating.value ? '建立独立的成员与资源空间。' : '更新当前工作区的展示与联系信息。'
))
const confirmOpen = ref(false)
const { dirty, reset: resetDirty } = useSnapshotDirty(() => form)

function resetForm() {
  const workspace = props.workspace
  form.name = creating.value ? '' : workspace?.name ?? ''
  form.slug = creating.value ? '' : workspace?.slug ?? ''
  form.displayName = creating.value ? '' : workspace?.display_name ?? ''
  form.workspaceType = creating.value
    ? 'team'
    : (workspace?.workspace_type as WorkspaceType | undefined) ?? 'team'
  form.logoUrl = workspace?.logo_url ?? ''
  form.industry = workspace?.industry ?? ''
  form.companySize = workspace?.company_size ?? ''
  form.billingEmail = workspace?.billing_email ?? ''
}

watch(
  [() => props.open, () => props.mode, () => props.workspace],
  ([open]) => {
    if (open) {
      resetForm()
      resetDirty()
    }
  },
  { immediate: true },
)

function isValidUrl(value: string) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function validate(values: Partial<typeof form>): FormError[] {
  const errors: FormError[] = []
  if (creating.value && !values.name?.trim()) {
    errors.push({ name: 'name', message: '请输入工作区名称' })
  }
  if (creating.value && !values.slug?.trim()) {
    errors.push({ name: 'slug', message: '请输入工作区标识' })
  } else if (creating.value && !/^[a-z0-9][a-z0-9-]*$/.test(values.slug?.trim() ?? '')) {
    errors.push({ name: 'slug', message: '仅支持小写字母、数字和连字符' })
  }
  if (!values.displayName?.trim()) {
    errors.push({ name: 'displayName', message: '请输入显示名称' })
  }
  if (values.logoUrl?.trim() && !isValidUrl(values.logoUrl.trim())) {
    errors.push({ name: 'logoUrl', message: '请输入有效的 URL' })
  }
  if (values.billingEmail?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.billingEmail.trim())) {
    errors.push({ name: 'billingEmail', message: '请输入有效的邮箱' })
  }
  return errors
}

function optionalValue(value: string) {
  return value.trim() || undefined
}

function nullableValue(value: string) {
  return value.trim() || null
}

function onSubmit() {
  if (creating.value) {
    emit('save', {
      name: form.name.trim(),
      slug: form.slug.trim(),
      display_name: form.displayName.trim(),
      workspace_type: form.workspaceType,
      logo_url: optionalValue(form.logoUrl),
      industry: optionalValue(form.industry),
      company_size: optionalValue(form.companySize),
      billing_email: optionalValue(form.billingEmail),
    })
    return
  }
  emit('save', {
    display_name: form.displayName.trim(),
    logo_url: nullableValue(form.logoUrl),
    industry: nullableValue(form.industry),
    company_size: nullableValue(form.companySize),
    billing_email: nullableValue(form.billingEmail),
  })
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
    :title="title"
    :description="description"
    :close="!props.loading"
    :dismissible="!props.loading"
    @update:open="updateOpen"
  >
    <template #body>
      <UForm
        id="workspace-editor-form"
        :state="form"
        :validate="validate"
        :validate-on="['blur']"
        :disabled="props.loading"
        :class="$style.form"
        @submit="onSubmit"
      >
        <div v-if="!creating" :class="$style.meta">
          <span class="mono">{{ form.slug }}</span>
          <UBadge size="xs" :label="typeLabel" color="neutral" variant="soft" />
        </div>
        <div :class="$style.formGrid">
          <UFormField v-if="creating" label="工作区名称" name="name" required>
            <UInput v-model="form.name" :class="$style.input" autocomplete="organization" />
          </UFormField>
          <UFormField v-if="creating" label="工作区标识" name="slug" required>
            <UInput v-model="form.slug" :class="$style.input" placeholder="product-team" />
          </UFormField>
          <UFormField label="显示名称" name="displayName" required>
            <UInput v-model="form.displayName" :class="$style.input" />
          </UFormField>
          <UFormField v-if="creating" label="工作区类型" name="workspaceType" required>
            <USelect
              v-model="form.workspaceType"
              :class="$style.input"
              :items="typeItems"
              value-key="value"
            />
          </UFormField>
          <UFormField label="所属行业" name="industry">
            <UInput v-model="form.industry" :class="$style.input" />
          </UFormField>
          <UFormField label="公司规模" name="companySize">
            <UInput v-model="form.companySize" :class="$style.input" placeholder="1-10" />
          </UFormField>
          <UFormField label="Logo URL" name="logoUrl" :class="$style.full">
            <UInput v-model="form.logoUrl" :class="$style.input" autocomplete="url" />
          </UFormField>
          <UFormField label="账单邮箱" name="billingEmail" :class="$style.full">
            <UInput
              v-model="form.billingEmail"
              :class="$style.input"
              type="email"
              autocomplete="email"
            />
          </UFormField>
        </div>
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
        form="workspace-editor-form"
        icon="i-lucide-save"
        :label="creating ? '创建' : '保存'"
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
