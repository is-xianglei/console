<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { MemoryType } from '@/interfaces/memory/model'
import { useMemoryEditor } from '@/hooks/useMemoryEditor'

defineOptions({ name: 'MemoryDetailPage' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const editor = useMemoryEditor()
const activeTab = ref<'content' | 'revisions' | 'sources'>('content')
const pendingDelete = ref(false)
const deleting = ref(false)

const memoryId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})
const detail = computed(() => editor.detail.value)
const loading = computed(() => editor.loadingDetail.value)
const error = computed(() => editor.error.value)
const typeLabel: Record<MemoryType, string> = {
  user: '用户',
  feedback: '反馈',
  project: '项目',
  reference: '参考',
}
/** 删除弹窗标题含记忆名（超过 30 字截断）。 */
const deleteTitle = computed(() => {
  const name = detail.value?.name ?? ''
  const truncated = name.length > 30 ? `${name.slice(0, 30)}…` : name
  return truncated ? `删除 Memory「${truncated}」？` : '删除 Memory？'
})
const tabItems = [
  { value: 'content', label: '正文' },
  { value: 'revisions', label: '修订' },
  { value: 'sources', label: '来源' },
]

async function load() {
  if (Number.isNaN(memoryId.value)) return
  editor.loadingDetail.value = true
  await editor.openEdit(memoryId.value)
  editor.loadingDetail.value = false
}

watch(
  () => route.params.id,
  () => { void load() },
  { immediate: true },
)

function goToList() {
  void router.push({ name: 'memories' })
}

function goToEdit() {
  void router.push({ name: 'memory-edit', params: { id: String(memoryId.value) }, query: { from: 'detail' } })
}

function requestDelete() {
  if (!detail.value) return
  pendingDelete.value = true
}

async function confirmDelete() {
  if (!detail.value || deleting.value) return
  deleting.value = true
  try {
    const ok = await editor.removeDetail(detail.value.id, detail.value.version)
    if (ok) pendingDelete.value = false
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <main :class="styles.page">
    <header :class="styles.header">
      <div :class="styles.heading">
        <div :class="[$style.kicker, 'mono']">MEMORY DETAIL</div>
        <nav :class="styles.breadcrumb" aria-label="面包屑">
          <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" label="返回列表" @click="goToList" />
        </nav>
        <div :class="styles.titleRow">
          <h1>{{ detail?.name ?? 'Memory 详情' }}</h1>
          <span v-if="detail" :class="[$style.recordCount, 'mono']">v{{ detail.version }}</span>
        </div>
        <p v-if="detail">{{ detail.description }}</p>
      </div>
      <div v-if="detail" :class="styles.actions">
        <UButton color="neutral" variant="outline" icon="i-lucide-pencil" label="编辑" @click="goToEdit" />
        <UButton color="error" variant="outline" icon="i-lucide-trash-2" label="删除" @click="requestDelete" />
      </div>
    </header>

    <UAlert v-if="error" :class="$style.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" role="alert" />

    <div v-if="loading" :class="styles.loading">
      <USkeleton class="h-8 w-2/5" />
      <USkeleton class="h-20 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>

    <UEmpty
      v-else-if="!detail"
      variant="naked"
      icon="i-lucide-panel-right-open"
      title="未找到该 Memory"
      description="可能已被删除或工作区已切换。"
    />

    <section v-else :class="styles.shell" aria-label="Memory 详情">
      <div :class="styles.meta">
        <UBadge :label="typeLabel[detail.memory_type]" color="neutral" variant="subtle" size="xs" />
        <span :class="[$style.key, 'mono']">{{ detail.memory_key }}</span>
        <span>{{ detail.use_count }} 次使用</span>
        <span :class="$style.dim">Catalog v{{ detail.catalog_version }}</span>
      </div>

      <UTabs v-model="activeTab" :items="tabItems" :content="false" variant="link" :class="styles.tabs" />
      <div :class="styles.content">
        <template v-if="activeTab === 'content'">
          <div :class="styles.prose"><pre>{{ detail.body }}</pre></div>
        </template>
        <ol v-else-if="activeTab === 'revisions' && detail.revisions.length" :class="styles.timeline">
          <li v-for="revision in detail.revisions" :key="revision.id">
            <div><strong>修订 {{ revision.revision }}</strong><span class="mono">{{ new Date(revision.created_at).toLocaleString('zh-CN') }}</span></div>
            <p>{{ revision.name }} · {{ revision.actor_type }}{{ revision.actor_id ? ` / ${revision.actor_id}` : '' }}</p>
          </li>
        </ol>
        <UEmpty v-else-if="activeTab === 'revisions'" :class="styles.tabEmpty" variant="naked" icon="i-lucide-history" title="暂无修订记录" />
        <ol v-else-if="detail.sources.length" :class="styles.timeline">
          <li v-for="source in detail.sources" :key="source.id">
            <div><strong>{{ source.source_kind }}</strong><span class="mono">{{ new Date(source.created_at).toLocaleString('zh-CN') }}</span></div>
            <p>{{ source.source_excerpt || '无来源摘要' }}</p>
            <span v-if="source.session_id" class="mono">SESSION #{{ source.session_id }}</span>
          </li>
        </ol>
        <UEmpty v-else :class="styles.tabEmpty" variant="naked" icon="i-lucide-file-search" title="暂无来源证据" />
      </div>
    </section>

    <UModal v-model:open="pendingDelete" :title="deleteTitle" description="该操作会创建删除版本并从活动目录移除，仍可在数据导出中审计。">
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" :disabled="deleting" @click="pendingDelete = false" />
        <UButton color="error" label="确认删除" :loading="deleting" :disabled="deleting" @click="confirmDelete" />
      </template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
