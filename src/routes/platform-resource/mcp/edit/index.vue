<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import McpForm from '@/routes/platform-resource/mcp/components/mcp-form/index.vue'
import { useMcpEditor } from '@/hooks/useMcpEditor'
import { useSnapshotDirty, useUnsavedGuard } from '@/hooks/useFormHelpers'

defineOptions({ name: 'McpResourceEdit' })

const route = useRoute()
const router = useRouter()
const editor = useMcpEditor()

const serverId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})

/** 页头标题：加载完成时的名称，编辑中不跟着输入变。 */
const loadedName = ref('')

/** 返回键 / Esc 回详情页，脏时先确认。 */
const detailTarget = computed(() => ({ name: 'mcp-detail', params: { id: String(serverId.value) } }))

const snapshot = useSnapshotDirty(
  () => editor.draft.value,
  { resetOn: () => editor.loadingDetail.value || editor.notFound.value || Boolean(editor.loadError.value) },
)
const guard = useUnsavedGuard(snapshot.dirty, {
  navigate: (target) => void router.push(target as Parameters<typeof router.push>[0]),
  onConfirm: () => snapshot.reset(),
})
const { pending: leavePending, requestLeave, confirmLeave, cancelLeave } = guard

async function load() {
  if (!Number.isInteger(serverId.value)) {
    editor.notFound.value = true
    return
  }
  loadedName.value = ''
  await editor.openEdit(serverId.value)
  loadedName.value = editor.draft.value.name
  snapshot.reset()
}

watch(serverId, () => { void load() }, { immediate: true })

const saveOptions = { onSaved: () => snapshot.reset() }
</script>

<template>
  <main v-if="editor.notFound.value" :class="$style.notFound">
    <UEmpty variant="naked" icon="i-lucide-server-off" title="MCP server 不存在">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="editor.goToList" />
      </template>
    </UEmpty>
  </main>
  <main v-else-if="editor.loadError.value" :class="$style.notFound">
    <UEmpty variant="naked" icon="i-lucide-cloud-off" title="MCP server 加载失败" :description="editor.loadError.value">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="ghost" @click="editor.goToList" />
        <UButton icon="i-lucide-refresh-cw" label="重试" color="neutral" variant="outline" @click="load" />
      </template>
    </UEmpty>
  </main>
  <main v-else-if="editor.readOnly.value" :class="$style.notFound">
    <UEmpty variant="naked" icon="i-lucide-lock" title="没有修改权限">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" label="返回详情" color="neutral" variant="outline" @click="router.push(detailTarget)" />
      </template>
    </UEmpty>
  </main>
  <McpForm
    v-else
    :server="editor.draft.value"
    :title="loadedName || '编辑 MCP Server'"
    :issues="editor.issues.value"
    :saving="editor.saving.value"
    :can-manage-shared="editor.canManageShared.value"
    :loading="editor.loadingDetail.value"
    :error="editor.error.value"
    @close="requestLeave(detailTarget)"
    @save="editor.saveDraft(saveOptions)"
    @publish="editor.publish(saveOptions)"
  />

  <UModal :open="leavePending" title="放弃未保存的修改？" description="离开后修改将丢失。" @update:open="(open) => { if (!open) cancelLeave() }">
    <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelLeave" /><UButton label="放弃修改" color="error" @click="confirmLeave" /></template>
  </UModal>
</template>

<style module src="./index.module.css"></style>
