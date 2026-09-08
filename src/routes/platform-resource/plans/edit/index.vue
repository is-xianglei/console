<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import PlanBuilder from '../../components/plan-builder/index.vue'
import { usePlanEditor } from '@/hooks/usePlanEditor'

defineOptions({ name: 'PlanResourceEdit' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const editor = usePlanEditor()
const planId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})

/** 路由级离开守卫：浏览器退回/切侧栏等绕开 Builder 返回按钮时兜底。 */
const savedSnapshot = ref('')
const confirmLeave = ref(false)
const pendingTarget = ref<Parameters<typeof router.replace>[0] | null>(null)
const dirty = computed(() =>
  editor.loadingDetail.value ? false : JSON.stringify(editor.draft.value) !== savedSnapshot.value,
)

async function load() {
  const ok = await editor.openEdit(planId.value)
  if (ok) savedSnapshot.value = JSON.stringify(editor.draft.value)
}

watch(
  () => planId.value,
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
    // 重置快照避免守卫对目标路由再次拦截。
    savedSnapshot.value = JSON.stringify(editor.draft.value)
    void router.replace(target)
  }
}

/** Builder 内保存/发布成功后回写基线快照，使脏检查进入已保存态。 */
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
  <PlanBuilder
    v-if="!editor.loadingDetail.value"
    :plan="editor.draft.value"
    :mode="'edit'"
    :issues="editor.issues.value"
    :agents="editor.agents.value"
    :saving="editor.saving.value"
    :error="editor.error.value"
    @close="editor.goToList"
    @save="onSave"
    @publish="onPublish"
  />
  <main v-else :class="styles['pl-loading']">
    <div :class="styles['pl-loading-inner']"><UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" :class="styles['pl-loading-back']" aria-label="返回列表" @click="editor.goToList" /><span class="mono">正在加载编排方案定义…</span></div>
  </main>

  <UModal :open="confirmLeave" class="ag-confirm-modal" title="放弃未保存的修改？" description="当前修改尚未保存到后端，离开后将丢失。">
    <template #body><p :class="styles['pl-modal-copy']">当前修改尚未保存到后端，离开后将丢失。</p></template>
    <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelLeave" /><UButton label="放弃修改" color="error" @click="confirmLeaveExit" /></template>
  </UModal>
</template>

<style module src="./index.module.css"></style>
