<script setup lang="ts">
import { computed, onScopeDispose, ref, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@nuxt/ui/composables'
import { RelativeTime } from '@/components'
import { useSkillEditor } from '@/hooks/useSkillEditor'
import { useUnsavedGuard } from '@/hooks/useFormHelpers'

defineOptions({ name: 'SkillEditPage' })

const styles = useCssModule()
const router = useRouter()
const toast = useToast()
const editor = useSkillEditor()

const saveFile = ref<File | null>(null)
const saveOpen = ref(false)
const saving = ref(false)

/** 未保存离开守卫：patchNote 非空时拦截。 */
const leaveGuard = useUnsavedGuard(editor.dirty, {
  navigate: (target) => {
    if (target) void router.push(target as never)
    else goToList()
  },
  onConfirm: () => editor.markSaved(),
})

const detail = computed(() => editor.detail.value)
const error = computed(() => editor.error.value)

async function load() {
  await editor.openEdit()
}

watch(() => editor.skillName.value, () => { void load() }, { immediate: true })

function goToList() {
  void router.push({ name: 'skills' })
}

function onCancel() {
  // 统一走守卫：若草稿非空则弹确认，未脏直接离开。
  leaveGuard.requestLeave({ name: 'skills' })
}

function onSave() {
  saveOpen.value = true
}

async function handleOverwrite(file: File | undefined) {
  if (!file) return
  saving.value = true
  const result = await editor.saveDraft(file)
  saving.value = false
  if (result?.error) {
    toast.add({ title: '保存失败', description: result.error, color: 'error', icon: 'i-lucide-circle-alert' })
    saveOpen.value = false
    return
  }
  editor.markSaved()
  saveOpen.value = false
  toast.add({ title: '技能已保存', color: 'success', icon: 'i-lucide-upload' })
  // 覆盖上传后回列表并高亮新行。
  const highlight = result?.highlight
  if (highlight) {
    void router.push({ name: 'skills', query: { highlight } })
  } else {
    goToList()
  }
}

watch(saveFile, async (file) => {
  if (!file) return
  await handleOverwrite(file)
  saveFile.value = null
})

onScopeDispose(() => {
  leaveGuard.cancelLeave()
})
</script>

<template>
  <main :class="styles.page">
    <header :class="styles.header">
      <div :class="styles.heading">
        <div :class="[styles.kicker, 'mono']">EDIT SKILL</div>
        <nav :class="styles.breadcrumb" aria-label="面包屑">
          <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" label="返回列表" @click="onCancel" />
        </nav>
        <div :class="styles.titleRow">
          <h1>编辑技能</h1>
          <span v-if="detail" :class="[styles.ver, 'mono']">{{ detail.name }}</span>
        </div>
        <p>技能内容通过 zip 包定义，编辑需重新上传技能包覆盖。</p>
      </div>
    </header>

    <UAlert v-if="error" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" role="alert" />

    <div :class="styles.shell">
      <div v-if="editor.loading.value" :class="styles.loading">
        <USkeleton class="h-6 w-2/5" />
        <USkeleton class="h-20 w-full" />
        <USkeleton class="h-64 w-full" />
      </div>
      <UEmpty v-else-if="!detail" variant="naked" icon="i-lucide-package-search" title="未找到该技能" description="可能已被删除或工作区已切换。" />
      <template v-else>
        <div :class="styles.metaGrid">
          <div :class="styles.meta">
            <span :class="styles.metaK">名称</span>
            <span class="mono" :class="styles.metaV">{{ detail.name }}</span>
          </div>
          <div :class="styles.meta">
            <span :class="styles.metaK">作用域</span>
            <span class="mono" :class="styles.metaV">{{ detail.scope }}</span>
          </div>
          <div :class="styles.meta">
            <span :class="styles.metaK">版本</span>
            <span class="mono" :class="styles.metaV">{{ detail.version ? `v${detail.version}` : '—' }}</span>
          </div>
          <div :class="styles.meta">
            <span :class="styles.metaK">更新时间</span>
            <span :class="styles.metaV"><RelativeTime :value="detail.updated_at" /></span>
          </div>
        </div>

        <UAlert color="info" variant="subtle" icon="i-lucide-info" title="字段编辑需重新上传覆盖">
          <template #description>后端当前未提供技能字段更新接口，修改技能内容请重新上传 zip 技能包。以下「修改说明」仅作本地备注，不影响服务端内容。</template>
        </UAlert>

        <UFormField label="修改说明">
          <UTextarea v-model="editor.patchNote.value" :rows="4" placeholder="记录本次修改意图…" />
        </UFormField>

        <div :class="styles.actions">
          <UButton color="neutral" variant="outline" label="取消" @click="onCancel" />
          <UButton icon="i-lucide-upload" label="上传技能包覆盖" color="primary" @click="onSave" />
        </div>
      </template>
    </div>

    <!-- 保存：选择 zip 后调 store 的覆盖上传，成功后自动回列表。 -->
    <UModal :open="saveOpen" title="上传技能包" description="选择新的 zip 包将覆盖当前技能，完成后自动刷新列表。">
      <template #body>
        <UFileUpload v-model="saveFile" accept=".zip" variant="area" layout="list" :preview="false" :disabled="saving" :icon="saving ? 'i-lucide-loader-circle' : 'i-lucide-upload'" label="选择 zip 技能包" description="zip ≤ 8MB" />
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" :disabled="saving" @click="saveOpen = false" />
      </template>
    </UModal>

    <UModal :open="leaveGuard.pending.value" class="ag-confirm-modal" title="放弃未保存的修改？" description="当前修改说明尚未提交，离开后将丢失。">
      <template #footer>
        <UButton label="继续编辑" color="neutral" variant="outline" @click="leaveGuard.cancelLeave()" />
        <UButton label="放弃修改" color="error" @click="leaveGuard.confirmLeave()" />
      </template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
