<script setup lang="ts">
import { computed, useCssModule, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WorkflowBuilder from '../builder/index.vue'
import { useWorkflowEditor } from '@/hooks/useWorkflowEditor'
import { useSnapshotDirty, useUnsavedGuard } from '@/hooks/useFormHelpers'

defineOptions({ name: 'WorkflowResourceEdit' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const editor = useWorkflowEditor()
const workflowId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})

/** 回列表的目标路由，供 Builder 返回 / Esc / 取消走外层守卫。 */
const listTarget = { name: 'platform-resource', params: { module: 'build', resource: 'workflows' } } as const

/** 页面层脏检查（B-4）：快照由编辑页持有，openEdit 完成 / 保存成功时重置。 */
const snapshot = useSnapshotDirty(
  () => editor.draft.value,
  { resetOn: () => editor.loadingDetail.value || editor.notFound.value },
)
const guard = useUnsavedGuard(snapshot.dirty, {
  navigate: (target) => void router.push(target as Parameters<typeof router.push>[0]),
  onConfirm: () => snapshot.reset(),
})
const { pending: leavePending, requestLeave: requestGuardLeave, confirmLeave: confirmGuardLeave, cancelLeave: cancelGuardLeave } = guard

async function load() {
  // 非法 id（NaN 或空）不发起详情请求，直接走「未找到」空态（B-6）。
  if (Number.isNaN(workflowId.value)) {
    editor.notFound.value = true
    return
  }
  await editor.openEdit(workflowId.value)
  // openEdit 完成（含失败）都把当前草稿作为基线，避免刚加载就判脏。
  snapshot.reset()
}

watch(
  () => workflowId.value,
  () => { void load() },
  { immediate: true },
)

/** Builder 返回键 / Esc / 取消统一声请离开；干净时直达列表，脏时弹确认。 */
function requestListLeave() {
  requestGuardLeave(listTarget)
}

/** Builder 内保存成功后回写基线快照，使脏检查进入已保存态。 */
function onSave() {
  void editor.saveDraft().then((ok) => {
    if (ok) snapshot.reset()
  })
}
</script>

<template>
  <WorkflowBuilder
    v-if="!editor.loadingDetail.value && !editor.notFound.value"
    :workflow="editor.draft.value"
    :mode="'edit'"
    :issues="editor.issues.value"
    :agents="editor.agents.value"
    :saving="editor.saving.value"
    :error="editor.error.value"
    @close="requestListLeave"
    @save="onSave"
  />
  <main v-else-if="editor.loadingDetail.value" :class="styles['wf-loading']">
    <div :class="styles['wf-loading-inner']"><UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" :class="styles['wf-loading-back']" aria-label="返回列表" @click="editor.goToList" /><span class="mono">正在加载 Workflow 定义…</span></div>
  </main>
  <main v-else :class="styles['wf-not-found']">
    <UAlert color="error" variant="subtle" icon="i-lucide-circle-alert" title="Workflow 详情加载失败" description="未找到该 Workflow，可能已被删除或工作区已切换。" :actions="[{ label: '返回列表', color: 'neutral', variant: 'outline', onClick: editor.goToList }]" />
  </main>

  <UModal :open="leavePending" class="ag-confirm-modal" title="放弃未保存的修改？" description="当前修改尚未保存到后端，离开后将丢失。" @update:open="(open) => { if (!open) cancelGuardLeave() }">
    <template #body><p class="modal-copy">当前修改尚未保存到后端，离开后将丢失。</p></template>
    <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelGuardLeave" /><UButton label="放弃修改" color="error" @click="confirmGuardLeave" /></template>
  </UModal>
</template>

<style module src="./index.module.css"></style>
