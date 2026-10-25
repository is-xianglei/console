<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import DepartmentForm from '../components/department-form/index.vue'
import { useDepartmentEditor } from '@/hooks/useDepartmentEditor'
import { useOrganizationSupport } from '@/hooks/useOrganizationSupport'

defineOptions({ name: 'DepartmentResourceCreate' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const editor = useDepartmentEditor()
const support = useOrganizationSupport()

/** URL ?parent=<id> 预填上级部门，供详情页「新建下级部门」入口使用。 */
const parentId = computed(() => {
  const value = Number(route.query.parent)
  return Number.isFinite(value) && value > 0 ? value : undefined
})
const parentOptions = computed(() => support.parentDepartmentOptions(null))

const savedSnapshot = ref('')
const confirmLeave = ref(false)
const pendingTarget = ref<Parameters<typeof router.replace>[0] | null>(null)
const dirty = computed(() =>
  editor.loadingDetail.value ? false : JSON.stringify(editor.draft.value) !== savedSnapshot.value,
)

async function load() {
  await editor.openCreate(parentId.value)
  savedSnapshot.value = JSON.stringify(editor.draft.value)
  void support.loadSupportData(editor.workspaceId.value)
}

watch(
  () => [route.fullPath, parentId.value] as const,
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
        <nav :class="styles.breadcrumb" aria-label="面包屑"><span>组织管理</span><i class="icon icon-chevron-right"></i><span>部门</span><i class="icon icon-chevron-right"></i><strong>新建</strong></nav>
        <div :class="styles.titleRow">
          <span :class="styles.titleIcon"><UIcon name="i-lucide-building-2" /></span>
          <div><h1>新建部门</h1><p>填写名称、编码、上级部门与负责人，数据将直接写入当前工作区。</p></div>
        </div>
      </div>
      <div :class="styles.headerActions"><UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="editor.goToList" /></div>
    </header>

    <UAlert v-if="editor.error.value" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="editor.error.value" role="alert" />

    <section :class="styles.formShell" aria-label="部门表单">
      <div v-if="editor.loadingDetail.value" :class="styles.formLoading"><USkeleton class="h-6 w-2/5" /><USkeleton class="h-20 w-full" /><USkeleton class="h-40 w-full" /></div>
      <DepartmentForm v-else :model="editor.draft.value" :creating="true" :issues="editor.issues.value" :parent-options="parentOptions" :user-options="support.userOptions.value" :saving="editor.saving.value" @cancel="editor.goToList" @save="onSave" />
    </section>

    <UModal :open="confirmLeave" title="放弃未保存的修改？" description="当前修改尚未保存到后端，离开后将丢失。">
      <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelLeave" /><UButton label="放弃修改" color="error" @click="confirmLeaveExit" /></template>
    </UModal>
  </main>
</template>

<style module src="../shared/index.module.css"></style>
