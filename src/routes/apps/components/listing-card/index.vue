<script setup lang="ts">
import { MARKET_KIND_LABELS, MARKET_LISTING_STATUS_META } from '@/constants/market'
import type { MarketBrowseItem } from '@/interfaces/market/model'

/** 市场条目卡片：「发现」「已安装」「版本更新」共用，点击进入详情。 */
defineOptions({ name: 'MarketListingCard' })

const props = defineProps<{
  item: MarketBrowseItem
  /** 分类中文名，由父组件按分类列表换算。 */
  categoryLabel: string
}>()
</script>

<template>
  <RouterLink
    :to="{ name: 'market-detail', params: { id: String(props.item.id) } }"
    :class="$style.card"
    :aria-label="`查看 ${props.item.name ?? '条目'} 详情`"
  >
    <div :class="$style.head">
      <span :class="$style.icon">
        <UIcon :name="props.item.kind === 'agent' ? 'i-lucide-bot' : 'i-lucide-wrench'" />
      </span>
      <div :class="$style.titleBlock">
        <strong :class="$style.name">{{ props.item.name }}</strong>
        <!-- 官方条目的发布方就是「官方」，右侧徽标已经标明，不重复显示。 -->
        <span v-if="!props.item.is_official" :class="$style.publisher">{{ props.item.publisher_name }}</span>
      </div>
      <UBadge v-if="props.item.is_official" label="官方" color="primary" variant="subtle" size="xs" />
    </div>

    <p :class="$style.summary">{{ props.item.summary || '暂无简介' }}</p>
    <!-- 只有「已安装」里会出现非已上架的条目：标出下架状态和原因。 -->
    <p v-if="props.item.status !== 'listed' && props.item.status_reason" :class="$style.statusReason">
      下架原因：{{ props.item.status_reason }}
    </p>

    <div :class="$style.tags">
      <UBadge :label="MARKET_KIND_LABELS[props.item.kind]" color="neutral" variant="soft" size="xs" />
      <UBadge v-if="props.categoryLabel" :label="props.categoryLabel" color="neutral" variant="outline" size="xs" />
      <UBadge
        v-if="props.item.status !== 'listed'"
        :label="MARKET_LISTING_STATUS_META[props.item.status].label"
        :color="MARKET_LISTING_STATUS_META[props.item.status].color"
        variant="subtle"
        size="xs"
      />
      <UBadge
        v-if="props.item.installed"
        :label="`已安装 v${props.item.installed_version_number}`"
        color="success"
        variant="subtle"
        size="xs"
      />
      <UBadge v-if="props.item.has_update" label="有新版本" color="warning" variant="subtle" size="xs" />
    </div>

    <div :class="[$style.foot, 'mono']">
      <span :class="$style.count" title="安装次数">
        <UIcon name="i-lucide-download" />{{ props.item.install_count }}
      </span>
      <span v-if="props.item.current_version_number">v{{ props.item.current_version_number }}</span>
    </div>
  </RouterLink>
</template>

<style module src="./index.module.css"></style>
