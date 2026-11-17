<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TeamForm from '../components/team-form/index.vue'
import { useSnapshotDirty, useUnsavedGuard } from '@/hooks/useFormHelpers'
import { useTeamEditor } from '@/hooks/useTeamEditor'

defineOptions({ name: 'TeamResourceEdit' })

const route = useRoute()
const router = useRouter()
const editor = useTeamEditor()

const teamId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})

/** 页头标题：加载完成时的名称，编辑中不跟着输入变。 */
const loadedName = ref('')

/** 返回键 / Esc 回详情页，脏时先确认。 */
const detailTarget = computed(() => ({ name: 'team-detail', params: { id: String(teamId.value) } }))

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
  if (!Number.isInteger(teamId.value) || teamId.value <= 0) {
    editor.notFound.value = true
    return
  }
  loadedName.value = ''
  await editor.openEdit(teamId.value)
  loadedName.value = editor.draft.value.name
  snapshot.reset()
}

watch(teamId, () => { void load() }, { immediate: true })

const saveOptions = { onSaved: () => snapshot.reset() }
</script>

<template>
  <main v-if="editor.notFound.value" :class="$style.notice">
    <UEmpty variant="naked" icon="i-lucide-users-round" title="Team 不存在">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="editor.goToList" />
      </template>
    </UEmpty>
  </main>
  <main v-else-if="editor.loadError.value" :class="$style.notice">
    <UEmpty variant="naked" icon="i-lucide-cloud-off" title="Team 加载失败" :description="editor.loadError.value">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="ghost" @click="editor.goToList" />
        <UButton icon="i-lucide-refresh-cw" label="重试" color="neutral" variant="outline" @click="load" />
      </template>
    </UEmpty>
  </main>
  <main v-else-if="!editor.canManage.value" :class="$style.notice">
    <UEmpty variant="naked" icon="i-lucide-lock" title="只有工作区 owner 或 admin 可以修改 Team">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" label="返回详情" color="neutral" variant="outline" @click="router.push(detailTarget)" />
      </template>
    </UEmpty>
  </main>
  <TeamForm
    v-else
    :team="editor.draft.value"
    :title="loadedName || '编辑 Team'"
    :issues="editor.issues.value"
    :saving="editor.saving.value"
    :loading="editor.loadingDetail.value"
    :save-error="editor.saveError.value"
    @close="requestLeave(detailTarget)"
    @save="editor.save(saveOptions)"
  />

  <UModal :open="leavePending" title="放弃未保存的修改？" description="离开后修改将丢失。" @update:open="(open) => { if (!open) cancelLeave() }">
    <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelLeave" /><UButton label="放弃修改" color="error" @click="confirmLeave" /></template>
  </UModal>
</template>

<style module src="./index.module.css"></style>
