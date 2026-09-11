<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TeamBuilder from '../../components/team-builder/index.vue'
import { useTeamEditor } from '@/hooks/useTeamEditor'
import { useSaveFeedback } from '@/hooks/useSaveFeedback'
import { useSnapshotDirty, useUnsavedGuard } from '@/hooks/useFormHelpers'

defineOptions({ name: 'TeamResourceCreate' })

const route = useRoute()
const router = useRouter()
const editor = useTeamEditor()
const saveFeedback = useSaveFeedback({
  listRoute: { name: 'platform-resource', params: { module: 'build', resource: 'teams' } },
})

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

watch(
  () => [route.fullPath, duplicateId.value] as const,
  () => { editor.openCreate(duplicateId.value); snapshot.reset() },
  { immediate: true },
)

/** Builder 返回键 / Esc 统一声请离开；干净时直达列表，脏时弹确认。 */
function requestListLeave() {
  requestGuardLeave(listTarget)
}

/** 保存草稿成功后回列表并高亮该 Team，失败时留在页面处理校验问题。 */
function onSave() {
  void editor.saveDraft().then(async (ok) => {
    if (!ok) return
    snapshot.reset()
    await saveFeedback.afterSave({ id: editor.draft.value.id, message: `Team「${editor.draft.value.name}」已保存` })
  })
}
</script>

<template>
  <TeamBuilder
    :team="editor.draft.value"
    :mode="'create'"
    :issues="editor.issues.value"
    :saving="editor.saving.value"
    :error="editor.error.value"
    @close="requestListLeave"
    @save="onSave"
    @publish="onSave"
  />

  <UModal :open="leavePending" class="ag-confirm-modal" title="放弃未保存的修改？" description="当前修改尚未保存，离开后将丢失。" @update:open="(open) => { if (!open) cancelGuardLeave() }">
    <template #body><p class="modal-copy">当前修改尚未保存，离开后将丢失。</p></template>
    <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelGuardLeave" /><UButton label="放弃修改" color="error" @click="confirmGuardLeave" /></template>
  </UModal>
</template>
