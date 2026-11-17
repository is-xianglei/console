<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TeamForm from '../components/team-form/index.vue'
import { useSnapshotDirty, useUnsavedGuard } from '@/hooks/useFormHelpers'
import { useTeamEditor } from '@/hooks/useTeamEditor'

defineOptions({ name: 'TeamResourceCreate' })

const route = useRoute()
const router = useRouter()
const editor = useTeamEditor()

const listTarget = { name: 'platform-resource', params: { module: 'build', resource: 'teams' } } as const

/** ?duplicate=<id>：复制已有 Team 作为草稿起点。 */
const duplicateId = computed(() => {
  const raw = route.query.duplicate
  const value = Number(Array.isArray(raw) ? raw[0] : raw)
  return Number.isInteger(value) && value > 0 ? value : undefined
})

const opening = ref(true)

const snapshot = useSnapshotDirty(() => editor.draft.value, { resetOn: () => opening.value })
const guard = useUnsavedGuard(snapshot.dirty, {
  navigate: (target) => void router.push(target as Parameters<typeof router.push>[0]),
  onConfirm: () => snapshot.reset(),
})
const { pending: leavePending, requestLeave, confirmLeave, cancelLeave } = guard

watch(
  duplicateId,
  async (id) => {
    opening.value = true
    await editor.openCreate(id)
    snapshot.reset()
    opening.value = false
  },
  { immediate: true },
)

/** 保存成功、跳到详情之前重置快照，避免离开守卫拦下这次跳转。 */
const saveOptions = { onSaved: () => snapshot.reset() }
</script>

<template>
  <main v-if="!editor.canManage.value" :class="$style.notice">
    <UEmpty variant="naked" icon="i-lucide-lock" title="只有工作区 owner 或 admin 可以新建 Team">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="editor.goToList" />
      </template>
    </UEmpty>
  </main>
  <TeamForm
    v-else
    :team="editor.draft.value"
    title="新建 Team"
    :issues="editor.issues.value"
    :saving="editor.saving.value"
    :loading="editor.loadingDetail.value"
    :save-error="editor.saveError.value"
    @close="requestLeave(listTarget)"
    @save="editor.save(saveOptions)"
  />

  <UModal :open="leavePending" title="放弃未保存的修改？" description="离开后修改将丢失。" @update:open="(open) => { if (!open) cancelLeave() }">
    <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelLeave" /><UButton label="放弃修改" color="error" @click="confirmLeave" /></template>
  </UModal>
</template>

<style module src="./index.module.css"></style>
