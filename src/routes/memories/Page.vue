<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import MemoryListPanel from './components/memory-list-panel/index.vue'
import type { MemoryPurgeConfirmationResponse } from '@/interfaces/memory/api'
import { useMemoriesStore } from '@/stores/memories'

defineOptions({ name: 'MemoriesPage' })

const memoriesStore = useMemoriesStore()
const router = useRouter()
const toast = useToast()
const purgeOpen = ref(false)
const purgeLoading = ref(false)
const purgePhrase = ref('')
const purgeConfirmation = ref<MemoryPurgeConfirmationResponse | null>(null)
const rollbackOpen = ref(false)
const rollbackLoading = ref(false)
const rollbackForm = reactive({ jobId: '', catalogVersion: 0 })
const pageMenuItems: DropdownMenuItem[][] = [
  [{
    label: '回滚 Dream',
    icon: 'i-lucide-rotate-ccw',
    onSelect: () => { rollbackOpen.value = true },
  }],
  [{
    label: '彻底删除 Memory Space',
    icon: 'i-lucide-trash-2',
    color: 'error',
    onSelect: () => { void onOpenPurge() },
  }],
]

function onCreate() {
  void router.push({ name: 'memory-create' })
}

async function onExport() {
  try {
    const data = await memoriesStore.exportMemory()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `memory-export-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.add({ title: 'Memory 数据已导出', color: 'success', icon: 'i-lucide-download' })
  } catch (error) {
    toast.add({
      title: '导出失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color: 'error',
      icon: 'i-lucide-circle-alert',
    })
  }
}

async function onOpenPurge() {
  purgePhrase.value = ''
  purgeConfirmation.value = null
  purgeOpen.value = true
  purgeLoading.value = true
  try {
    purgeConfirmation.value = await memoriesStore.getPurgeConfirmation()
  } catch (error) {
    toast.add({
      title: '无法获取删除确认',
      description: error instanceof Error ? error.message : '请稍后重试',
      color: 'error',
    })
    purgeOpen.value = false
  } finally {
    purgeLoading.value = false
  }
}

async function onPurge() {
  if (!purgeConfirmation.value || purgePhrase.value !== '彻底删除') return
  purgeLoading.value = true
  try {
    const result = await memoriesStore.purgeMemory(purgeConfirmation.value)
    purgeOpen.value = false
    toast.add({
      title: 'Memory Space 已彻底删除',
      description: `删除 ${result.items_deleted} 条记忆、${result.revisions_deleted} 个修订`,
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: '彻底删除失败',
      description: error instanceof Error ? error.message : '请重新获取确认',
      color: 'error',
    })
  } finally {
    purgeLoading.value = false
  }
}

async function onRollback() {
  if (!rollbackForm.jobId.trim() || rollbackForm.catalogVersion < 0) return
  rollbackLoading.value = true
  try {
    const result = await memoriesStore.rollbackMemoryDream(
      rollbackForm.jobId.trim(),
      rollbackForm.catalogVersion,
    )
    rollbackOpen.value = false
    toast.add({
      title: 'Dream 已回滚',
      description: `恢复 ${result.restored_item_ids.length} 条记忆，Catalog v${result.catalog_version}`,
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: 'Dream 回滚失败',
      description: error instanceof Error ? error.message : '请检查任务 ID 与 Catalog 版本',
      color: 'error',
    })
  } finally {
    rollbackLoading.value = false
  }
}
</script>

<template>
  <main :class="$style.page">
    <header :class="$style.header">
      <div :class="$style.heading">
        <div :class="[$style.kicker, 'mono']">LONG-TERM CONTEXT</div>
        <div :class="$style.titleRow">
          <h1>Memory 管理</h1>
          <span :class="[$style.recordCount, 'mono']">{{ memoriesStore.state.total }} 条</span>
        </div>
        <p>管理当前工作区中的长期记忆、修订历史与来源证据。</p>
      </div>
      <div :class="$style.actions">
        <UButton color="neutral" variant="outline" icon="i-lucide-download" label="导出" @click="onExport" />
        <UDropdownMenu :items="pageMenuItems">
          <UButton color="neutral" variant="outline" square icon="i-lucide-ellipsis" aria-label="更多 Memory 操作" />
        </UDropdownMenu>
        <UButton icon="i-lucide-plus" label="新建 Memory" @click="onCreate" />
      </div>
    </header>

    <div :class="$style.panelWrap">
      <MemoryListPanel />
    </div>

    <UModal v-model:open="rollbackOpen" title="回滚 Dream" description="使用审计中的 Dream 任务 ID 和任务完成后的 Catalog 版本执行并发安全回滚。">
      <template #body>
        <UForm :state="rollbackForm" :class="$style.modalForm" @submit="onRollback">
          <UFormField label="Dream 任务 ID" name="jobId" required>
            <UInput v-model="rollbackForm.jobId" class="w-full" placeholder="UUID" />
          </UFormField>
          <UFormField label="任务完成后的 Catalog 版本" name="catalogVersion" required>
            <UInputNumber v-model="rollbackForm.catalogVersion" class="w-full" :min="0" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" @click="rollbackOpen = false" />
        <UButton label="执行回滚" :loading="rollbackLoading" :disabled="!rollbackForm.jobId.trim()" @click="onRollback" />
      </template>
    </UModal>

    <UModal v-model:open="purgeOpen" title="彻底删除 Memory Space" description="此操作会物理删除记忆、修订、来源、任务和上下文，无法恢复。">
      <template #body>
        <div :class="$style.modalForm">
          <UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" title="高风险操作" description="输入“彻底删除”后才能继续。" />
          <UFormField label="确认文字">
            <UInput v-model="purgePhrase" class="w-full" placeholder="彻底删除" :disabled="purgeLoading" />
          </UFormField>
          <span v-if="purgeConfirmation" :class="[$style.expiry, 'mono']">确认令牌有效至 {{ new Date(purgeConfirmation.expires_at).toLocaleString('zh-CN') }}</span>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" @click="purgeOpen = false" />
        <UButton color="error" label="彻底删除" :loading="purgeLoading" :disabled="purgePhrase !== '彻底删除' || !purgeConfirmation" @click="onPurge" />
      </template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
