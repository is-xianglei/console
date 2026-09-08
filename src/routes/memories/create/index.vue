<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import MemoryForm from '../components/memory-form/index.vue'
import { useMemoryEditor } from '@/hooks/useMemoryEditor'

defineOptions({ name: 'MemoryCreatePage' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const editor = useMemoryEditor()

const duplicateId = computed(() => {
  const value = Number(route.query.duplicate)
  return Number.isFinite(value) && value > 0 ? value : undefined
})
const error = computed(() => editor.error.value)

/** 路由级离开守卫：与编辑页一致，避免未保存草稿被静默丢弃。 */
const savedSnapshot = ref('')
const confirmLeave = ref(false)
const pendingTarget = ref<Parameters<typeof router.replace>[0] | null>(null)
const dirty = computed(
  () => editor.loadingDetail.value ? false : JSON.stringify(editor.draft.value) !== savedSnapshot.value,
)

async function load() {
  await editor.openCreate(duplicateId.value)
  savedSnapshot.value = JSON.stringify(editor.draft.value)
}

watch(
  () => [route.fullPath, duplicateId.value] as const,
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

function onSave() {
  void editor.saveDraft().then((ok) => {
    if (ok) savedSnapshot.value = JSON.stringify(editor.draft.value)
  })
}

function onCancel() {
  editor.goToList()
}
</script>

<template>
  <main :class="styles.page">
    <header :class="styles.header">
      <div :class="styles.heading">
        <div :class="[$style.kicker, 'mono']">NEW MEMORY</div>
        <nav :class="styles.breadcrumb" aria-label="面包屑">
          <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" label="返回列表" @click="onCancel" />
        </nav>
        <div :class="styles.titleRow">
          <h1>新建 Memory</h1>
        </div>
        <p>显式创建一条长期记忆，提供稳定标识、类型、标题、摘要与 Markdown 正文。</p>
      </div>
    </header>

    <UAlert v-if="error" :class="$style.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" role="alert" />

    <div :class="styles.shell">
      <div v-if="editor.loadingDetail.value" :class="styles.loading">
        <USkeleton class="h-6 w-2/5" />
        <USkeleton class="h-20 w-full" />
        <USkeleton class="h-64 w-full" />
      </div>
      <MemoryForm
        v-else
        :model="editor.draft.value"
        :creating="true"
        :issues="editor.issues.value"
        :saving="editor.saving.value"
        :error="error"
        @cancel="onCancel"
        @save="onSave"
      />
    </div>

    <UModal :open="confirmLeave" class="ag-confirm-modal" title="放弃未保存的修改？" description="当前修改尚未保存到后端，离开后将丢失。">
      <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelLeave" /><UButton label="放弃修改" color="error" @click="confirmLeaveExit" /></template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
