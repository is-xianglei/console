<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { computed, reactive, ref, watch } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import type { MemoryType } from '@/interfaces/memory/model'
import { useMemoriesStore } from '@/stores/memories'

defineOptions({ name: 'MemoryDetailPanel' })

const props = defineProps<{ creating: boolean; editing: boolean }>()
const emit = defineEmits<{
  cancelCreate: []
  cancelEdit: []
  close: []
  saved: []
}>()
const { state, createMemory, updateMemory, deleteMemory } = useMemoriesStore()
const toast = useToast()
const editMode = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)
const activeTab = ref<'content' | 'revisions' | 'sources'>('content')
const error = ref('')
const form = reactive({
  memoryKey: '',
  memoryType: 'user' as MemoryType,
  name: '',
  description: '',
  body: '',
})
const typeItems: Array<{ label: string; value: MemoryType }> = [
  { label: '用户', value: 'user' },
  { label: '反馈', value: 'feedback' },
  { label: '项目', value: 'project' },
  { label: '参考', value: 'reference' },
]
const typeLabel: Record<MemoryType, string> = {
  user: '用户',
  feedback: '反馈',
  project: '项目',
  reference: '参考',
}
const tabItems = [
  { value: 'content', label: '正文' },
  { value: 'revisions', label: '修订' },
  { value: 'sources', label: '来源' },
]
const hasTarget = computed(() => props.creating || Boolean(state.detail))

function resetForm() {
  const detail = props.creating ? null : state.detail
  form.memoryKey = detail?.memory_key ?? ''
  form.memoryType = detail?.memory_type ?? 'user'
  form.name = detail?.name ?? ''
  form.description = detail?.description ?? ''
  form.body = detail?.body ?? ''
  error.value = ''
}

watch(
  [() => props.creating, () => props.editing, () => state.detail],
  ([creating, editing]) => {
    resetForm()
    editMode.value = Boolean(creating || editing)
    activeTab.value = 'content'
  },
  { immediate: true },
)

function validate(values: Partial<typeof form>): FormError[] {
  const errors: FormError[] = []
  if (!values.memoryKey?.trim()) errors.push({ name: 'memoryKey', message: '请输入稳定标识' })
  else if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(values.memoryKey)) {
    errors.push({ name: 'memoryKey', message: '仅支持小写字母、数字、连字符与下划线' })
  }
  if (!values.name?.trim()) errors.push({ name: 'name', message: '请输入标题' })
  if (!values.description?.trim()) errors.push({ name: 'description', message: '请输入摘要' })
  if (!values.body?.trim()) errors.push({ name: 'body', message: '请输入正文' })
  return errors
}

async function onSave() {
  error.value = ''
  const message = props.creating
    ? await createMemory({
        memory_key: form.memoryKey.trim(),
        memory_type: form.memoryType,
        name: form.name.trim(),
        description: form.description.trim(),
        body: form.body.trim(),
      })
    : state.detail
      ? await updateMemory(state.detail.id, {
          version: state.detail.version,
          memory_type: form.memoryType,
          name: form.name.trim(),
          description: form.description.trim(),
          body: form.body.trim(),
        })
      : '未选择 Memory'
  if (message) {
    error.value = message
    return
  }
  editMode.value = false
  emit('saved')
  toast.add({ title: props.creating ? 'Memory 已创建' : 'Memory 已保存', color: 'success', icon: 'i-lucide-circle-check' })
}

function onCancelEdit() {
  resetForm()
  editMode.value = false
  if (props.creating) emit('cancelCreate')
  else emit('cancelEdit')
}

async function onDelete() {
  if (!state.detail || deleting.value) return
  deleting.value = true
  const message = await deleteMemory(state.detail.id, state.detail.version)
  deleting.value = false
  if (message) {
    error.value = message
    return
  }
  deleteOpen.value = false
  emit('close')
  toast.add({ title: 'Memory 已软删除', color: 'success', icon: 'i-lucide-trash-2' })
}
</script>

<template>
  <section :class="$style.panel" aria-label="Memory 详情">
    <UEmpty
      v-if="!hasTarget && !state.detailLoading"
      variant="naked"
      icon="i-lucide-panel-right-open"
      title="选择一条 Memory"
      description="查看正文、修订与来源，或新建长期记忆。"
    />
    <div v-else-if="state.detailLoading" :class="$style.loading">
      <USkeleton class="h-8 w-2/5" />
      <USkeleton class="h-20 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>
    <template v-else>
      <header :class="$style.header">
        <div :class="$style.heading">
          <span :class="[$style.kicker, 'mono']">{{ props.creating ? 'NEW MEMORY' : state.detail?.memory_key }}</span>
          <h2>{{ props.creating ? '新建 Memory' : state.detail?.name }}</h2>
          <div v-if="state.detail && !props.creating" :class="$style.headingMeta">
            <UBadge :label="typeLabel[state.detail.memory_type]" color="neutral" variant="subtle" size="xs" />
            <span class="mono">v{{ state.detail.version }}</span>
            <span>{{ state.detail.use_count }} 次使用</span>
          </div>
          <p v-if="!props.creating">{{ state.detail?.description }}</p>
        </div>
        <div :class="$style.actions">
          <template v-if="!props.creating && !editMode">
            <UTooltip text="编辑 Memory"><UButton color="neutral" variant="ghost" square icon="i-lucide-pencil" aria-label="编辑 Memory" @click="editMode = true" /></UTooltip>
            <UTooltip text="删除 Memory"><UButton color="error" variant="ghost" square icon="i-lucide-trash-2" aria-label="删除 Memory" @click="deleteOpen = true" /></UTooltip>
          </template>
          <UTooltip text="关闭详情"><UButton color="neutral" variant="ghost" square icon="i-lucide-x" aria-label="关闭 Memory 详情" @click="emit('close')" /></UTooltip>
        </div>
      </header>

      <UAlert v-if="error" :class="$style.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" role="alert" />

      <UForm v-if="editMode" :state="form" :validate="validate" :class="$style.form" @submit="onSave">
        <div :class="$style.formBody">
          <div :class="$style.formGrid">
            <UFormField label="稳定标识" name="memoryKey" required>
              <UInput v-model="form.memoryKey" class="w-full" :disabled="!props.creating" placeholder="project-conventions" />
            </UFormField>
            <UFormField label="类型" name="memoryType" required>
              <USelect v-model="form.memoryType" class="w-full" :items="typeItems" />
            </UFormField>
          </div>
          <UFormField label="标题" name="name" required><UInput v-model="form.name" class="w-full" /></UFormField>
          <UFormField label="摘要" name="description" required><UTextarea v-model="form.description" class="w-full" autoresize :maxrows="4" /></UFormField>
          <UFormField label="Markdown 正文" name="body" required><UTextarea v-model="form.body" :class="$style.bodyInput" autoresize :maxrows="22" /></UFormField>
        </div>
        <div :class="$style.formActions">
          <UButton color="neutral" variant="outline" label="取消" @click="onCancelEdit" />
          <UButton type="submit" icon="i-lucide-save" label="保存" :loading="state.saving" />
        </div>
      </UForm>

      <template v-else-if="state.detail">
        <UTabs v-model="activeTab" :items="tabItems" :content="false" variant="link" :class="$style.tabs" />
        <div :class="$style.content">
          <div v-if="activeTab === 'content'" :class="$style.prose">
            <pre>{{ state.detail.body }}</pre>
          </div>
          <ol v-else-if="activeTab === 'revisions' && state.detail.revisions.length" :class="$style.timeline">
            <li v-for="revision in state.detail.revisions" :key="revision.id">
              <div><strong>修订 {{ revision.revision }}</strong><span class="mono">{{ new Date(revision.created_at).toLocaleString('zh-CN') }}</span></div>
              <p>{{ revision.name }} · {{ revision.actor_type }}{{ revision.actor_id ? ` / ${revision.actor_id}` : '' }}</p>
            </li>
          </ol>
          <UEmpty v-else-if="activeTab === 'revisions'" :class="$style.tabEmpty" variant="naked" icon="i-lucide-history" title="暂无修订记录" />
          <ol v-else-if="state.detail.sources.length" :class="$style.timeline">
            <li v-for="source in state.detail.sources" :key="source.id">
              <div><strong>{{ source.source_kind }}</strong><span class="mono">{{ new Date(source.created_at).toLocaleString('zh-CN') }}</span></div>
              <p>{{ source.source_excerpt || '无来源摘要' }}</p>
              <span v-if="source.session_id" class="mono">SESSION #{{ source.session_id }}</span>
            </li>
          </ol>
          <UEmpty v-else :class="$style.tabEmpty" variant="naked" icon="i-lucide-file-search" title="暂无来源证据" />
        </div>
      </template>
    </template>

    <UModal v-model:open="deleteOpen" title="删除 Memory" description="该操作会创建删除版本并从活动目录移除，仍可在数据导出中审计。">
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" @click="deleteOpen = false" />
        <UButton color="error" label="确认删除" :loading="deleting" @click="onDelete" />
      </template>
    </UModal>
  </section>
</template>

<style module src="./index.module.css"></style>
