<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { TableColumn } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import { RelativeTime } from '@/components'
import { MARKET_KIND_LABELS, MARKET_LISTING_STATUS_META, MARKET_VERSION_STATUS_META } from '@/constants/market'
import type { MarketListing, MarketMyListingItem, MarketVersion } from '@/interfaces/market/model'
import { useAuthStore } from '@/stores/auth'
import { useMarketStore } from '@/stores/market'
import { getCategoryLabel, getListingDisplayName } from '@/utils/market'

/**
 * 「我的上架」：当前工作区发布的全部条目，以及每个条目的全部版本（状态、审核意见、驳回理由）。
 * 支持撤回待审版本、下架、重新上架；提交新版本在源 Agent / Skill 的详情页操作。
 */
defineOptions({ name: 'MarketMineSection' })

/** 需要二次确认的操作：撤回待审版本、作者下架。 */
interface PendingAction {
  type: 'withdraw' | 'delist'
  /** 带上全部版本，条目还没有名称时用最新版本的名称。 */
  item: MarketMyListingItem
  version: MarketVersion | null
}

const toast = useToast()
const authStore = useAuthStore()
const marketStore = useMarketStore()

const loadError = ref('')
const versionColumns: TableColumn<MarketVersion>[] = [
  { id: 'version', header: '版本' },
  { id: 'status', header: '状态' },
  { id: 'category', header: '分类' },
  { id: 'release_note', header: '版本说明' },
  { id: 'review_comment', header: '审核意见 / 驳回理由' },
  { id: 'created_at', header: '提交时间' },
  { id: 'reviewed_at', header: '审核时间' },
  { id: 'actions', header: () => h('span', { class: 'sr-only' }, '操作'), meta: { class: { td: 'text-right whitespace-nowrap' } } },
]
const pendingAction = ref<PendingAction | null>(null)
const acting = ref(false)
/** 正在重新上架的条目 ID，对应按钮显示 loading。 */
const relistingId = ref<number | null>(null)
let loadRequest = 0

const confirmTitle = computed(() => {
  const action = pendingAction.value
  if (!action) return ''
  if (action.type === 'withdraw' && action.version) return `撤回 v${action.version.version_number}？`
  return `下架「${getListingDisplayName(action.item.listing, action.item.versions)}」？`
})

const confirmDescription = computed(() => {
  const action = pendingAction.value
  if (!action) return ''
  if (action.type === 'withdraw') return '撤回后这个版本不再进入审核，之后可以重新提交。'
  return '下架后其他工作区将无法浏览和安装，已安装的副本不受影响；之后可以重新上架。'
})

async function load() {
  const request = ++loadRequest
  loadError.value = ''
  const error = await marketStore.loadMyListings()
  // 只认最后一次请求的结果，先发后到的旧请求不覆盖错误提示。
  if (request === loadRequest) loadError.value = error ?? ''
}

// 条目按工作区区分，首次进入和切换工作区都重新拉取。
watch(
  () => authStore.currentWorkspaceId,
  (workspaceId) => {
    if (workspaceId) void load()
  },
  { immediate: true },
)

onMounted(() => {
  void marketStore.loadCategories()
})

onBeforeUnmount(() => {
  loadRequest += 1
})

/** 源 Agent / Skill 的详情页，提交新版本在那里操作；源对象被删除后没有入口。 */
function getSourceRoute(listing: MarketListing): RouteLocationRaw | null {
  if (listing.kind === 'agent' && listing.source_agent_id !== null) {
    return { name: 'agent-detail', params: { id: String(listing.source_agent_id) } }
  }
  if (listing.kind === 'skill' && listing.source_skill_id !== null) {
    return { name: 'skill-detail', params: { id: String(listing.source_skill_id) } }
  }
  return null
}

function requestWithdraw(item: MarketMyListingItem, version: MarketVersion) {
  pendingAction.value = { type: 'withdraw', item, version }
}

function requestDelist(item: MarketMyListingItem) {
  pendingAction.value = { type: 'delist', item, version: null }
}

function cancelAction() {
  if (!acting.value) pendingAction.value = null
}

/** 确认撤回或下架；失败时直接展示后端的中文说明，弹窗保留方便重试。 */
async function confirmAction() {
  const action = pendingAction.value
  if (!action || acting.value) return
  acting.value = true
  let error: string | null
  if (action.type === 'withdraw' && action.version) {
    error = await marketStore.withdrawVersion(action.version.id)
  } else {
    error = await marketStore.delistListing(action.item.listing.id)
  }
  acting.value = false
  if (error) {
    toast.add({ title: '操作失败', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  pendingAction.value = null
  if (action.type === 'withdraw') {
    toast.add({ title: '已撤回待审版本', color: 'success', icon: 'i-lucide-undo-2' })
  } else {
    toast.add({ title: `「${getListingDisplayName(action.item.listing, action.item.versions)}」已下架`, color: 'success', icon: 'i-lucide-archive' })
  }
}

/** 重新上架只是恢复可见，不需要二次确认。 */
async function onRelist(item: MarketMyListingItem) {
  if (relistingId.value !== null) return
  relistingId.value = item.listing.id
  const error = await marketStore.relistListing(item.listing.id)
  relistingId.value = null
  if (error) {
    toast.add({ title: '重新上架失败', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  toast.add({ title: `「${getListingDisplayName(item.listing, item.versions)}」已重新上架`, color: 'success', icon: 'i-lucide-store' })
}
</script>

<template>
  <div :class="$style.mine">
    <div :class="$style.toolbar">
      <span :class="[$style.total, 'mono']">共 {{ marketStore.state.myListings.length }} 个条目</span>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        size="sm"
        label="刷新"
        :loading="marketStore.state.myListingsLoading"
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

    <div v-if="marketStore.state.myListingsLoading && !marketStore.state.myListings.length" :class="$style.list" aria-busy="true">
      <USkeleton v-for="n in 2" :key="n" :class="$style.skeleton" />
    </div>

    <UEmpty
      v-else-if="!marketStore.state.myListings.length && !loadError"
      variant="naked"
      icon="i-lucide-upload-cloud"
      title="当前工作区还没有上架过 Agent 或 Skill"
      description="在 Agent 或 Skill 的详情页点「申请上架」提交审核。"
    />

    <div v-else :class="$style.list">
      <article v-for="item in marketStore.state.myListings" :key="item.listing.id" :class="$style.listing">
        <header :class="$style.listingHead">
          <div :class="$style.listingTitle">
            <UIcon :name="item.listing.kind === 'agent' ? 'i-lucide-bot' : 'i-lucide-wrench'" :class="$style.kindIcon" />
            <strong :class="$style.name">{{ getListingDisplayName(item.listing, item.versions) }}</strong>
            <UBadge :label="MARKET_KIND_LABELS[item.listing.kind]" color="neutral" variant="soft" size="xs" />
            <UBadge
              :label="MARKET_LISTING_STATUS_META[item.listing.status].label"
              :color="MARKET_LISTING_STATUS_META[item.listing.status].color"
              variant="subtle"
              size="xs"
            />
            <UBadge v-if="item.listing.current_version_number === null" label="待首次审核" color="neutral" variant="outline" size="xs" />
            <span v-if="item.listing.current_version_number" :class="[$style.current, 'mono']">当前 v{{ item.listing.current_version_number }}</span>
          </div>
          <div :class="$style.listingActions">
            <UButton
              v-if="item.listing.current_version_number !== null"
              label="查看详情"
              color="neutral"
              variant="ghost"
              size="sm"
              :to="{ name: 'market-detail', params: { id: String(item.listing.id) } }"
            />
            <UButton
              v-if="getSourceRoute(item.listing)"
              :label="item.listing.kind === 'agent' ? '源 Agent' : '源 Skill'"
              color="neutral"
              variant="ghost"
              size="sm"
              trailing-icon="i-lucide-arrow-up-right"
              :to="getSourceRoute(item.listing) ?? undefined"
            />
            <UButton
              v-if="item.listing.status === 'listed' && !item.listing.is_official"
              label="下架"
              color="warning"
              variant="outline"
              size="sm"
              icon="i-lucide-archive"
              @click="requestDelist(item)"
            />
            <UButton
              v-if="item.listing.status === 'delisted' && !item.listing.is_official"
              label="重新上架"
              color="primary"
              variant="outline"
              size="sm"
              icon="i-lucide-store"
              :loading="relistingId === item.listing.id"
              @click="onRelist(item)"
            />
          </div>
        </header>

        <p v-if="item.listing.status_reason" :class="$style.statusReason">下架原因：{{ item.listing.status_reason }}</p>

        <UTable :data="item.versions" :columns="versionColumns" :get-row-id="(version: MarketVersion) => String(version.id)" :ui="{ root: $style.tableWrap, base: $style.versions }">
          <template #version-cell="{ row }"><span class="mono">v{{ row.original.version_number }}</span></template>
          <template #status-cell="{ row }">
            <UBadge
              :label="MARKET_VERSION_STATUS_META[row.original.status].label"
              :color="MARKET_VERSION_STATUS_META[row.original.status].color"
              variant="subtle"
              size="xs"
            />
          </template>
          <template #category-cell="{ row }">{{ getCategoryLabel(marketStore.state.categories, row.original.category) }}</template>
          <template #release_note-cell="{ row }"><span :class="$style.textCell">{{ row.original.release_note || '—' }}</span></template>
          <template #review_comment-cell="{ row }">
            <span :class="[$style.textCell, { [$style.rejected]: row.original.status === 'rejected' }]">{{ row.original.review_comment || '—' }}</span>
          </template>
          <template #created_at-cell="{ row }"><RelativeTime :value="row.original.created_at" /></template>
          <template #reviewed_at-cell="{ row }"><RelativeTime :value="row.original.reviewed_at" /></template>
          <template #actions-cell="{ row }">
            <UButton
              v-if="row.original.status === 'pending'"
              label="撤回"
              color="neutral"
              variant="outline"
              size="xs"
              icon="i-lucide-undo-2"
              @click="requestWithdraw(item, row.original)"
            />
          </template>
        </UTable>
      </article>
    </div>

    <UModal
      :open="pendingAction !== null"
      :title="confirmTitle"
      :description="confirmDescription"
      :dismissible="!acting"
      :close="!acting"
      :ui="{ footer: 'justify-end' }"
      @update:open="(open: boolean) => { if (!open) cancelAction() }"
    >
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="acting" @click="cancelAction" />
        <UButton
          :label="pendingAction?.type === 'withdraw' ? '确认撤回' : '确认下架'"
          color="warning"
          :loading="acting"
          :disabled="acting"
          @click="confirmAction"
        />
      </template>
    </UModal>
  </div>
</template>

<style module src="./index.module.css"></style>
