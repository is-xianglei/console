<script setup lang="ts">
import { computed, useCssModule, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TeamBuilder from '../../components/team-builder/index.vue'
import { useTeamEditor } from '@/hooks/useTeamEditor'
import { useSnapshotDirty, useUnsavedGuard } from '@/hooks/useFormHelpers'

defineOptions({ name: 'TeamResourceEdit' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const editor = useTeamEditor()
/**
 * 回列表的目标路由，供 Builder 返回 / Esc / 取消走外层守卫。
 * 编辑页保存后由 editor 跳到详情页，回列表仍走 listTarget。
 */
const listTarget = { name: 'platform-resource', params: { module: 'build', resource: 'teams' } } as const

/** Teams 的 id 是「TEAM-0001」形态的目录编号，取路径参数原样使用。 */
const teamId = computed(() => {
  const raw = route.params.id
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value.trim() : ''
})

/** 页面层脏检查：快照由编辑页持有，openEdit 完成 / 保存成功时重置。 */
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
  // 空 id 不发起详情加载，直接走「未找到」空态。
  if (!teamId.value) {
    editor.notFound.value = true
    return
  }
  await editor.openEdit(teamId.value)
  // openEdit 完成（含失败）都把当前草稿作为基线，避免刚加载就判脏。
  snapshot.reset()
}

watch(
  () => teamId.value,
  () => { void load() },
  { immediate: true },
)

/** Builder 返回键 / Esc 统一声请离开；干净时直达列表，脏时弹确认。 */
function requestListLeave() {
  requestGuardLeave(listTarget)
}

/** 保存成功、跳去详情页之前重置基线快照，使脏检查进入已保存态，离开守卫不拦这次跳转。 */
const saveOptions = { onSaved: () => snapshot.reset() }

/** 「保存草稿」：按表单当前状态保存。 */
function onSave() {
  void editor.saveDraft(saveOptions)
}

/** 「保存并启用」：走 editor.publish（状态置为启用）。 */
function onPublish() {
  void editor.publish(saveOptions)
}
</script>

<template>
  <TeamBuilder
    v-if="!editor.loadingDetail.value && !editor.notFound.value"
    :team="editor.draft.value"
    :mode="'edit'"
    :issues="editor.issues.value"
    :saving="editor.saving.value"
    :error="editor.error.value"
    @close="requestListLeave"
    @save="onSave"
    @publish="onPublish"
  />
  <main v-else-if="editor.loadingDetail.value" :class="styles['tm-loading']">
    <div :class="styles['tm-loading-inner']"><UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" :class="styles['tm-loading-back']" aria-label="返回列表" @click="requestListLeave" /><span class="mono">正在加载 Team 定义…</span></div>
  </main>
  <main v-else :class="styles['tm-not-found']">
    <UAlert color="error" variant="subtle" icon="i-lucide-circle-alert" title="Team 详情加载失败" description="未找到该 Team，可能已被删除或工作区已切换。" :actions="[{ label: '返回列表', color: 'neutral', variant: 'outline', onClick: () => requestGuardLeave(listTarget) }]" />
  </main>

  <UModal :open="leavePending" class="ag-confirm-modal" title="放弃未保存的修改？" description="当前修改尚未保存，离开后将丢失。" @update:open="(open) => { if (!open) cancelGuardLeave() }">
    <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelGuardLeave" /><UButton label="放弃修改" color="error" @click="confirmGuardLeave" /></template>
  </UModal>
</template>

<style module src="./index.module.css"></style>
