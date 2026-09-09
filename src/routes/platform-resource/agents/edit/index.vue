<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import AgentBuilder from '@/routes/platform-resource/components/agent-builder/index.vue'
import { useAgentEditor } from '@/hooks/useAgentEditor'

defineOptions({ name: 'AgentResourceEdit' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const editor = useAgentEditor()

const agentId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})

const savedSnapshot = ref('')
const confirmLeave = ref(false)
const pendingTarget = ref<Parameters<typeof router.replace>[0] | null>(null)
const dirty = computed(() =>
  editor.loadingDetail.value || editor.notFound.value
    ? false
    : JSON.stringify(editor.draft.value) !== savedSnapshot.value,
)

async function load() {
  // 非法 id（NaN 或空）不发起详情请求，直接走「未找到」空态（B-6）。
  if (Number.isNaN(agentId.value)) {
    editor.notFound.value = true
    return
  }
  const ok = await editor.openEdit(agentId.value)
  if (ok) savedSnapshot.value = JSON.stringify(editor.draft.value)
}

watch(
  () => agentId.value,
  () => { void load() },
  { immediate: true },
)

onBeforeRouteLeave((to) => {
  if (!dirty.value) return true
  pendingTarget.value = to
  confirmLeave.value = true
  return false
})

function cancelLeave() {
  confirmLeave.value = false
}

function confirmLeaveExit() {
  confirmLeave.value = false
  if (pendingTarget.value) {
    const target = pendingTarget.value
    pendingTarget.value = null
    savedSnapshot.value = JSON.stringify(editor.draft.value)
    void router.replace(target)
  }
}

/** Builder 内保存成功后回写基线快照，使脏检查进入已保存态。 */
function onSave() {
  void editor.saveDraft().then((ok) => {
    if (ok) savedSnapshot.value = JSON.stringify(editor.draft.value)
  })
}

function onPublish() {
  void editor.publish().then((ok) => {
    if (ok) savedSnapshot.value = JSON.stringify(editor.draft.value)
  })
}
</script>

<template>
  <AgentBuilder
    v-if="!editor.loadingDetail.value && !editor.notFound.value"
    :agent="editor.draft.value"
    :mode="'edit'"
    :issues="editor.issues.value"
    :skills="editor.skills.value"
    :tools="editor.tools.value"
    :saving="editor.saving.value"
    :error="editor.error.value"
    @close="editor.goToList"
    @save="onSave"
    @publish="onPublish"
  />
  <main v-else-if="editor.loadingDetail.value" :class="styles['ag-loading']">
    <div :class="styles['ag-loading-inner']"><UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" :class="styles['ag-loading-back']" aria-label="返回列表" @click="editor.goToList" /><span class="mono">正在加载 Agent 定义…</span></div>
  </main>
  <main v-else :class="styles['ag-not-found']">
    <UAlert color="error" variant="subtle" icon="i-lucide-circle-alert" title="Agent 详情加载失败" description="未找到该 Agent，可能已被删除或工作区已切换。" :actions="[{ label: '返回列表', color: 'neutral', variant: 'outline', onClick: editor.goToList }]" />
  </main>

  <UModal :open="confirmLeave" class="ag-confirm-modal" title="放弃未保存的修改？" description="当前修改尚未保存到后端，离开后将丢失。">
    <template #body><p :class="styles['ag-modal-copy']">当前修改尚未保存到后端，离开后将丢失。</p></template>
    <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelLeave" /><UButton label="放弃修改" color="error" @click="confirmLeaveExit" /></template>
  </UModal>
</template>

<style module src="./index.module.css"></style>
