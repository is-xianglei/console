<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import MemoryForm from '../components/memory-form/index.vue'
import { useMemoryEditor } from '@/hooks/useMemoryEditor'

defineOptions({ name: 'MemoryEditPage' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const editor = useMemoryEditor()
const memoryId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})

/** 路由级离开守卫：浏览器退回/切侧栏等绕开表单返回按钮时兜底。 */
const savedSnapshot = ref('')
const confirmLeave = ref(false)
const pendingTarget = ref<Parameters<typeof router.replace>[0] | null>(null)
const dirty = computed(() =>
  editor.loadingDetail.value ? false : JSON.stringify(editor.draft.value) !== savedSnapshot.value,
)
const error = computed(() => editor.error.value)

async function load() {
  const ok = await editor.openEdit(memoryId.value)
  if (ok) savedSnapshot.value = JSON.stringify(editor.draft.value)
}

watch(
  () => memoryId.value,
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
        <div :class="[$style.kicker, 'mono']">EDIT MEMORY</div>
        <nav :class="styles.breadcrumb" aria-label="面包屑">
          <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" label="返回列表" @click="onCancel" />
        </nav>
        <div :class="styles.titleRow">
          <h1>编辑 Memory</h1>
          <span v-if="editor.draft.value.id" :class="[$style.recordCount, 'mono']">#{{ editor.draft.value.id }}</span>
        </div>
        <p>修改正文、类型或摘要；保存时会携带乐观锁版本，版本冲突将被后端拒绝。</p>
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
        :creating="false"
        :issues="editor.issues.value"
        :saving="editor.saving.value"
        :error="error"
        @cancel="onCancel"
        @save="onSave"
      />
    </div>

    <UModal :open="confirmLeave" class="ag-confirm-modal" title="放弃未保存的修改？" description="当前修改尚未保存到后端，离开后将丢失。">
      <template #body><p :class="styles.modalCopy">当前修改尚未保存到后端，离开后将丢失。</p></template>
      <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelLeave" /><UButton label="放弃修改" color="error" @click="confirmLeaveExit" /></template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>

