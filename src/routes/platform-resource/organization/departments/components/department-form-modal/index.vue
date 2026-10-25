<script setup lang="ts">
import { computed, useId, watch } from 'vue'
import { ResourceFormModal } from '@/components'
import { useDepartmentEditor } from '@/hooks/useDepartmentEditor'
import { useSnapshotDirty } from '@/hooks/useFormHelpers'
import { useOrganizationSupport, type SelectOption } from '@/hooks/useOrganizationSupport'
import DepartmentForm from '../department-form/index.vue'

/** 部门新建 / 编辑弹窗：departmentId 为 null 时新建（parentId 预填上级部门）。保存成功后 emit saved，不跳转。 */
defineOptions({ name: 'DepartmentFormModal' })

const props = defineProps<{
  open: boolean
  departmentId: number | null
  parentId?: number | null
  /** 负责人下拉，由来源页的 useOrganizationSupport 提供，避免弹窗重复拉用户目录。 */
  userOptions: SelectOption[]
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  saved: [id: number | null]
}>()

const formId = `department-form-${useId()}`
const editor = useDepartmentEditor()
// 上级部门下拉只读部门 store，这里单独实例化不会发请求。
const support = useOrganizationSupport()
const editing = computed(() => props.departmentId != null)
const parentOptions = computed(() => support.parentDepartmentOptions(props.departmentId))
const { dirty, reset: resetDirty } = useSnapshotDirty(() => editor.draft.value, { resetOn: () => editor.loadingDetail.value })
/** 编辑态详情没加载到时不渲染表单；新建态的目录错误显示在表单上方。 */
const loadError = computed(() => (
  editing.value && !editor.loadingDetail.value && editor.draft.value.id == null ? editor.error.value : ''
))

async function load() {
  if (props.departmentId != null) await editor.openEdit(props.departmentId)
  else await editor.openCreate(props.parentId ?? undefined)
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
    :title="editing ? '编辑部门' : '新建部门'"
    :form-id="formId"
    :submit-label="editing ? '保存修改' : '创建部门'"
    :dirty="dirty"
    :saving="editor.saving.value"
    :loading="editor.loadingDetail.value"
    :load-error="loadError"
    @update:open="(open) => emit('update:open', open)"
  >
    <UAlert v-if="editor.error.value" class="mb-4" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="editor.error.value" role="alert" />
    <DepartmentForm :form-id="formId" :model="editor.draft.value" :issues="editor.issues.value" :parent-options="parentOptions" :user-options="props.userOptions" @save="onSave" />
  </ResourceFormModal>
</template>
