<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AgentForm from '@/routes/platform-resource/agents/components/agent-form/index.vue'
import { useAgentEditor } from '@/hooks/useAgentEditor'
import { useSnapshotDirty, useUnsavedGuard } from '@/hooks/useFormHelpers'

defineOptions({ name: 'AgentResourceCreate' })

const route = useRoute()
const router = useRouter()
const editor = useAgentEditor()

const duplicateId = computed(() => {
  const value = Number(route.query.duplicate)
  return Number.isFinite(value) && value > 0 ? value : undefined
})

/** 回列表的目标路由，供返回键 / Esc 走外层守卫。 */
const listTarget = { name: 'platform-resource', params: { module: 'build', resource: 'agents' } } as const

/** 脏检查：?duplicate 加载完成后重置快照，避免刚复制就判脏。 */
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
  () => {
    void editor.openCreate(duplicateId.value).then(() => snapshot.reset())
  },
  { immediate: true },
)

/** 干净时直达列表，脏时弹确认。 */
function requestListLeave() {
  requestGuardLeave(listTarget)
}

/** 保存成功、跳回列表之前重置基线快照，避免离开守卫把保存后的跳转当成「未保存离开」。 */
const saveOptions = { onSaved: () => snapshot.reset() }

/** 「保存」：按表单当前 isEnabled（新建默认停用）保存。 */
function onSave() {
  void editor.saveDraft(saveOptions)
}

/** 「保存并启用」：走 editor.publish（isEnabled 强制为 true）。 */
function onPublish() {
  void editor.publish(saveOptions)
}
</script>

<template>
  <AgentForm
    :agent="editor.draft.value"
    title="新建智能体"
    :issues="editor.issues.value"
    :skills="editor.skills.value"
    :tools="editor.tools.value"
    :mcp-servers="editor.mcpServers.value"
    :mcp-catalog-error="editor.mcpCatalogError.value"
    :saving="editor.saving.value"
    :loading="editor.loadingDetail.value"
    :catalogs-loading="editor.catalogsLoading.value"
    :error="editor.error.value"
    @close="requestListLeave"
    @save="onSave"
    @publish="onPublish"
  />

  <UModal :open="leavePending" title="放弃未保存的修改？" description="离开后修改将丢失。" @update:open="(open) => { if (!open) cancelGuardLeave() }">
    <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelGuardLeave" /><UButton label="放弃修改" color="error" @click="confirmGuardLeave" /></template>
  </UModal>
</template>
