<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ResourcePagination } from '@/components'
import { MARKET_PAGE_SIZES } from '@/constants/market'
import { useListUrlState } from '@/hooks/useListUrlState'
import { useAuthStore } from '@/stores/auth'
import { useMarketStore } from '@/stores/market'
import { buildInstalledQuery, getCategoryLabel } from '@/utils/market'
import ListingCard from '../../components/listing-card/index.vue'

/**
 * 「已安装」和「版本更新」：同一个组件按路由参数区分，分别带 installed、has_update 向后端筛选，服务端分页。
 * 「已安装」包含已下架、平台已下架的条目，卡片上标出状态和原因；「版本更新」只有仍在上架的条目。
 */
defineOptions({ name: 'MarketInstalledSection' })

const route = useRoute()
const authStore = useAuthStore()
const marketStore = useMarketStore()

// 模块切换时组件会按 key 重建，进入时读一次即可；不跟随路由变化，离开时淡出不闪内容。
const onlyUpdates = route.params.section === 'updates'

// 页码和每页条数写入 URL，与「发现」一致。
const { state } = useListUrlState({
  defaults: {
    page: 1,
    pageSize: MARKET_PAGE_SIZES[0],
  },
})

const loadError = ref('')
let loadRequest = 0

const items = computed(() => marketStore.state.installedItems)
const total = computed(() => marketStore.state.installedTotal)
const loading = computed(() => marketStore.state.installedLoading)

let emptyTitle = '当前工作区还没有从市场安装的条目'
if (onlyUpdates) emptyTitle = '已安装的条目都是最新版本'

async function load() {
  const request = ++loadRequest
  loadError.value = ''
  const params = buildInstalledQuery({ onlyUpdates, page: state.page, pageSize: state.pageSize })
  const error = await marketStore.loadInstalledPage(params)
  // 只认最后一次请求的结果，先发后到的旧请求不覆盖错误提示。
  if (request === loadRequest) loadError.value = error ?? ''
}

onMounted(() => {
  void marketStore.loadCategories()
})

onBeforeUnmount(() => {
  loadRequest += 1
})

// 首次进入、翻页、切换工作区（安装状态按工作区区分）都重新拉取。
watch(
  () => [authStore.currentWorkspaceId, state.page, state.pageSize],
  () => {
    if (authStore.currentWorkspaceId) void load()
  },
  { immediate: true },
)
</script>

<template>
  <div :class="$style.installed">
    <div :class="$style.toolbar">
      <span :class="[$style.total, 'mono']">共 {{ total }} 个</span>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        size="sm"
        label="刷新"
        :loading="loading"
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

    <div v-if="loading && !items.length" :class="$style.grid" aria-busy="true">
      <USkeleton v-for="n in 3" :key="n" :class="$style.skeleton" />
    </div>

    <UEmpty v-else-if="!items.length && !loadError" variant="naked" icon="i-lucide-package-open" :title="emptyTitle" />

    <div v-else :class="$style.grid">
      <ListingCard
        v-for="item in items"
        :key="item.id"
        :item="item"
        :category-label="getCategoryLabel(marketStore.state.categories, item.category)"
      />
    </div>

    <ResourcePagination
      v-if="total > 0"
      :shown="items.length"
      :total="total"
      :page="state.page"
      :items-per-page="state.pageSize"
      :page-sizes="MARKET_PAGE_SIZES"
      @update:page="(page: number) => { state.page = page }"
      @update:items-per-page="(size: number) => { state.pageSize = size }"
    />
  </div>
</template>

<style module src="./index.module.css"></style>
