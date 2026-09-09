<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RelativeTime } from '@/components'
import { useToast } from '@nuxt/ui/composables'
import { useSkillsStore } from '@/stores/skills'
import { renderMarkdown } from '@/utils/markdown'

defineOptions({ name: 'SkillDetailPage' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { state, selectSkill, removeSkill, loadSkills } = useSkillsStore()

const pendingDelete = ref(false)
const deleting = ref(false)
const detailLoading = ref(false)
const error = ref('')
const detail = computed(() => state.skillDetail)

const skillName = computed(() => {
  const value = route.params.name
  return String(Array.isArray(value) ? value[0] : value)
})

const bodyHtml = computed(() => (detail.value ? renderMarkdown(detail.value.body) : ''))
const frontmatterRows = computed(() => {
  const frontmatter = detail.value?.frontmatter
  if (!frontmatter) return [] as { key: string; value: string }[]
  return Object.entries(frontmatter).map(([key, value]) => ({
    key,
    value:
      value === null || value === undefined
        ? '—'
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value),
  }))
})
const resources = computed(() => detail.value?.resources ?? [])

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

async function load() {
  if (!skillName.value) return
  detailLoading.value = true
  error.value = ''
  // 列表项在详情路由下可能尚未加载，先补齐用于删除后选相邻项。
  if (!state.skills.length) await loadSkills()
  const loadError = await selectSkill(skillName.value)
  detailLoading.value = false
  if (loadError) error.value = loadError
}

watch(skillName, () => { void load() }, { immediate: true })

function goToList() {
  void router.push({ name: 'skills' })
}

function goToEdit() {
  void router.push({ name: 'skill-edit', params: { name: skillName.value } })
}

function requestDelete() {
  if (!skillName.value) return
  pendingDelete.value = true
}

async function confirmDelete() {
  if (!skillName.value || deleting.value) return
  deleting.value = true
  const message = await removeSkill(skillName.value)
  deleting.value = false
  if (message) {
    toast.add({ title: '删除失败', description: message, color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  pendingDelete.value = false
  toast.add({ title: '技能已删除', color: 'success', icon: 'i-lucide-trash-2' })
  // 删除后回列表并选相邻项；URL 不指向已删除 name。
  const neighbor = state.skills[0]?.name ?? ''
  const query: Record<string, string> = {}
  if (neighbor) query.highlight = neighbor
  void router.push({ name: 'skills', query })
}

function onRetry() {
  void load()
}
</script>

<template>
  <main :class="styles.page">
    <header :class="styles.header">
      <div :class="styles.heading">
        <div :class="[styles.kicker, 'mono']">SKILL DETAIL</div>
        <nav :class="styles.breadcrumb" aria-label="面包屑">
          <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" label="返回列表" @click="goToList" />
        </nav>
        <div :class="styles.titleRow">
          <h1 class="mono">{{ detail?.name ?? '技能详情' }}</h1>
          <span v-if="detail?.version" class="mono" :class="styles.ver">v{{ detail.version }}</span>
        </div>
        <p v-if="detail">{{ detail.description }}</p>
      </div>
      <div v-if="detail" :class="styles.actions">
        <UButton color="neutral" variant="outline" icon="i-lucide-pencil" label="编辑" @click="goToEdit" />
        <UButton color="error" variant="outline" icon="i-lucide-trash-2" label="删除" @click="requestDelete" />
      </div>
    </header>

    <UAlert v-if="error" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: onRetry }]" />

    <div v-if="detailLoading" :class="styles.loading">
      <USkeleton class="h-8 w-2/5" />
      <USkeleton class="h-20 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>
    <UEmpty v-else-if="!detail" variant="naked" icon="i-lucide-package-search" title="未找到该技能" description="可能已被删除或工作区已切换。" />

    <section v-else :class="styles.shell" aria-label="技能详情">
      <div :class="styles.metaGrid">
        <div :class="styles.meta">
          <span :class="styles.metaK">作用域</span>
          <span class="mono" :class="styles.metaV">{{ detail.scope }}</span>
        </div>
        <div :class="styles.meta">
          <span :class="styles.metaK">工作区 ID</span>
          <span class="mono" :class="styles.metaV">{{ detail.workspace_id }}</span>
        </div>
        <div :class="styles.meta">
          <span :class="styles.metaK">创建时间</span>
          <span :class="styles.metaV"><RelativeTime :value="detail.created_at" mode="absolute" /></span>
        </div>
        <div :class="styles.meta">
          <span :class="styles.metaK">更新时间</span>
          <span :class="styles.metaV"><RelativeTime :value="detail.updated_at" /></span>
        </div>
      </div>

      <section v-if="frontmatterRows.length" :class="styles.section">
        <div :class="styles.sectionTitle">元数据（FRONTMATTER）</div>
        <div :class="styles.fm">
          <div v-for="row in frontmatterRows" :key="row.key" :class="styles.fmRow">
            <span class="mono" :class="styles.fmK">{{ row.key }}</span>
            <span class="mono" :class="styles.fmV">{{ row.value }}</span>
          </div>
        </div>
      </section>

      <section v-if="resources.length" :class="styles.section">
        <div :class="styles.sectionTitle">资源清单 <span class="mono" :class="styles.count">{{ resources.length }}</span></div>
        <ul :class="styles.resources">
          <li v-for="resource in resources" :key="resource.relative_path" :class="styles.resourceRow">
            <UIcon name="i-lucide-file-text" :class="styles.resourceIcon" />
            <span class="mono" :class="styles.resourcePath">{{ resource.relative_path }}</span>
            <span class="mono" :class="styles.resourceSize">{{ formatBytes(resource.size) }}</span>
          </li>
        </ul>
      </section>

      <section :class="styles.section">
        <div :class="styles.sectionTitle">SKILL.md</div>
        <div v-if="bodyHtml" class="md" :class="styles.body" v-html="bodyHtml"></div>
        <div v-else :class="styles.empty">(正文为空)</div>
      </section>
    </section>

    <UModal :open="pendingDelete" :title="detail ? `删除技能「${detail.name}」？` : '删除技能？'" description="删除后需要重新上传技能包才能恢复。">
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" :disabled="deleting" @click="pendingDelete = false" />
        <UButton color="error" label="确认删除" :loading="deleting" :disabled="deleting" @click="confirmDelete" />
      </template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
