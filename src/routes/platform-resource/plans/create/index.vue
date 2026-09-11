<script setup lang="ts">
import { computed, watch } from 'vue'
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

watch(
  () => [route.fullPath, duplicateId.value] as const,
  () => { void editor.openCreate(duplicateId.value).then(() => snapshot.reset()) },
  { immediate: true },
)

/** Builder 返回键 / Esc 统一声请离开；干净时直达列表，脏时弹确认。 */
function requestListLeave() {
  requestGuardLeave(listTarget)
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
    @close="requestListLeave"
    @save="editor.saveDraft"
    @publish="editor.publish"
  />

  <UModal :open="leavePending" class="ag-confirm-modal" title="放弃未保存的修改？" description="当前修改尚未保存到后端，离开后将丢失。" @update:open="(open) => { if (!open) cancelGuardLeave() }">
    <template #body><p class="modal-copy">当前修改尚未保存到后端，离开后将丢失。</p></template>
    <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelGuardLeave" /><UButton label="放弃修改" color="error" @click="confirmGuardLeave" /></template>
  </UModal>
</template>
