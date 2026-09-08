<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import GroupForm from '../components/group-form/index.vue'
import { useGroupEditor } from '@/hooks/useGroupEditor'

defineOptions({ name: 'GroupResourceCreate' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const editor = useGroupEditor()

const savedSnapshot = ref('')
const confirmLeave = ref(false)
const pendingTarget = ref<Parameters<typeof router.replace>[0] | null>(null)
const dirty = computed(() =>
  editor.loadingDetail.value ? false : JSON.stringify(editor.draft.value) !== savedSnapshot.value,
)

async function load() {
  await editor.openCreate()
  savedSnapshot.value = JSON.stringify(editor.draft.value)
}

watch(
  () => route.fullPath,
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
</script>

<template>
  <main :class="styles.page">
    <header :class="styles.header">
      <div :class="styles.heading">
        <nav :class="styles.breadcrumb" aria-label="面包屑"><span>组织管理</span><i class="icon icon-chevron-right"></i><span>群组</span><i class="icon icon-chevron-right"></i><strong>新建</strong></nav>
        <div :class="styles.titleRow">
          <span :class="styles.titleIcon"><UIcon name="i-lucide-users-round" /></span>
          <div><h1>新建群组</h1><p>填写名称、唯一标识、类型、可见性与加入方式，数据将直接写入当前工作区。</p></div>
        </div>
      </div>
      <div :class="styles.headerActions"><UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="editor.goToList" /></div>
    </header>

    <UAlert v-if="editor.error.value" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="editor.error.value" role="alert" />

    <section :class="styles.formShell" aria-label="群组表单">
      <div v-if="editor.loadingDetail.value" :class="styles.formLoading"><USkeleton class="h-6 w-2/5" /><USkeleton class="h-20 w-full" /><USkeleton class="h-40 w-full" /></div>
      <GroupForm v-else :model="editor.draft.value" :creating="true" :issues="editor.issues.value" :saving="editor.saving.value" @cancel="editor.goToList" @save="onSave" />
    </section>

    <UModal :open="confirmLeave" title="放弃未保存的修改？" description="当前修改尚未保存到后端，离开后将丢失。">
      <template #body><p :class="styles.modalCopy">当前修改尚未保存到后端，离开后将丢失。</p></template>
      <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelLeave" /><UButton label="放弃修改" color="error" @click="confirmLeaveExit" /></template>
    </UModal>
  </main>
</template>

<style module src="../shared/index.module.css"></style>
