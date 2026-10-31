<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@nuxt/ui/composables'
import { useSkillEditor } from '@/hooks/useSkillEditor'
import { useSnapshotDirty, useUnsavedGuard } from '@/hooks/useFormHelpers'
import SkillForm from '@/routes/skills/components/skill-form/index.vue'

/** 新建（skill-create）与编辑（skill-edit）共用本页，模式由路由名决定。 */
defineOptions({ name: 'SkillEditPage' })

const styles = useCssModule()
const router = useRouter()
const toast = useToast()
const editor = useSkillEditor()
const formRef = ref<InstanceType<typeof SkillForm> | null>(null)

const snapshot = useSnapshotDirty(
  () => editor.draft.value,
  { resetOn: () => editor.loading.value },
)
const leaveGuard = useUnsavedGuard(snapshot.dirty, {
  navigate: (target) => { void router.push(target as Parameters<typeof router.push>[0]) },
  onConfirm: () => snapshot.reset(),
})

const creating = computed(() => editor.creating.value)
/** 编辑时详情没加载出来就不渲染表单。 */
const ready = computed(() => creating.value || (!editor.loading.value && !editor.loadError.value))
const backTarget = computed(() => (
  creating.value
    ? { name: 'skills' }
    : { name: 'skill-detail', params: { id: String(editor.skillId.value) } }
))

async function load() {
  if (creating.value) editor.openCreate()
  else await editor.openEdit()
  snapshot.reset()
}

watch(() => [creating.value, editor.skillId.value] as const, () => { void load() }, { immediate: true })

function onCancel() {
  leaveGuard.requestLeave(backTarget.value)
}

async function onSave() {
  const saved = await editor.save()
  if (!saved) {
    await nextTick()
    void formRef.value?.showErrors()
    return
  }
  // 先重置基线，否则离开守卫会拦下这次跳转。
  snapshot.reset()
  toast.add({ title: creating.value ? `技能「${saved.name}」已创建` : '技能已保存', color: 'success', icon: 'i-lucide-check' })
  void router.push({ name: 'skill-detail', params: { id: String(saved.id) } })
}

onScopeDispose(() => {
  leaveGuard.cancelLeave()
})
</script>

<template>
  <main :class="styles.page">
    <header :class="styles.header">
      <div :class="styles.heading">
        <nav :class="styles.breadcrumb" aria-label="面包屑">
          <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" :label="creating ? '技能库' : '返回详情'" @click="onCancel" />
        </nav>
        <div :class="styles.titleRow">
          <h1>{{ creating ? '新建技能' : '编辑技能' }}</h1>
          <span v-if="!creating && editor.draft.value.name" :class="[styles.ver, 'mono']">{{ editor.draft.value.name }}</span>
        </div>
      </div>
      <div v-if="ready" :class="styles.actions">
        <UButton color="neutral" variant="outline" label="取消" :disabled="editor.saving.value" @click="onCancel" />
        <UButton color="primary" icon="i-lucide-save" label="保存" :loading="editor.saving.value" @click="formRef?.submit()" />
      </div>
    </header>

    <div v-if="editor.loading.value" :class="styles.loading">
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-20 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>

    <UEmpty v-else-if="editor.notFound.value" variant="naked" icon="i-lucide-package-search" title="技能不存在">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="router.push({ name: 'skills' })" />
      </template>
    </UEmpty>

    <UAlert
      v-else-if="editor.loadError.value"
      :class="styles.alert"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="editor.loadError.value"
      :actions="[
        { label: '重试', color: 'neutral', variant: 'outline', onClick: load },
        { label: '返回详情', color: 'neutral', variant: 'ghost', onClick: () => router.push(backTarget) },
      ]"
    />

    <div v-else :class="styles.shell">
      <SkillForm
        ref="formRef"
        :model="editor.draft.value"
        :creating="creating"
        :issues="editor.issues.value"
        :form-error="editor.formError.value"
        @save="onSave"
      />
    </div>

    <UModal :open="leaveGuard.pending.value" class="ag-confirm-modal" title="放弃未保存的修改？" description="当前修改尚未保存，离开后将丢失。" @update:open="(open: boolean) => { if (!open) leaveGuard.cancelLeave() }">
      <template #footer>
        <UButton label="继续编辑" color="neutral" variant="outline" @click="leaveGuard.cancelLeave()" />
        <UButton label="放弃修改" color="error" @click="leaveGuard.confirmLeave()" />
      </template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
