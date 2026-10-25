<script setup lang="ts">
import { computed, useId, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ResourceFormModal } from '@/components'
import { useSnapshotDirty } from '@/hooks/useFormHelpers'
import { usePeopleEditor } from '@/hooks/usePeopleEditor'
import PersonForm from '../person-form/index.vue'

/**
 * 人员邀请 / 编辑弹窗：userId 为 null 时新建（创建用户 + 可选工作区邀请）。保存成功后 emit saved，不跳转。
 * 用户已创建但邀请失败：弹窗保持打开，可「重试邀请」或「前往详情」；此时关闭弹窗也 emit saved 让列表刷新。
 */
defineOptions({ name: 'PersonFormModal' })

const props = defineProps<{
  open: boolean
  userId: number | null
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  saved: [id: number]
}>()

const router = useRouter()
const formId = `person-form-${useId()}`
const editor = usePeopleEditor()
const editing = computed(() => props.userId != null)
const inviteFailed = computed(() => Boolean(editor.error.value) && editor.createdUserId.value != null)
const snapshot = useSnapshotDirty(() => editor.draft.value, { resetOn: () => editor.loadingDetail.value })
/** 用户已创建（仅邀请未完成）时草稿已落库，关闭不再弹放弃确认。 */
const dirty = computed(() => editor.createdUserId.value == null && snapshot.dirty.value)
const loadError = computed(() => (
  editing.value && !editor.loadingDetail.value && editor.draft.value.id == null ? editor.error.value : ''
))
const inviteFailedActions = computed(() => [
  { label: '重试邀请', color: 'neutral' as const, variant: 'outline' as const, onClick: onSave },
  { label: '前往详情', color: 'primary' as const, variant: 'solid' as const, onClick: goToCreatedDetail },
])

async function load() {
  if (props.userId != null) await editor.openEdit(props.userId)
  else editor.openCreate()
  snapshot.reset()
}

watch(() => props.open, (open) => { if (open) void load() }, { immediate: true })

function onSave() {
  void editor.saveDraft({
    onSaved: (id) => {
      snapshot.reset()
      emit('update:open', false)
      emit('saved', id)
    },
  })
}

/** X / ESC / 遮罩 / 取消：已创建用户时清掉 createdUser 并通知来源页刷新。 */
function onUpdateOpen(open: boolean) {
  if (!open) {
    const createdId = editor.skipInvite()
    if (createdId != null) emit('saved', createdId)
  }
  emit('update:open', open)
}

/** 放弃重试邀请：先关弹窗再进入已创建用户的详情页（离开列表，不再刷新列表）。 */
function goToCreatedDetail() {
  const createdId = editor.skipInvite()
  emit('update:open', false)
  if (createdId != null) void router.push({ name: 'person-detail', params: { id: String(createdId) } })
}
</script>

<template>
  <ResourceFormModal
    :open="props.open"
    :title="editing ? '编辑人员' : '邀请人员'"
    :form-id="formId"
    :submit-label="editing ? '保存修改' : (editor.draft.value.inviteToWorkspace ? '创建并邀请' : '创建用户')"
    :dirty="dirty"
    :saving="editor.saving.value"
    :loading="editor.loadingDetail.value"
    :load-error="loadError"
    @update:open="onUpdateOpen"
  >
    <UAlert v-if="inviteFailed" class="mb-4" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="editor.error.value" description="用户账号已创建成功，仅工作区邀请未完成；可重试邀请，或前往详情页稍后处理归属。" role="alert" :actions="inviteFailedActions" />
    <UAlert v-else-if="editor.error.value" class="mb-4" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="editor.error.value" role="alert" />
    <PersonForm :form-id="formId" :model="editor.draft.value" :mode="editing ? 'edit' : 'create'" :issues="editor.issues.value" @save="onSave" />
  </ResourceFormModal>
</template>
