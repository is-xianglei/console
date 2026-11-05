<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ResourcePagination } from '@/components'
import { MARKET_PAGE_SIZES } from '@/constants/market'
import { useMarketBrowse, type MarketKindFilter } from '@/hooks/useMarketBrowse'
import { useMarketStore } from '@/stores/market'
import { getCategoryLabel } from '@/utils/market'
import ListingCard from '../../components/listing-card/index.vue'

/** 「发现」：按类型、分类、关键词、是否官方浏览已上架的 Agent 和 Skill，服务端分页。 */
defineOptions({ name: 'MarketDiscoverSection' })

const marketStore = useMarketStore()
const { state, keywordInput, items, total, loading, loadError, hasActiveFilter, load, onSearch, onReset } = useMarketBrowse()

const kindItems = [
  { label: '全部', value: 'all' },
  { label: 'Agent', value: 'agent' },
  { label: 'Skill', value: 'skill' },
]

const categoryItems = computed(() => {
  const options = [{ label: '全部分类', value: 'all' }]
  for (const category of marketStore.state.categories) {
    options.push({ label: category.label, value: category.key })
  }
  return options
})

onMounted(() => {
  void marketStore.loadCategories()
})

function onKindChange(value: string | number) {
  state.kind = String(value) as MarketKindFilter
}

function onCategoryChange(value: unknown) {
  state.category = String(value ?? 'all')
}

function onOfficialChange(value: boolean | 'indeterminate') {
  state.official = value === true
}
</script>

<template>
  <div :class="$style.discover">
    <div :class="$style.toolbar">
      <UTabs
        :model-value="state.kind"
        :items="kindItems"
        :content="false"
        variant="pill"
        size="sm"
        :class="$style.kindTabs"
        @update:model-value="onKindChange"
      />
      <div :class="$style.filters">
        <UCheckbox :model-value="state.official" label="仅官方" @update:model-value="onOfficialChange" />
        <USelect
          :model-value="state.category"
          :items="categoryItems"
          :class="$style.category"
          aria-label="按分类筛选"
          @update:model-value="onCategoryChange"
        />
        <UInput
          v-model="keywordInput"
          :class="$style.search"
          icon="i-lucide-search"
          placeholder="搜索名称或简介，回车查询"
          aria-label="搜索市场条目"
          @keydown.enter="onSearch"
        />
        <UButton label="查询" color="primary" @click="onSearch" />
        <UButton label="重置" color="neutral" variant="outline" :disabled="!hasActiveFilter" @click="onReset" />
      </div>
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
      <USkeleton v-for="n in 6" :key="n" :class="$style.skeleton" />
    </div>

    <UEmpty
      v-else-if="!items.length && !loadError"
      variant="naked"
      :icon="hasActiveFilter ? 'i-lucide-search-x' : 'i-lucide-store'"
      :title="hasActiveFilter ? '没有匹配的条目' : '市场里还没有上架的条目'"
    >
      <template v-if="hasActiveFilter" #actions>
        <UButton icon="i-lucide-rotate-ccw" label="清除筛选" color="neutral" variant="outline" @click="onReset" />
      </template>
    </UEmpty>

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
