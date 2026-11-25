<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WorkbenchApp } from '@/interfaces'

defineOptions({ name: 'AppRuntimePanel' })

const props = defineProps<{ app: WorkbenchApp }>()

const selectedTab = ref(props.app.tabs[0])
const selectedAssetIndex = ref(Math.max(0, props.app.assets.findIndex((asset) => asset.status === 'warning')))
const actionMessage = ref('')
const syncTime = ref(formatSyncTime())

const selectedAsset = computed(() => props.app.assets[selectedAssetIndex.value] ?? props.app.assets[0])
const warningCount = computed(() => props.app.assets.filter((asset) => asset.status === 'warning').length)
const tabItems = computed(() => props.app.tabs.map((value) => ({ label: value, value })))

watch(() => props.app.id, () => {
  selectedTab.value = props.app.tabs[0]
  selectedAssetIndex.value = Math.max(0, props.app.assets.findIndex((asset) => asset.status === 'warning'))
  actionMessage.value = ''
  syncTime.value = formatSyncTime()
})

function formatSyncTime() {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date()).replaceAll('/', '-')
}

function refreshRuntime() {
  syncTime.value = formatSyncTime()
  actionMessage.value = '应用实时数据已刷新'
}

function notify(message: string) {
  actionMessage.value = message
}

function selectTab(value: string | number) {
  selectedTab.value = String(value)
  notify(`已切换到${selectedTab.value}`)
}
</script>

<template>
  <section :class="$style['runtime']" :aria-label="`${app.name}应用界面`">
    <div :class="$style['runtime-strip']">
      <div :class="$style['runtime-stat']"><strong>{{ app.assets.length }}</strong> 个运行对象</div>
      <div :class="[$style['runtime-stat'], { [$style.alert]: warningCount }]"><strong>{{ warningCount }}</strong> 项预警</div>
      <div :class="$style['runtime-stat']"><strong>1</strong> 个操作待审批</div>
      <div :class="$style['runtime-stat']">运行耗时 <strong>01:42</strong></div>
      <div :class="$style['runtime-spacer']"></div>
      <div :class="[$style['sync-time'], 'mono']">SYNC {{ syncTime }}</div>
    </div>

    <header :class="$style['runtime-head']">
      <UChip as="span" standalone size="xs" :ui="{ base: 'dot nominal' }" title="实时连接正常" />
      <h2>{{ app.name }} · 实时</h2>
      <span :class="[$style['runtime-source'], 'mono']">{{ app.subject }}</span>
      <UButton color="neutral" variant="ghost" square title="刷新应用数据" aria-label="刷新应用数据" @click="refreshRuntime">
        <i class="icon icon-refresh-cw"></i>
      </UButton>
      <UButton color="neutral" variant="ghost" square title="独立打开应用" aria-label="独立打开应用" @click="notify('已准备在独立视图打开应用')">
        <i class="icon icon-external-link"></i>
      </UButton>
    </header>

    <div :class="$style['runtime-body']">
      <section :class="$style['plant-summary']">
        <div :class="$style['plant-title']">
          <div>
            <span :class="[$style['section-kicker'], 'mono']">MANUFACTURING RUNTIME</span>
            <h3>{{ app.unit }}</h3>
            <p>{{ app.location }}</p>
          </div>
          <div :class="[$style['health-value'], 'mono']">{{ app.score }}<small>/100</small></div>
        </div>
        <UTabs
          :class="$style['line-tabs']"
          :model-value="selectedTab"
          :items="tabItems"
          :content="false"
          variant="pill"
          size="xs"
          aria-label="运行单元"
          @update:model-value="selectTab"
        />
      </section>

      <section :class="$style['asset-list']" aria-label="运行对象">
        <div :class="[$style['asset-list-head'], 'mono']">
          <span>对象 / 评分</span><span>{{ app.readingLabel }}</span><span>状态</span>
        </div>
        <UButton
          v-for="(asset, index) in app.assets"
          :key="asset.name"
          color="neutral"
          variant="ghost"
          block
          :class="[$style['asset-row'], { [$style.active]: selectedAssetIndex === index }]"
          :aria-pressed="selectedAssetIndex === index"
          @click="selectedAssetIndex = index; notify(`已选择${asset.name}`)"
        >
          <span :class="$style['asset-main']">
            <span :class="$style['asset-name']"><UChip as="span" standalone size="xs" :ui="{ base: `dot ${asset.status}` }" />{{ asset.name }}</span>
            <UProgress
              :model-value="asset.score"
              size="xs"
              :class="$style['health-bar']"
              :ui="{ base: $style['health-track'], indicator: asset.status === 'warning' ? $style['health-fill-warning'] : $style['health-fill'] }"
              :aria-label="`${asset.name} 健康度`"
            />
          </span>
          <span :class="[$style['asset-reading'], 'mono']">{{ asset.reading }}</span>
          <span :class="[$style['asset-state'], { [$style.warning]: asset.status === 'warning' }]">{{ asset.status === 'warning' ? '预警' : '正常' }}</span>
        </UButton>
      </section>

      <section :class="$style['detail-panel']">
        <div :class="$style['detail-title']">
          <UChip as="span" standalone size="xs" :ui="{ base: `dot ${selectedAsset?.status ?? 'nominal'}` }" />
          <strong>{{ selectedAsset?.name ?? app.detail }}</strong>
          <span :class="[$style['review-state'], 'mono']">{{ app.reviewLabel }}</span>
        </div>
        <p :class="$style['detail-context']">{{ app.detail }} · {{ selectedTab }}策略正在关联实时数据与业务约束。</p>
        <div :class="$style['measure-grid']">
          <div v-for="measure in app.measures" :key="measure.label" :class="$style['measure']">
            <span>{{ measure.label }}</span><strong class="mono">{{ measure.value }}</strong>
          </div>
        </div>
        <div :class="[$style['event-log'], 'mono']">
          <div v-for="(event, index) in app.events" :key="event">
            <span>{{ ['14:24:12', '13:48:06', '11:10:32'][index] }}</span> · {{ event }}
          </div>
        </div>
        <div :class="$style['action-row']">
          <UButton :class="$style['primary-action']" @click="notify('操作单已创建，等待业务负责人确认')">
            <i class="icon icon-clipboard-plus"></i>创建操作单
          </UButton>
          <UButton color="neutral" variant="outline" :class="$style['secondary-action']" @click="notify('分析结果已提交治理审批队列')">
            <i class="icon icon-shield-check"></i>提交审批
          </UButton>
        </div>
      </section>
    </div>

    <div :class="[$style['runtime-feedback'], 'mono']" aria-live="polite">{{ actionMessage }}</div>
  </section>
</template>

<style module src="./index.module.css"></style>
