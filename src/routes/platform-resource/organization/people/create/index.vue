<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import PersonForm from '../components/person-form/index.vue'
import { usePeopleEditor } from '@/hooks/usePeopleEditor'

defineOptions({ name: 'PeopleResourceCreate' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const editor = usePeopleEditor()

const savedSnapshot = ref('')
const confirmLeave = ref(false)
const pendingTarget = ref<Parameters<typeof router.replace>[0] | null>(null)
const dirty = computed(() =>
  editor.loadingDetail.value ? false : JSON.stringify(editor.draft.value) !== savedSnapshot.value,
)
/** 创建成功但邀请失败：alert 提供「重试邀请」(再次 saveDraft 只重发邀请)与「前往详情」。 */
const inviteFailedActions = computed(() => [
  { label: '重试邀请', color: 'neutral' as const, variant: 'outline' as const, onClick: onSave },
  { label: '前往详情', color: 'primary' as const, variant: 'solid' as const, onClick: skipInvite },
])

function load() {
  editor.openCreate()
  savedSnapshot.value = JSON.stringify(editor.draft.value)
}

watch(
  () => route.fullPath,
  () => { load() },
  { immediate: true },
)

/** 第一步 createUser 已成功(仅邀请失败)时，草稿已落库，不再触发脏检查拦截。 */
watch(
  () => editor.createdUserId.value,
  (id) => {
    if (id != null) savedSnapshot.value = JSON.stringify(editor.draft.value)
  },
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

/** 保存成功后回写基线快照，使脏检查进入已保存态，随后 editor 内部跳转详情页。 */
function onSave() {
  void editor.saveDraft().then((ok) => {
    if (ok) savedSnapshot.value = JSON.stringify(editor.draft.value)
  })
}

/** 放弃重试邀请：用户已创建，直接进入详情页。 */
function skipInvite() {
  editor.skipInvite()
}
</script>

<template>
  <main :class="styles.page">
    <header :class="styles.header">
      <div :class="styles.heading">
        <nav :class="styles.breadcrumb" aria-label="面包屑"><span>组织管理</span><i class="icon icon-chevron-right"></i><span>人员</span><i class="icon icon-chevron-right"></i><strong>邀请</strong></nav>
        <div :class="styles.titleRow">
          <span :class="styles.titleIcon"><UIcon name="i-lucide-user-plus" /></span>
          <div><h1>邀请人员</h1><p>创建用户账号(姓名、用户名、邮箱、初始密码)，并可同步邀请其加入当前工作区；两步分别写入后端。</p></div>
        </div>
      </div>
      <div :class="styles.headerActions"><UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="editor.goToList" /></div>
    </header>

    <UAlert v-if="editor.error.value && editor.createdUserId.value != null" :class="styles.alert" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="editor.error.value" description="用户账号已创建成功，仅工作区邀请未完成；可重试邀请，或前往详情页稍后处理归属。" role="alert" :actions="inviteFailedActions" />
    <UAlert v-else-if="editor.error.value" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="editor.error.value" role="alert" />

    <section :class="styles.formShell" aria-label="人员表单">
      <PersonForm :model="editor.draft.value" mode="create" :issues="editor.issues.value" :saving="editor.saving.value" @cancel="editor.goToList" @save="onSave" />
    </section>

    <UModal :open="confirmLeave" title="放弃未保存的修改？" description="当前修改尚未保存到后端，离开后将丢失。">
      <template #body><p :class="styles.modalCopy">当前修改尚未保存到后端，离开后将丢失。</p></template>
      <template #footer><UButton label="继续编辑" color="neutral" variant="outline" @click="cancelLeave" /><UButton label="放弃修改" color="error" @click="confirmLeaveExit" /></template>
    </UModal>
  </main>
</template>

<style module src="../shared/index.module.css"></style>
