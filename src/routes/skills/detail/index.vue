<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import { RelativeTime } from '@/components'
import { useSkillActions } from '@/hooks/useSkillActions'
import type { SkillResponse } from '@/interfaces/skill/model'
import SkillBundleModal from '@/routes/skills/components/skill-bundle-modal/index.vue'
import { useSkillsStore } from '@/stores/skills'
import { renderMarkdown } from '@/utils/markdown'

defineOptions({ name: 'SkillDetailPage' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const skillsStore = useSkillsStore()
const actions = useSkillActions()

const loading = ref(false)
const error = ref('')
const errorStatus = ref(0)
const bundleOpen = ref(false)
const frontmatterOpen = ref(true)

const skillId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})
const detail = computed(() => skillsStore.state.skillDetail)
/** 页头用的元数据：详情加载失败（旧数据 400）时退回列表项，保证仍能上传覆盖修复。 */
const skill = computed<SkillResponse | null>(() =>
  detail.value ?? skillsStore.state.skills.find((item) => item.id === skillId.value) ?? null,
)
const notFound = computed(() => errorStatus.value === 404)

const bodyHtml = computed(() => (detail.value?.body ? renderMarkdown(detail.value.body) : ''))
const frontmatterRows = computed(() =>
  Object.entries(detail.value?.frontmatter ?? {}).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  })),
)
const resources = computed(() => detail.value?.resources ?? [])

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

/** ⋯ 菜单：上传覆盖 / 导出 / 删除；无写权限只保留导出。 */
const menuItems = computed<DropdownMenuItem[][]>(() => {
  const current = skill.value
  if (!current) return []
  const exportItem: DropdownMenuItem = {
    label: '导出',
    icon: 'i-lucide-download',
    disabled: actions.exportingId.value !== null,
    onSelect: () => { void actions.exportBundle(current) },
  }
  if (!actions.canWrite.value) return [[exportItem]]
  return [
    [{ label: '上传覆盖', icon: 'i-lucide-upload', onSelect: () => { bundleOpen.value = true } }, exportItem],
    [{ label: '删除', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => actions.requestDelete(current) }],
  ]
})

async function load() {
  error.value = ''
  errorStatus.value = 0
  if (!Number.isInteger(skillId.value)) {
    errorStatus.value = 404
    return
  }
  loading.value = true
  // 列表可能尚未加载（直接打开详情链接）：补齐后旧数据 400 时页头仍有名称可用。
  if (!skillsStore.state.skills.length) await skillsStore.loadSkills()
  const loadError = await skillsStore.selectSkill(skillId.value)
  loading.value = false
  if (loadError) {
    error.value = loadError.message
    errorStatus.value = loadError.status
  }
}

watch(skillId, () => { void load() }, { immediate: true })

function goToList() {
  void router.push({ name: 'skills' })
}

function goToEdit() {
  void router.push({ name: 'skill-edit', params: { id: String(skillId.value) } })
}

function onToggle(value: boolean) {
  if (skill.value) void actions.toggleEnabled(skill.value, value)
}

/** 覆盖成功：内容整体替换，重新拉详情。 */
function onUploaded(updated: SkillResponse) {
  toast.add({ title: `技能「${updated.name}」已覆盖`, color: 'success', icon: 'i-lucide-upload' })
  void load()
}

async function onDeleteConfirm() {
  if (await actions.confirmDelete()) goToList()
}
</script>

<template>
  <main :class="styles.page">
    <header :class="styles.header">
      <div :class="styles.heading">
        <nav :class="styles.breadcrumb" aria-label="面包屑">
          <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" label="技能库" @click="goToList" />
        </nav>
        <div :class="styles.titleRow">
          <h1 class="mono">{{ skill?.name ?? '技能详情' }}</h1>
          <span v-if="skill?.version" class="mono" :class="styles.ver">v{{ skill.version }}</span>
        </div>
        <p v-if="skill">{{ skill.description }}</p>
      </div>
      <div v-if="skill && !notFound" :class="styles.actions">
        <USwitch
          :model-value="skill.is_enabled"
          :label="skill.is_enabled ? '已启用' : '已停用'"
          :disabled="!actions.canWrite.value || actions.isToggling(skill.id)"
          :loading="actions.isToggling(skill.id)"
          @update:model-value="onToggle"
        />
        <UButton v-if="actions.canWrite.value" color="neutral" variant="outline" icon="i-lucide-pencil" label="编辑" :disabled="!detail" @click="goToEdit" />
        <UDropdownMenu :items="menuItems">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="outline" square aria-label="更多操作" />
        </UDropdownMenu>
      </div>
    </header>

    <UAlert
      v-if="error && !notFound"
      :class="styles.alert"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="error"
      :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: load }]"
    />

    <div v-if="loading" :class="styles.loading">
      <USkeleton class="h-64 w-full" />
      <USkeleton class="h-40 w-full" />
    </div>

    <UEmpty v-else-if="notFound" variant="naked" icon="i-lucide-package-search" title="技能不存在">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="goToList" />
      </template>
    </UEmpty>

    <div v-else-if="detail" :class="styles.scroll">
      <div :class="styles.grid">
        <UCard :class="styles.card" :ui="{ header: 'p-0 sm:p-0', body: 'p-0 sm:p-0' }">
          <template #header><div :class="[styles.cardTitle, 'mono']">SKILL.md</div></template>
          <UCollapsible v-if="frontmatterRows.length" v-model:open="frontmatterOpen" :class="styles.frontmatter">
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              :class="[styles.fmToggle, 'mono']"
              :icon="frontmatterOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              label="frontmatter"
            />
            <template #content>
              <dl :class="styles.fm">
                <div v-for="row in frontmatterRows" :key="row.key" :class="styles.fmRow">
                  <dt class="mono" :class="styles.fmK">{{ row.key }}</dt>
                  <dd class="mono" :class="styles.fmV">{{ row.value }}</dd>
                </div>
              </dl>
            </template>
          </UCollapsible>
          <div v-if="bodyHtml" class="md" :class="styles.body" v-html="bodyHtml"></div>
        </UCard>

        <aside :class="styles.side">
          <UCard v-if="resources.length" :class="styles.card" :ui="{ header: 'p-0 sm:p-0', body: 'p-0 sm:p-0' }">
            <template #header><div :class="styles.cardTitle">文件 <span class="mono" :class="styles.count">{{ resources.length }}</span></div></template>
            <ul :class="styles.resources">
              <li v-for="resource in resources" :key="resource.relative_path" :class="styles.resourceRow">
                <span class="mono" :class="styles.resourcePath" :title="resource.relative_path">{{ resource.relative_path }}</span>
                <span class="mono" :class="styles.resourceSize">{{ formatBytes(resource.size) }}</span>
              </li>
            </ul>
          </UCard>
          <UCard :class="styles.card" :ui="{ header: 'p-0 sm:p-0', body: 'p-0 sm:p-0' }">
            <template #header><div :class="styles.cardTitle">信息</div></template>
            <dl :class="styles.info">
              <div><dt>创建</dt><dd><RelativeTime :value="detail.created_at" mode="absolute" /></dd></div>
              <div><dt>更新</dt><dd><RelativeTime :value="detail.updated_at" /></dd></div>
            </dl>
          </UCard>
        </aside>
      </div>
    </div>

    <SkillBundleModal v-model:open="bundleOpen" :target="skill" @uploaded="onUploaded" />

    <UModal
      :open="actions.pendingDelete.value !== null"
      :title="skill ? `删除技能「${skill.name}」？` : '删除技能？'"
      description="删除后会解除所有 Agent 对它的绑定。"
      @update:open="(open: boolean) => { if (!open) actions.cancelDelete() }"
    >
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" :disabled="actions.deleting.value" @click="actions.cancelDelete" />
        <UButton color="error" label="确认删除" :loading="actions.deleting.value" :disabled="actions.deleting.value" @click="onDeleteConfirm" />
      </template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
