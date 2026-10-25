<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PlanBuilder from '../../components/plan-builder/index.vue'
import { usePlanEditor } from '@/hooks/usePlanEditor'
import { useSnapshotDirty, useUnsavedGuard } from '@/hooks/useFormHelpers'

defineOptions({ name: 'PlanResourceCreate' })

const route = useRoute()
const router = useRouter()
const editor = usePlanEditor()

const duplicateId = computed(() => {
  const value = Number(route.query.duplicate)
  return Number.isFinite(value) && value > 0 ? value : undefined
})

/** 回列表的目标路由，供 Builder 返回 / Esc 走外层守卫。 */
const listTarget = { name: 'platform-resource', params: { module: 'build', resource: 'plans' } } as const

/** create 页脏检查（B-3）：?duplicate 加载完成后重置快照，避免刚复制就判脏。 */
const snapshot = useSnapshotDirty(
  () => editor.draft.value,
  { resetOn: () => editor.loadingDetail.value },
)
const guard = useUnsavedGuard(snapshot.dirty, {
  navigate: (target) => void router.push(target as Parameters<typeof router.push>[0]),
  onConfirm: () => snapshot.reset(),
})
const { pending: leavePending, requestLeave: requestGuardLeave, confirmLeave: confirmGuardLeave, cancelLeave: cancelGuardLeave } = guard

/** 草稿是否已从复制源预填：仅 ?duplicate 加载成功时为 true，供步骤条直接标记已完成的步骤。 */
const prefilled = ref(false)

watch(
  () => [route.fullPath, duplicateId.value] as const,
  () => {
    const sourceId = duplicateId.value
    prefilled.value = false
    void editor.openCreate(sourceId).then(() => {
      // openCreate 在复制源加载失败时写 error 并回落为空草稿。
      prefilled.value = sourceId != null && !editor.error.value
      snapshot.reset()
    })
  },
  { immediate: true },
)

/** Builder 返回键 / Esc 统一声请离开；干净时直达列表，脏时弹确认。 */
function requestListLeave() {
  requestGuardLeave(listTarget)
}

/** 保存成功、跳回列表之前重置基线快照，避免离开守卫把保存后的跳转当成「未保存离开」。 */
const saveOptions = { onSaved: () => snapshot.reset() }

function onSave() {
  void editor.saveDraft(saveOptions)
}

function onPublish() {
  void editor.publish(saveOptions)
}
</script>

<template>
  <PlanBuilder
    :plan="editor.draft.value"
    :mode="'create'"
    :issues="editor.issues.value"
    :agents="editor.agents.value"
    :saving="editor.saving.value"
    :error="editor.error.value"
    :prefilled="prefilled"
    @close="requestListLeave"
    @save="onSave"
    @publish="onPublish"
  />

  <UModal :open="leavePending" class="ag-confirm-modal" title="放弃未保存的修改？" description="当前修改尚未保存到后端，离开后将丢失。" @update:open="(open) => { if (!open) cancelGuardLeave() }">
    <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelGuardLeave" /><UButton label="放弃修改" color="error" @click="confirmGuardLeave" /></template>
  </UModal>
</template>
