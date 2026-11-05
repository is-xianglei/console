<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { useToast } from '@nuxt/ui/composables'
import { MARKET_LISTING_STATUS_META } from '@/constants/market'
import type { MarketListingKind } from '@/interfaces/market/model'
import { useAuthStore } from '@/stores/auth'
import { useMarketStore } from '@/stores/market'
import { getInstalledFromLabel, getPendingVersion, isMarketWriter } from '@/utils/market'

/**
 * 「申请上架 / 提交新版本」入口，Agent 详情页和 Skill 详情页共用。
 * 从市场装来的对象（含随 Agent 装来的托管 Skill）不能再上架，改为显示来源条目的链接，所有成员可见。
 * 否则按源对象查当前工作区的条目：没有时是「申请上架」，有时是「提交新版本」；上架要求工作区所有者或管理员。
 */
defineOptions({ name: 'MarketSubmitButton' })

const props = defineProps<{
  kind: MarketListingKind
  /** 要上架的 Agent 或 Skill 的 ID。 */
  sourceId: number
}>()

const toast = useToast()
const authStore = useAuthStore()
const marketStore = useMarketStore()

const open = ref(false)
const category = ref<string | undefined>(undefined)
const releaseNote = ref('')
/** 点过提交之后才显示必填提示，避免一打开就标红。 */
const submitted = ref(false)
const submitting = ref(false)

const canWrite = computed(() => isMarketWriter(authStore.currentWorkspace?.membership_role))
const installedFrom = computed(() => marketStore.state.installedFrom)
const installedFromRoute = computed<RouteLocationRaw | null>(() => {
  if (!installedFrom.value) return null
  return { name: 'market-detail', params: { id: String(installedFrom.value.listing_id) } }
})
// 来源查清之前不显示上架入口，避免从市场装来的对象先闪出「申请上架」。
const showSubmit = computed(() => canWrite.value && marketStore.state.installedFromLoaded && !installedFrom.value)
const existing = computed(() => marketStore.state.listingBySource)
const pendingVersion = computed(() => {
  if (!existing.value) return null
  return getPendingVersion(existing.value.versions)
})
const buttonLabel = computed(() => {
  if (existing.value) return '提交新版本'
  return '申请上架'
})
const categoryItems = computed(() => {
  const options: { label: string; value: string }[] = []
  for (const item of marketStore.state.categories) {
    options.push({ label: item.label, value: item.key })
  }
  return options
})
const categoryError = computed(() => {
  if (submitted.value && !category.value) return '请选择分类'
  return undefined
})

// 市场来源和已有条目同时查：来源对工作区成员开放，已有条目只有所有者或管理员能查。
// 切换工作区或换了源对象都重新判断。两者返回 null 都是正常情况；
// 加载失败也不打扰用户，入口按「申请上架」显示，提交时由后端兜底校验（从市场装来的会返回 409）。
watch(
  () => [canWrite.value, authStore.currentWorkspaceId, props.kind, props.sourceId],
  () => {
    void marketStore.loadInstalledFrom(props.kind, props.sourceId)
    if (canWrite.value) void marketStore.loadListingBySource(props.kind, props.sourceId)
  },
  { immediate: true },
)

async function openModal() {
  open.value = true
  submitted.value = false
  releaseNote.value = ''
  // 已有条目时默认沿用当前分类；还没有通过的版本时沿用最近一次提交的分类（版本号大的在前）。
  category.value = undefined
  if (existing.value) {
    category.value = existing.value.listing.category ?? undefined
    const latestVersion = existing.value.versions[0]
    if (!category.value && latestVersion) category.value = latestVersion.category
  }
  const error = await marketStore.loadCategories()
  if (error) {
    toast.add({ title: '分类加载失败', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

function onOpenChange(value: boolean) {
  if (submitting.value) return
  open.value = value
}

/** 提交审核；快照大小、凭据文件、内容未变化等校验由后端完成，失败时直接展示它的中文说明。 */
async function onSubmit() {
  submitted.value = true
  if (!category.value || pendingVersion.value || submitting.value) return

  let note: string | null = releaseNote.value.trim()
  if (!note) note = null

  submitting.value = true
  const outcome = await marketStore.submitListing({
    kind: props.kind,
    source_id: props.sourceId,
    category: category.value,
    release_note: note,
  })
  submitting.value = false

  if (!outcome.version) {
    toast.add({ title: '提交失败', description: outcome.error ?? undefined, color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  open.value = false
  toast.add({
    title: `已提交 v${outcome.version.version_number}，等待平台审核`,
    description: '审核进度可在「应用市场 → 我的上架」查看。',
    color: 'success',
    icon: 'i-lucide-send',
  })
}
</script>

<template>
  <!-- 条目名可能很长，限宽截断并用 title 展示全文，避免挤压详情页标题。 -->
  <UButton
    v-if="installedFrom && installedFromRoute"
    :label="getInstalledFromLabel(installedFrom)"
    :title="getInstalledFromLabel(installedFrom)"
    icon="i-lucide-store"
    color="neutral"
    variant="ghost"
    :class="$style.origin"
    :to="installedFromRoute"
  />
  <template v-else-if="showSubmit">
    <UButton :label="buttonLabel" icon="i-lucide-upload-cloud" color="neutral" variant="outline" @click="openModal" />

    <UModal
      :open="open"
      :title="buttonLabel"
      :dismissible="!submitting"
      :close="!submitting"
      :ui="{ footer: 'justify-end' }"
      @update:open="onOpenChange"
    >
      <template #body>
        <div :class="$style.body">
          <div v-if="existing" :class="$style.status">
            <span>当前条目</span>
            <UBadge
              :label="MARKET_LISTING_STATUS_META[existing.listing.status].label"
              :color="MARKET_LISTING_STATUS_META[existing.listing.status].color"
              variant="subtle"
              size="xs"
            />
            <span v-if="existing.listing.current_version_number" class="mono">上架版本 v{{ existing.listing.current_version_number }}</span>
          </div>

          <UAlert
            v-if="pendingVersion"
            color="warning"
            variant="subtle"
            icon="i-lucide-hourglass"
            :title="`v${pendingVersion.version_number} 正在等待审核`"
            description="每个条目同时只能有一个待审版本，可在「应用市场 → 我的上架」撤回后再提交。"
          />

          <UFormField label="分类" required :error="categoryError">
            <USelect v-model="category" :items="categoryItems" placeholder="选择分类" :class="$style.field" />
          </UFormField>
          <UFormField label="版本说明">
            <UTextarea
              v-model="releaseNote"
              :rows="3"
              autoresize
              :maxrows="8"
              placeholder="选填，例如这次改了什么"
              :class="$style.field"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="submitting" @click="onOpenChange(false)" />
        <UButton
          label="提交审核"
          icon="i-lucide-send"
          :loading="submitting"
          :disabled="submitting || pendingVersion !== null"
          @click="onSubmit"
        />
      </template>
    </UModal>
  </template>
</template>

<style module src="./index.module.css"></style>
