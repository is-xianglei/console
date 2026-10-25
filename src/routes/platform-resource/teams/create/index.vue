<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TeamBuilder from '../../components/team-builder/index.vue'
import { useTeamEditor } from '@/hooks/useTeamEditor'
import { useSnapshotDirty, useUnsavedGuard } from '@/hooks/useFormHelpers'

defineOptions({ name: 'TeamResourceCreate' })

const route = useRoute()
const router = useRouter()
const editor = useTeamEditor()

/** ?duplicate=<id>：复制已有 Team 作为草稿起点。 */
const duplicateId = computed(() => {
  const raw = route.query.duplicate
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && value ? value : undefined
})

/** 回列表的目标路由，供 Builder 返回 / Esc 走外层守卫。 */
const listTarget = { name: 'platform-resource', params: { module: 'build', resource: 'teams' } } as const

/** create 页脏检查：?duplicate 加载完成后重置快照，避免刚复制就判脏。 */
const snapshot = useSnapshotDirty(
  () => editor.draft.value,
  { resetOn: () => editor.loadingDetail.value },
)
const guard = useUnsavedGuard(snapshot.dirty, {
  navigate: (target) => void router.push(target as Parameters<typeof router.push>[0]),
  onConfirm: () => snapshot.reset(),
})
const { pending: leavePending, requestLeave: requestGuardLeave, confirmLeave: confirmGuardLeave, cancelLeave: cancelGuardLeave } = guard

/** 草稿是否已从复制源预填：仅 ?duplicate 命中已有 Team 时为 true，供步骤条直接标记已完成的步骤。 */
const prefilled = ref(false)

watch(
  () => [route.fullPath, duplicateId.value] as const,
  () => {
    prefilled.value = editor.openCreate(duplicateId.value)
    snapshot.reset()
  },
  { immediate: true },
)

/** Builder 返回键 / Esc 统一声请离开；干净时直达列表，脏时弹确认。 */
function requestListLeave() {
  requestGuardLeave(listTarget)
}

/** 保存成功、跳回列表之前重置基线快照，避免离开守卫把保存后的跳转当成「未保存离开」。 */
const saveOptions = { onSaved: () => snapshot.reset() }

/** 「保存草稿」：按表单当前状态保存，成功后回列表并高亮该 Team。 */
function onSave() {
  void editor.saveDraft(saveOptions)
}

/** 「保存并启用」：走 editor.publish（状态置为启用）。 */
function onPublish() {
  void editor.publish(saveOptions)
}
</script>

<template>
  <TeamBuilder
    :team="editor.draft.value"
    :mode="'create'"
    :issues="editor.issues.value"
    :saving="editor.saving.value"
    :error="editor.error.value"
    :prefilled="prefilled"
    @close="requestListLeave"
    @save="onSave"
    @publish="onPublish"
  />

  <UModal :open="leavePending" class="ag-confirm-modal" title="放弃未保存的修改？" description="当前修改尚未保存，离开后将丢失。" @update:open="(open) => { if (!open) cancelGuardLeave() }">
    <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelGuardLeave" /><UButton label="放弃修改" color="error" @click="confirmGuardLeave" /></template>
  </UModal>
</template>
