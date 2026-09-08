<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import GroupForm from '../components/group-form/index.vue'
import { useGroupEditor } from '@/hooks/useGroupEditor'

defineOptions({ name: 'GroupResourceEdit' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const editor = useGroupEditor()

const groupId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})

/** 编辑来源（D）：从详情页点「编辑」跳转会带 ?from=detail，保存后留在详情。 */
const fromDetail = computed(() => route.query.from === 'detail')

const savedSnapshot = ref('')
const confirmLeave = ref(false)
const pendingTarget = ref<Parameters<typeof router.replace>[0] | null>(null)
const dirty = computed(() =>
  editor.loadingDetail.value ? false : JSON.stringify(editor.draft.value) !== savedSnapshot.value,
)

async function load() {
  await editor.openEdit(groupId.value, fromDetail.value ? 'detail' : undefined)
  savedSnapshot.value = JSON.stringify(editor.draft.value)
}

watch(
  () => groupId.value,
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

function goToDetail() {
  editor.goToDetail(groupId.value)
}

/** 保存成功后回写基线快照，使脏检查进入已保存态，随后 editor 内部跳转详情页。 */
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
        <nav :class="styles.breadcrumb" aria-label="面包屑"><span>组织管理</span><i class="icon icon-chevron-right"></i><span>群组</span><i class="icon icon-chevron-right"></i><strong>编辑</strong></nav>
        <div :class="styles.titleRow">
          <span :class="styles.titleIcon"><UIcon name="i-lucide-users-round" /></span>
          <div><h1>{{ editor.draft.value.name || '编辑群组' }}</h1><p>GROUP-{{ groupId }} · 保存后立即更新当前工作区目录。</p></div>
        </div>
      </div>
      <div :class="styles.headerActions"><UButton icon="i-lucide-arrow-left" label="返回详情" color="neutral" variant="outline" @click="goToDetail" /><UButton icon="i-lucide-list" label="返回列表" color="neutral" variant="ghost" @click="editor.goToList" /></div>
    </header>

    <UAlert v-if="editor.error.value" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="editor.error.value" role="alert" :actions="[{ label: '返回列表', color: 'neutral', variant: 'outline', onClick: editor.goToList }]" />

    <section v-if="editor.loadingDetail.value" :class="styles.loading" aria-label="加载中">
      <div :class="styles.loadingInner"><span class="mono">正在加载群组信息…</span></div>
    </section>
    <section v-else-if="editor.draft.value.id != null" :class="styles.formShell" aria-label="群组表单">
      <GroupForm :model="editor.draft.value" :creating="false" :issues="editor.issues.value" :saving="editor.saving.value" @cancel="goToDetail" @save="onSave" />
    </section>

    <UModal :open="confirmLeave" title="放弃未保存的修改？" description="当前修改尚未保存到后端，离开后将丢失。">
      <template #body><p :class="styles.modalCopy">当前修改尚未保存到后端，离开后将丢失。</p></template>
      <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelLeave" /><UButton label="放弃修改" color="error" @click="confirmLeaveExit" /></template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
