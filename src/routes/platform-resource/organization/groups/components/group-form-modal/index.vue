<script setup lang="ts">
import { computed, useId, watch } from 'vue'
import { ResourceFormModal } from '@/components'
import { useGroupEditor } from '@/hooks/useGroupEditor'
import { useSnapshotDirty } from '@/hooks/useFormHelpers'
import GroupForm from '../group-form/index.vue'

/** 群组新建 / 编辑弹窗：groupId 为 null 时新建。保存成功后 emit saved，不跳转。 */
defineOptions({ name: 'GroupFormModal' })

const props = defineProps<{
  open: boolean
  groupId: number | null
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  saved: [id: number | null]
}>()

const formId = `group-form-${useId()}`
const editor = useGroupEditor()
const editing = computed(() => props.groupId != null)
const { dirty, reset: resetDirty } = useSnapshotDirty(() => editor.draft.value, { resetOn: () => editor.loadingDetail.value })
/** 编辑态详情没加载到时不渲染表单；新建态的目录错误显示在表单上方。 */
const loadError = computed(() => (
  editing.value && !editor.loadingDetail.value && editor.draft.value.id == null ? editor.error.value : ''
))

async function load() {
  if (props.groupId != null) await editor.openEdit(props.groupId)
  else await editor.openCreate()
  resetDirty()
}

watch(() => props.open, (open) => { if (open) void load() }, { immediate: true })

function onSave() {
  void editor.saveDraft({
    onSaved: (id) => {
      resetDirty()
      emit('update:open', false)
      emit('saved', id)
    },
  })
}
</script>

<template>
  <ResourceFormModal
    :open="props.open"
    :title="editing ? '编辑群组' : '新建群组'"
    :form-id="formId"
    :submit-label="editing ? '保存修改' : '创建群组'"
    :dirty="dirty"
    :saving="editor.saving.value"
    :loading="editor.loadingDetail.value"
    :load-error="loadError"
    @update:open="(open) => emit('update:open', open)"
  >
    <UAlert v-if="editor.error.value" class="mb-4" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="editor.error.value" role="alert" />
    <GroupForm :form-id="formId" :model="editor.draft.value" :creating="!editing" :issues="editor.issues.value" @save="onSave" />
  </ResourceFormModal>
</template>
