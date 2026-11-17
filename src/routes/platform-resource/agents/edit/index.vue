<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AgentForm from '@/routes/platform-resource/agents/components/agent-form/index.vue'
import { useAgentEditor } from '@/hooks/useAgentEditor'
import { useSnapshotDirty, useUnsavedGuard } from '@/hooks/useFormHelpers'

defineOptions({ name: 'AgentResourceEdit' })

const route = useRoute()
const router = useRouter()
const editor = useAgentEditor()

const agentId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})

/** 页头标题：加载完成时的名称，编辑中不跟着输入变。 */
const loadedName = ref('')

/** 回列表的目标路由，供返回键 / Esc 走外层守卫。 */
const listTarget = { name: 'platform-resource', params: { module: 'build', resource: 'agents' } } as const

/** 脏检查：快照由编辑页持有，openEdit 完成 / 保存成功时重置。 */
const snapshot = useSnapshotDirty(
  () => editor.draft.value,
  { resetOn: () => editor.loadingDetail.value || editor.notFound.value || Boolean(editor.loadError.value) },
)
const guard = useUnsavedGuard(snapshot.dirty, {
  navigate: (target) => void router.push(target as Parameters<typeof router.push>[0]),
  onConfirm: () => snapshot.reset(),
})
const { pending: leavePending, requestLeave: requestGuardLeave, confirmLeave: confirmGuardLeave, cancelLeave: cancelGuardLeave } = guard

async function load() {
  // 非法 id 不发起详情请求，直接显示「不存在」。
  if (Number.isNaN(agentId.value)) {
    editor.notFound.value = true
    return
  }
  loadedName.value = ''
  await editor.openEdit(agentId.value)
  loadedName.value = editor.draft.value.name
  // openEdit 完成（含失败）都把当前草稿作为基线，避免刚加载就判脏。
  snapshot.reset()
}

watch(
  () => agentId.value,
  () => { void load() },
  { immediate: true },
)

/** 干净时直达列表，脏时弹确认。 */
function requestListLeave() {
  requestGuardLeave(listTarget)
}

/** 保存成功后、跳回列表之前重置基线快照，否则离开守卫会用旧快照拦下这次跳转。 */
const saveOptions = { onSaved: () => snapshot.reset() }

function onSave() {
  void editor.saveDraft(saveOptions)
}

function onPublish() {
  void editor.publish(saveOptions)
}
</script>

<template>
  <main v-if="editor.notFound.value" :class="$style.notFound">
    <UEmpty variant="naked" icon="i-lucide-bot-off" title="智能体不存在">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="editor.goToList" />
      </template>
    </UEmpty>
  </main>
  <main v-else-if="editor.loadError.value" :class="$style.notFound">
    <UEmpty variant="naked" icon="i-lucide-cloud-off" title="智能体加载失败" :description="editor.loadError.value">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="ghost" @click="editor.goToList" />
        <UButton icon="i-lucide-refresh-cw" label="重试" color="neutral" variant="outline" @click="load" />
      </template>
    </UEmpty>
  </main>
  <AgentForm
    v-else
    :agent="editor.draft.value"
    :title="loadedName || '编辑智能体'"
    :issues="editor.issues.value"
    :skills="editor.skills.value"
    :tools="editor.tools.value"
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

<style module src="./index.module.css"></style>
