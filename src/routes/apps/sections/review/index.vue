<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import { RelativeTime, ResourcePagination } from '@/components'
import { MARKET_KIND_LABELS, MARKET_LISTING_STATUS_META, MARKET_VERSION_STATUS_META } from '@/constants/market'
import type { MarketReviewItem, MarketVersionStatus } from '@/interfaces/market/model'
import { useMarketStore } from '@/stores/market'
import { getCategoryLabel, getSnapshotName } from '@/utils/market'
import ReasonModal from '../../components/reason-modal/index.vue'
import SnapshotView from '../../components/snapshot-view/index.vue'

/**
 * 「审核队列」：仅平台管理员可见（入口和路由守卫都拦）。
 * 按状态分页查看版本，可展开快照全文；待审版本可通过或驳回，社区条目可强制下架。
 */
defineOptions({ name: 'MarketReviewSection' })

/** 审核弹窗：通过（意见选填）、驳回（理由必填）、强制下架（理由必填）。 */
type ReviewDialog = 'approve' | 'reject' | 'remove'

const REVIEW_PAGE_SIZES = [10, 20, 50]

const statusItems = [
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
  { label: '已撤回', value: 'withdrawn' },
]

const toast = useToast()
const marketStore = useMarketStore()

const status = ref<MarketVersionStatus>('pending')
const page = ref(1)
const pageSize = ref(REVIEW_PAGE_SIZES[0])
const loadError = ref('')
const dialog = ref<ReviewDialog | null>(null)
const dialogTarget = ref<MarketReviewItem | null>(null)
const saving = ref(false)
let loadRequest = 0

/** 弹窗文案：三种审核动作共用一个 ReasonModal，按类型切换标题、输入框和按钮。 */
const dialogConfig = computed(() => {
  const target = dialogTarget.value
  let name = ''
  let versionLabel = ''
  if (target) {
    name = `「${getSnapshotName(target.version.snapshot)}」`
    versionLabel = `v${target.version.version_number}`
  }
  if (dialog.value === 'approve') {
    return {
      title: `通过 ${name} ${versionLabel}？`,
      description: '通过后立即成为当前版本并上架，全平台可见。',
      label: '审核意见',
      submitLabel: '通过',
      required: false,
      color: 'primary' as const,
    }
  }
  if (dialog.value === 'reject') {
    return {
      title: `驳回 ${name} ${versionLabel}？`,
      description: '驳回理由会展示给提交方。',
      label: '驳回理由',
      submitLabel: '驳回',
      required: true,
      color: 'error' as const,
    }
  }
  return {
    title: `强制下架 ${name}？`,
    description: '下架后全平台不可浏览和安装，已安装的副本不受影响；作者只能提交新版本重新审核。',
    label: '下架理由',
    submitLabel: '强制下架',
    required: true,
    color: 'error' as const,
  }
})

async function load() {
  const request = ++loadRequest
  loadError.value = ''
  const error = await marketStore.loadReviewPage({
    status: status.value,
    limit: pageSize.value,
    offset: (page.value - 1) * pageSize.value,
  })
  // 只认最后一次请求的结果，先发后到的旧请求不覆盖错误提示。
  if (request === loadRequest) loadError.value = error ?? ''
}

// 审核接口不看工作区，只随状态和分页变化重新拉取。
watch([status, page, pageSize], () => {
  void load()
}, { immediate: true })

onMounted(() => {
  void marketStore.loadCategories()
})

onBeforeUnmount(() => {
  loadRequest += 1
})

function onStatusChange(value: string | number) {
  status.value = String(value) as MarketVersionStatus
  page.value = 1
}

function onPageSizeChange(size: number) {
  pageSize.value = size
  page.value = 1
}

/** 强制下架只适用于社区条目，且条目处于已上架或作者下架状态，口径与后端一致。 */
function canRemove(item: MarketReviewItem): boolean {
  if (item.listing.is_official) return false
  return item.listing.status === 'listed' || item.listing.status === 'delisted'
}

function openDialog(type: ReviewDialog, item: MarketReviewItem) {
  dialog.value = type
  dialogTarget.value = item
}

function onDialogOpenChange(open: boolean) {
  if (open || saving.value) return
  dialog.value = null
  dialogTarget.value = null
}

/** 提交审核动作；失败时展示后端的中文说明（如版本已被其他管理员处理），弹窗保留。 */
async function onDialogSubmit(text: string) {
  const type = dialog.value
  const target = dialogTarget.value
  if (!type || !target || saving.value) return

  saving.value = true
  let error: string | null
  let successTitle: string
  if (type === 'approve') {
    error = await marketStore.approveVersion(target.version.id, text)
    successTitle = '已通过审核，条目已上架'
  } else if (type === 'reject') {
    error = await marketStore.rejectVersion(target.version.id, text)
    successTitle = '已驳回'
  } else {
    error = await marketStore.removeListing(target.listing.id, text)
    successTitle = '已强制下架'
  }
  saving.value = false

  if (error) {
    toast.add({ title: '操作失败', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  dialog.value = null
  dialogTarget.value = null
  toast.add({ title: successTitle, color: 'success', icon: 'i-lucide-check' })

  // 待审列表里处理掉的是本页最后一条时退回上一页，否则原地刷新。
  const lastItemOnPage = marketStore.state.reviewItems.length === 1 && page.value > 1
  if (status.value === 'pending' && type !== 'remove' && lastItemOnPage) {
    page.value -= 1
    return
  }
  void load()
}
</script>

<template>
  <div :class="$style.review">
    <div :class="$style.toolbar">
      <UTabs
        :model-value="status"
        :items="statusItems"
        :content="false"
        variant="pill"
        size="sm"
        @update:model-value="onStatusChange"
      />
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        size="sm"
        label="刷新"
        :loading="marketStore.state.reviewLoading"
        @click="load"
      />
    </div>

    <UAlert
      v-if="loadError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="loadError"
      :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: load }]"
    />

    <div v-if="marketStore.state.reviewLoading && !marketStore.state.reviewItems.length" :class="$style.list" aria-busy="true">
      <USkeleton v-for="n in 2" :key="n" :class="$style.skeleton" />
    </div>

    <UEmpty
      v-else-if="!marketStore.state.reviewItems.length && !loadError"
      variant="naked"
      icon="i-lucide-list-checks"
      :title="status === 'pending' ? '没有待审核的版本' : '没有记录'"
    />

    <div v-else :class="$style.list">
      <article v-for="item in marketStore.state.reviewItems" :key="item.version.id" :class="$style.item">
        <header :class="$style.itemHead">
          <div :class="$style.itemTitle">
            <UIcon :name="item.listing.kind === 'agent' ? 'i-lucide-bot' : 'i-lucide-wrench'" :class="$style.kindIcon" />
            <strong :class="$style.name">{{ getSnapshotName(item.version.snapshot) }}</strong>
            <span :class="[$style.version, 'mono']">v{{ item.version.version_number }}</span>
            <UBadge :label="MARKET_KIND_LABELS[item.listing.kind]" color="neutral" variant="soft" size="xs" />
            <UBadge
              :label="MARKET_VERSION_STATUS_META[item.version.status].label"
              :color="MARKET_VERSION_STATUS_META[item.version.status].color"
              variant="subtle"
              size="xs"
            />
            <UBadge v-if="item.listing.is_official" label="官方" color="primary" variant="subtle" size="xs" />
          </div>
          <div :class="$style.itemActions">
            <template v-if="item.version.status === 'pending'">
              <UButton label="通过" icon="i-lucide-check" size="sm" @click="openDialog('approve', item)" />
              <UButton label="驳回" icon="i-lucide-x" color="error" variant="outline" size="sm" @click="openDialog('reject', item)" />
            </template>
            <UButton
              v-if="canRemove(item)"
              label="强制下架"
              icon="i-lucide-ban"
              color="error"
              variant="ghost"
              size="sm"
              @click="openDialog('remove', item)"
            />
          </div>
        </header>

        <dl :class="$style.meta">
          <div><dt>发布方</dt><dd>{{ item.publisher_name || '—' }}</dd></div>
          <div><dt>分类</dt><dd>{{ getCategoryLabel(marketStore.state.categories, item.version.category) }}</dd></div>
          <div><dt>条目状态</dt><dd>{{ MARKET_LISTING_STATUS_META[item.listing.status].label }}</dd></div>
          <div><dt>提交时间</dt><dd><RelativeTime :value="item.version.created_at" /></dd></div>
          <div v-if="item.version.reviewed_at"><dt>审核时间</dt><dd><RelativeTime :value="item.version.reviewed_at" /></dd></div>
        </dl>

        <p v-if="item.version.release_note" :class="$style.note"><span>版本说明</span>{{ item.version.release_note }}</p>
        <p v-if="item.version.review_comment" :class="$style.note"><span>审核意见</span>{{ item.version.review_comment }}</p>
        <p v-if="item.listing.status_reason" :class="$style.note"><span>下架原因</span>{{ item.listing.status_reason }}</p>

        <!-- 快照全文默认收起，展开时才渲染。 -->
        <UCollapsible :class="$style.snapshot">
          <UButton
            label="快照全文"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-file-search"
            trailing-icon="i-lucide-chevron-down"
            :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
          />
          <template #content>
            <div :class="$style.snapshotBody">
              <SnapshotView :snapshot="item.version.snapshot" />
            </div>
          </template>
        </UCollapsible>
      </article>
    </div>

    <ResourcePagination
      v-if="marketStore.state.reviewTotal > 0"
      :shown="marketStore.state.reviewItems.length"
      :total="marketStore.state.reviewTotal"
      :page="page"
      :items-per-page="pageSize"
      :page-sizes="REVIEW_PAGE_SIZES"
      @update:page="(value: number) => { page = value }"
      @update:items-per-page="onPageSizeChange"
    />

    <ReasonModal
      :open="dialog !== null"
      :title="dialogConfig.title"
      :description="dialogConfig.description"
      :label="dialogConfig.label"
      :submit-label="dialogConfig.submitLabel"
      :required="dialogConfig.required"
      :submit-color="dialogConfig.color"
      :saving="saving"
      @update:open="onDialogOpenChange"
      @submit="onDialogSubmit"
    />
  </div>
</template>

<style module src="./index.module.css"></style>
