<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WorkbenchApp } from '../../../data/appRegistry'

const props = defineProps<{ app: WorkbenchApp }>()

const selectedTab = ref(props.app.tabs[0])
const selectedAssetIndex = ref(Math.max(0, props.app.assets.findIndex((asset) => asset.status === 'warning')))
const actionMessage = ref('')
const syncTime = ref(formatSyncTime())

const selectedAsset = computed(() => props.app.assets[selectedAssetIndex.value] ?? props.app.assets[0])
const warningCount = computed(() => props.app.assets.filter((asset) => asset.status === 'warning').length)

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
</script>

<template>
  <section class="runtime" :aria-label="`${app.name}应用界面`">
    <div class="runtime-strip">
      <div class="runtime-stat"><strong>{{ app.assets.length }}</strong> 个运行对象</div>
      <div class="runtime-stat" :class="{ alert: warningCount }"><strong>{{ warningCount }}</strong> 项预警</div>
      <div class="runtime-stat"><strong>1</strong> 个操作待审批</div>
      <div class="runtime-stat">运行耗时 <strong>01:42</strong></div>
      <div class="runtime-spacer"></div>
      <div class="sync-time mono">SYNC {{ syncTime }}</div>
    </div>

    <header class="runtime-head">
      <span class="dot nominal" title="实时连接正常"></span>
      <h2>{{ app.name }} · 实时</h2>
      <span class="runtime-source mono">{{ app.subject }}</span>
      <button type="button" title="刷新应用数据" aria-label="刷新应用数据" @click="refreshRuntime">
        <i class="icon icon-refresh-cw"></i>
      </button>
      <button type="button" title="独立打开应用" aria-label="独立打开应用" @click="notify('已准备在独立视图打开应用')">
        <i class="icon icon-external-link"></i>
      </button>
    </header>

    <div class="runtime-body">
      <section class="plant-summary">
        <div class="plant-title">
          <div>
            <span class="section-kicker mono">MANUFACTURING RUNTIME</span>
            <h3>{{ app.unit }}</h3>
            <p>{{ app.location }}</p>
          </div>
          <div class="health-value mono">{{ app.score }}<small>/100</small></div>
        </div>
        <div class="line-tabs" aria-label="运行单元">
          <button
            v-for="tab in app.tabs"
            :key="tab"
            type="button"
            :class="{ active: selectedTab === tab }"
            :aria-pressed="selectedTab === tab"
            @click="selectedTab = tab; notify(`已切换到${tab}`)"
          >{{ tab }}</button>
        </div>
      </section>

      <section class="asset-list" aria-label="运行对象">
        <div class="asset-list-head mono">
          <span>对象 / 评分</span><span>{{ app.readingLabel }}</span><span>状态</span>
        </div>
        <button
          v-for="(asset, index) in app.assets"
          :key="asset.name"
          type="button"
          class="asset-row"
          :class="{ active: selectedAssetIndex === index }"
          :aria-pressed="selectedAssetIndex === index"
          @click="selectedAssetIndex = index; notify(`已选择${asset.name}`)"
        >
          <span class="asset-main">
            <span class="asset-name"><span class="dot" :class="asset.status"></span>{{ asset.name }}</span>
            <span class="health-bar" :class="asset.status"><span :style="{ width: `${asset.score}%` }"></span></span>
          </span>
          <span class="asset-reading mono">{{ asset.reading }}</span>
          <span class="asset-state" :class="asset.status">{{ asset.status === 'warning' ? '预警' : '正常' }}</span>
        </button>
      </section>

      <section class="detail-panel">
        <div class="detail-title">
          <span class="dot" :class="selectedAsset?.status ?? 'nominal'"></span>
          <strong>{{ selectedAsset?.name ?? app.detail }}</strong>
          <span class="review-state mono">{{ app.reviewLabel }}</span>
        </div>
        <p class="detail-context">{{ app.detail }} · {{ selectedTab }}策略正在关联实时数据与业务约束。</p>
        <div class="measure-grid">
          <div v-for="measure in app.measures" :key="measure.label" class="measure">
            <span>{{ measure.label }}</span><strong class="mono">{{ measure.value }}</strong>
          </div>
        </div>
        <div class="event-log mono">
          <div v-for="(event, index) in app.events" :key="event">
            <span>{{ ['14:24:12', '13:48:06', '11:10:32'][index] }}</span> · {{ event }}
          </div>
        </div>
        <div class="action-row">
          <button class="primary-action" type="button" @click="notify('操作单已创建，等待业务负责人确认')">
            <i class="icon icon-clipboard-plus"></i>创建操作单
          </button>
          <button class="secondary-action" type="button" @click="notify('分析结果已提交治理审批队列')">
            <i class="icon icon-shield-check"></i>提交审批
          </button>
        </div>
      </section>
    </div>

    <div class="runtime-feedback mono" aria-live="polite">{{ actionMessage }}</div>
  </section>
</template>

<style scoped>
.runtime { flex: 1; min-width: 0; min-height: 0; background: var(--bg-panel); display: flex; flex-direction: column; position: relative; container-type: inline-size; }
.runtime-strip { min-height: 34px; flex: 0 0 34px; padding: 0 14px; border-bottom: 1px solid var(--border); background: var(--bg-surface); display: flex; align-items: center; gap: 16px; }
.runtime-stat { color: var(--text-muted); font-family: var(--font-data); font-size: 9px; white-space: nowrap; }.runtime-stat strong { color: var(--text-primary); }.runtime-stat.alert strong { color: var(--status-warning); }.runtime-spacer { flex: 1; }.sync-time { color: var(--text-dim); font-size: 8px; }
.runtime-head { min-height: 42px; flex: 0 0 42px; padding: 0 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }.runtime-head h2 { font-family: var(--font-ui); font-size: 11px; font-weight: 650; letter-spacing: .04em; }.runtime-source { margin-left: 3px; color: var(--text-dim); font-size: 8px; }.runtime-head button { width: 28px; height: 28px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-muted); display: grid; place-items: center; cursor: pointer; }.runtime-head button:first-of-type { margin-left: auto; }.runtime-head button:hover { background: var(--bg-elevated); color: var(--accent-agent); }.runtime-head button:active { transform: scale(.95); }
.runtime-body { flex: 1; min-height: 0; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 16px; }.plant-summary { border-bottom: 1px solid var(--border); padding-bottom: 14px; }.plant-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }.section-kicker { color: var(--accent-agent); font-size: 8px; letter-spacing: .1em; }.plant-title h3 { margin-top: 3px; font-family: var(--font-ui); font-size: 18px; font-weight: 650; letter-spacing: 0; }.plant-title p { margin-top: 2px; color: var(--text-muted); font-size: 11px; }.health-value { color: var(--text-primary); font-size: 26px; font-weight: 600; line-height: 1; }.health-value small { color: var(--text-dim); font-size: 10px; }
.line-tabs { margin-top: 14px; width: fit-content; padding: 2px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--bg-elevated); display: flex; gap: 2px; }.line-tabs button { min-height: 25px; padding: 0 10px; border: 0; border-radius: 3px; background: transparent; color: var(--text-muted); font-family: var(--font-data); font-size: 9px; cursor: pointer; }.line-tabs button.active { background: var(--bg-surface); color: var(--accent-agent); }
.asset-list { border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }.asset-list-head,.asset-row { display: grid; grid-template-columns: minmax(180px, 1fr) 88px 48px; align-items: center; column-gap: 10px; }.asset-list-head { min-height: 30px; padding: 0 14px; background: var(--bg-elevated); color: var(--text-dim); font-size: 8px; letter-spacing: .08em; text-transform: uppercase; }.asset-list-head span:nth-child(n+2) { text-align: right; }.asset-row { width: 100%; min-height: 52px; padding: 7px 14px; border: 0; border-top: 1px solid var(--border-subtle); background: var(--bg-panel); color: var(--text-secondary); text-align: left; cursor: pointer; }.asset-row:hover { background: var(--bg-surface); }.asset-row.active { background: var(--accent-agent-dim); }.asset-main { min-width: 0; display: flex; flex-direction: column; gap: 7px; }.asset-name { display: flex; align-items: center; gap: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-data); font-size: 10px; }.health-bar { width: min(150px, 90%); height: 3px; background: var(--bg-hover); }.health-bar > span { display: block; height: 100%; background: var(--accent-agent); }.health-bar.warning > span { background: var(--status-warning); }.asset-reading { color: var(--text-primary); font-size: 10px; text-align: right; }.asset-state { color: var(--status-success); font-size: 9px; text-align: right; }.asset-state.warning { color: var(--status-warning); }
.detail-panel { padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-surface); }.detail-title { display: flex; align-items: center; gap: 8px; }.detail-title strong { font-family: var(--font-ui); font-size: 12px; }.review-state { margin-left: auto; padding: 2px 6px; border: 1px solid rgba(251,191,36,.35); border-radius: 3px; color: var(--status-warning); font-size: 8px; }.detail-context { margin-top: 8px; color: var(--text-muted); font-size: 11px; }.measure-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }.measure { padding: 9px 10px; border: 1px solid var(--border-subtle); border-radius: var(--radius-control); background: var(--bg-elevated); }.measure span { display: block; color: var(--text-dim); font-family: var(--font-ui); font-size: 8px; letter-spacing: .08em; text-transform: uppercase; }.measure strong { display: block; margin-top: 4px; color: var(--text-primary); font-size: 11px; }.event-log { margin-top: 12px; padding: 9px 10px; border-left: 2px solid var(--accent-agent); background: var(--bg-elevated); color: var(--text-muted); font-size: 9px; line-height: 1.75; }.event-log span { color: var(--text-dim); }.action-row { margin-top: 12px; display: flex; gap: 8px; }.action-row button { min-height: 30px; padding: 0 11px; border-radius: var(--radius-control); display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: 9px; font-weight: 650; cursor: pointer; }.primary-action { border: 1px solid rgba(45,212,191,.3); background: var(--accent-agent-dim); color: var(--accent-agent); }.secondary-action { border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text-secondary); }.action-row button:hover { border-color: var(--accent-agent); }
.runtime-feedback { min-height: 22px; padding: 4px 14px; border-top: 1px solid var(--border-subtle); color: var(--accent-agent); font-size: 8px; }
@media (max-width: 980px) { .runtime-strip { gap: 9px; }.runtime-stat:nth-child(4),.sync-time { display: none; }.runtime-body { padding: 12px; }.asset-list-head,.asset-row { grid-template-columns: minmax(130px, 1fr) 76px 42px; } }
@media (max-width: 620px) { .runtime-source { display: none; }.runtime-body { padding: 10px; }.asset-list-head,.asset-row { grid-template-columns: minmax(110px, 1fr) 68px 38px; padding-left: 9px; padding-right: 9px; }.measure-grid { grid-template-columns: 1fr; }.action-row { flex-wrap: wrap; } }
@container (max-width: 420px) {
  .runtime-strip { padding: 0 10px; gap: 12px; }
  .runtime-stat:nth-child(3),.runtime-stat:nth-child(4),.sync-time { display: none; }
  .runtime-head { padding: 0 10px; }
  .runtime-source { display: none; }
  .runtime-body { padding: 10px; gap: 12px; }
  .plant-title h3 { font-size: 15px; }
  .asset-list-head,.asset-row { grid-template-columns: minmax(0, 1fr) 66px 38px; column-gap: 6px; padding-left: 9px; padding-right: 9px; }
  .health-bar { width: 92%; }
  .detail-panel { padding: 12px; }
  .measure-grid { gap: 5px; }
  .measure { padding: 7px 6px; }
  .measure strong { font-size: 10px; }
  .action-row { flex-wrap: wrap; }
}
</style>
