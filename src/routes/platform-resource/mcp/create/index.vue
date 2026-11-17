<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import McpForm from '@/routes/platform-resource/mcp/components/mcp-form/index.vue'
import { useMcpEditor } from '@/hooks/useMcpEditor'
import { useSnapshotDirty, useUnsavedGuard } from '@/hooks/useFormHelpers'

defineOptions({ name: 'McpResourceCreate' })

const router = useRouter()
const editor = useMcpEditor()

const listTarget = { name: 'platform-resource', params: { module: 'build', resource: 'mcp' } } as const

const snapshot = useSnapshotDirty(() => editor.draft.value)
const guard = useUnsavedGuard(snapshot.dirty, {
  navigate: (target) => void router.push(target as Parameters<typeof router.push>[0]),
  onConfirm: () => snapshot.reset(),
})
const { pending: leavePending, requestLeave, confirmLeave, cancelLeave } = guard

onMounted(() => {
  editor.openCreate()
  snapshot.reset()
})

/** 保存成功、跳到详情之前重置快照，避免离开守卫拦下这次跳转。 */
const saveOptions = { onSaved: () => snapshot.reset() }
</script>

<template>
  <McpForm
    :server="editor.draft.value"
    title="新建 MCP Server"
    :issues="editor.issues.value"
    :saving="editor.saving.value"
    :can-manage-shared="editor.canManageShared.value"
    :error="editor.error.value"
    @close="requestLeave(listTarget)"
    @save="editor.saveDraft(saveOptions)"
    @publish="editor.publish(saveOptions)"
  />

  <UModal :open="leavePending" title="放弃未保存的修改？" description="离开后修改将丢失。" @update:open="(open) => { if (!open) cancelLeave() }">
    <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelLeave" /><UButton label="放弃修改" color="error" @click="confirmLeave" /></template>
  </UModal>
</template>
