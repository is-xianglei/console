<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BuildResourceManager from './build/BuildResourceManager.vue'
import {
  PLATFORM_MODULES,
  RESOURCE_PAGES,
  getDefaultResource,
  type PlatformModuleKey,
  type ResourceRow,
} from '../../data/platformCatalog'

const route = useRoute()
const router = useRouter()
const search = ref('')
const statusFilter = ref('all')
const inspectorTab = ref<'overview' | 'config' | 'history'>('overview')
const selectedId = ref('')
const selectedIds = ref<Set<string>>(new Set())
const drawerOpen = ref(false)
const featureRunning = ref(false)
const featureResult = ref('')
const toast = ref('')
const draftName = ref('')
const draftOwner = ref('AI 平台组')
const draftScope = ref('当前工作区')
const draftEnabled = ref(true)
let featureTimer: ReturnType<typeof setTimeout> | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined

const moduleKey = computed<PlatformModuleKey>(() => {
  const value = String(route.params.module ?? '')
  return value === 'governance' || value === 'organization' ? value : 'build'
})
const page = computed(() => {
  const resource = String(route.params.resource ?? '')
  const matched = RESOURCE_PAGES[resource]
  return matched?.module === moduleKey.value ? matched : RESOURCE_PAGES[getDefaultResource(moduleKey.value)]!
})
const rows = ref<ResourceRow[]>([])
const filteredRows = computed(() => {
  const query = search.value.trim().toLowerCase()
  return rows.value.filter((row) => {
    const statusMatch = statusFilter.value === 'all' || row.status === statusFilter.value
    const queryMatch = !query || [row.name, row.id, row.description, row.owner, ...row.values, ...row.tags].join(' ').toLowerCase().includes(query)
    return statusMatch && queryMatch
  })
})
const selectedRow = computed(() => filteredRows.value.find((row) => row.id === selectedId.value) ?? filteredRows.value[0] ?? null)
const allSelected = computed(() => filteredRows.value.length > 0 && filteredRows.value.every((row) => selectedIds.value.has(row.id)))
const moduleTitle = computed(() => PLATFORM_MODULES[moduleKey.value].title)
const statusLabel: Record<string, string> = { nominal: '正常', warning: '需关注', error: '高风险', idle: '未启用' }

const featureSteps = computed(() => {
  if (page.value.mode === 'orchestration') return ['接收制造任务', '分配上下文', '并行调用能力', '人工审批', '汇总结果']
  if (page.value.mode === 'connection') return ['解析请求', '选择路由', '验证凭证', '调用资源', '健康回报']
  if (page.value.mode === 'policy') return ['读取主体', '匹配作用域', '计算优先级', '执行处置', '写入审计']
  if (page.value.mode === 'observe') return ['入口 Agent', '模型推理', 'Skill 调用', 'MCP 访问', '结果返回']
  if (page.value.mode === 'directory') return ['集团', '制造中心', '业务部门', '责任群组', '人员']
  return ['主体身份', '角色继承', '属性规则', '职责分离', '最终决策']
})

watch(page, (next) => {
  rows.value = next.rows.map((row) => ({ ...row, values: [...row.values], tags: [...row.tags] }))
  selectedId.value = next.rows[0]?.id ?? ''
  selectedIds.value = new Set()
  inspectorTab.value = 'overview'
  search.value = ''
  statusFilter.value = 'all'
  featureResult.value = ''
}, { immediate: true })

watch([moduleKey, () => route.params.resource], () => {
  const resource = String(route.params.resource ?? '')
  if (RESOURCE_PAGES[resource]?.module === moduleKey.value) return
  void router.replace(`/platform/${moduleKey.value}/${getDefaultResource(moduleKey.value)}`)
}, { immediate: true })

function showToast(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2600)
}

function toggleRow(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleAll() {
  selectedIds.value = allSelected.value ? new Set() : new Set(filteredRows.value.map((row) => row.id))
}

function openDrawer() {
  draftName.value = ''
  draftOwner.value = selectedRow.value?.owner ?? 'AI 平台组'
  draftScope.value = '当前工作区'
  draftEnabled.value = true
  drawerOpen.value = true
}

function saveDraft() {
  if (!draftName.value.trim()) return
  const id = `DRAFT-${String(rows.value.length + 1).padStart(3, '0')}`
  rows.value.unshift({
    id,
    name: draftName.value.trim(),
    status: 'idle',
    values: page.value.columns.map((_, index) => index === 0 ? draftScope.value : '待配置'),
    description: `由 ${draftOwner.value} 创建的本地配置草稿，尚未提交后端。`,
    tags: ['LOCAL DRAFT', draftEnabled.value ? 'ENABLED' : 'DISABLED'],
    owner: draftOwner.value,
  })
  selectedId.value = id
  drawerOpen.value = false
  showToast(`${page.value.title} 草稿已创建`)
}

function runFeature() {
  if (featureRunning.value) return
  featureRunning.value = true
  featureResult.value = ''
  featureTimer = setTimeout(() => {
    featureRunning.value = false
    featureResult.value = page.value.mode === 'access'
      ? 'ALLOW WITH CONDITIONS · 需要 MFA，授权将在 30 天后自动回收'
      : page.value.mode === 'policy'
        ? 'MATCHED · Priority 10 · BLOCK + APPROVE · 已写入模拟审计'
        : page.value.mode === 'observe'
          ? 'TRACE COMPLETE · 5 SPANS · P95 2.38 s · 0 ERROR'
          : 'CHECK PASSED · 配置拓扑完整 · 未发现高风险依赖'
  }, 900)
}

function updateSelectedStatus(status: ResourceRow['status']) {
  const row = selectedRow.value
  if (!row) return
  row.status = status
  showToast(`${row.name} 状态已在本地更新`)
}

onBeforeUnmount(() => {
  if (featureTimer) clearTimeout(featureTimer)
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <BuildResourceManager v-if="moduleKey === 'build'" :page="page" />
  <main v-else class="resource-page">
    <header class="resource-header">
      <div class="resource-heading">
        <div class="breadcrumb mono">{{ moduleTitle }} / {{ page.group }}</div>
        <div class="title-line">
          <i :class="`icon icon-${page.icon}`"></i>
          <h1>{{ page.title }}</h1>
          <span class="draft-mark mono">CONFIG PREVIEW</span>
        </div>
        <p>{{ page.description }}</p>
      </div>
      <button class="primary-action" @click="openDrawer">
        <i class="icon icon-plus"></i>{{ page.action }}
      </button>
    </header>

    <section class="stats-strip" aria-label="资源统计">
      <div v-for="stat in page.stats" :key="stat[1]" class="stat-item">
        <strong class="mono">{{ stat[0] }}</strong>
        <span>{{ stat[1] }}</span>
      </div>
    </section>

    <div class="resource-toolbar">
      <div class="toolbar-search">
        <i class="icon icon-search"></i>
        <input v-model="search" :placeholder="`搜索 ${page.title}…`" />
      </div>
      <div class="seg-control" aria-label="状态筛选">
        <button v-for="option in [{ key: 'all', label: '全部' }, { key: 'nominal', label: '正常' }, { key: 'warning', label: '关注' }]" :key="option.key" :class="{ active: statusFilter === option.key }" @click="statusFilter = option.key">
          {{ option.label }}
        </button>
      </div>
      <span v-if="selectedIds.size" class="selection-summary mono">已选 {{ selectedIds.size }}</span>
      <button class="icon-action" title="刷新列表" @click="showToast('资源目录已刷新')"><i class="icon icon-refresh-cw"></i></button>
      <button class="icon-action" title="导出当前视图" @click="showToast('已创建当前视图导出任务')"><i class="icon icon-download"></i></button>
    </div>

    <div class="workbench-grid">
      <section class="resource-table-wrap">
        <div class="table-scroll">
          <div class="resource-table" :style="{ '--col-count': page.columns.length }">
            <div class="table-head table-grid">
              <button class="check-button" :title="allSelected ? '取消全选' : '全选'" @click="toggleAll"><i :class="`icon icon-${allSelected ? 'square-check-big' : 'square'}`"></i></button>
              <span>{{ page.title }}</span>
              <span v-for="column in page.columns" :key="column">{{ column }}</span>
              <span>操作</span>
            </div>
            <div
              v-for="row in filteredRows"
              :key="row.id"
              class="table-row table-grid"
              :class="{ selected: selectedRow?.id === row.id }"
              role="button"
              tabindex="0"
              @click="selectedId = row.id"
              @keydown.enter.self="selectedId = row.id"
              @keydown.space.self.prevent="selectedId = row.id"
            >
              <button class="check-button" :aria-label="selectedIds.has(row.id) ? `取消选择 ${row.name}` : `选择 ${row.name}`" :aria-pressed="selectedIds.has(row.id)" @click.stop="toggleRow(row.id)"><i :class="`icon icon-${selectedIds.has(row.id) ? 'square-check-big' : 'square'}`"></i></button>
              <span class="resource-name-cell">
                <span class="resource-name"><span class="dot" :class="row.status"></span>{{ row.name }}</span>
                <span class="resource-id mono">{{ row.id }}</span>
              </span>
              <span v-for="(value, index) in row.values" :key="index" class="cell-value mono">{{ value }}</span>
              <span class="row-actions">
                <button title="复制配置" @click.stop="showToast(`${row.name} 已复制为草稿`)"><i class="icon icon-copy"></i></button>
                <button title="更多操作" @click.stop="showToast(`已打开 ${row.name} 操作菜单`)"><i class="icon icon-ellipsis"></i></button>
              </span>
            </div>
            <div v-if="!filteredRows.length" class="table-empty">
              <svg viewBox="0 0 20 22"><path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" /></svg>
              <span>没有匹配当前条件的资源</span>
              <button @click="search = ''; statusFilter = 'all'">清除筛选</button>
            </div>
          </div>
        </div>
      </section>

      <aside class="inspector">
        <template v-if="selectedRow">
          <header class="inspector-head">
            <div>
              <span class="inspector-kicker mono">{{ selectedRow.id }}</span>
              <h2>{{ selectedRow.name }}</h2>
            </div>
            <span class="status-badge" :class="selectedRow.status"><span class="dot" :class="selectedRow.status"></span>{{ statusLabel[selectedRow.status] }}</span>
          </header>
          <div class="inspector-tabs">
            <button v-for="tab in [{ key: 'overview', label: '概览' }, { key: 'config', label: '配置' }, { key: 'history', label: '变更' }]" :key="tab.key" :class="{ active: inspectorTab === tab.key }" @click="inspectorTab = tab.key as typeof inspectorTab">{{ tab.label }}</button>
          </div>
          <div class="inspector-body">
            <template v-if="inspectorTab === 'overview'">
              <p class="inspector-description">{{ selectedRow.description }}</p>
              <div class="meta-list">
                <div><span>负责人</span><strong>{{ selectedRow.owner }}</strong></div>
                <div v-for="(column, index) in page.columns" :key="column"><span>{{ column }}</span><strong class="mono">{{ selectedRow.values[index] }}</strong></div>
              </div>
              <div class="tag-list"><span v-for="tag in selectedRow.tags" :key="tag" class="mono">{{ tag }}</span></div>
            </template>
            <template v-else-if="inspectorTab === 'config'">
              <label class="field-label">运行状态</label>
              <div class="seg-control wide">
                <button :class="{ active: selectedRow.status === 'nominal' }" @click="updateSelectedStatus('nominal')">启用</button>
                <button :class="{ active: selectedRow.status === 'idle' }" @click="updateSelectedStatus('idle')">停用</button>
                <button :class="{ active: selectedRow.status === 'warning' }" @click="updateSelectedStatus('warning')">审查</button>
              </div>
              <label class="field-label">治理作用域</label>
              <select class="field-control mono"><option>当前工作区</option><option>组织全局</option><option>指定部门</option></select>
              <label class="field-label">变更说明</label>
              <textarea class="field-control" rows="4" placeholder="记录本次配置调整的业务原因"></textarea>
              <button class="secondary-action" @click="showToast('配置草稿已保存')"><i class="icon icon-save"></i>保存草稿</button>
            </template>
            <template v-else>
              <div class="history-item"><span class="dot nominal"></span><div><strong>配置已同步</strong><p class="mono">今天 14:31 · system</p></div></div>
              <div class="history-item"><span class="dot warning"></span><div><strong>治理策略已更新</strong><p class="mono">昨天 18:42 · {{ selectedRow.owner }}</p></div></div>
              <div class="history-item"><span class="dot idle"></span><div><strong>资源已创建</strong><p class="mono">2026-07-18 09:16 · platform</p></div></div>
            </template>
          </div>
        </template>
      </aside>
    </div>

    <section class="feature-panel">
      <header>
        <div><span class="feature-kicker mono">INTERACTIVE WORKBENCH</span><h2>{{ page.featureTitle }}</h2><p>{{ page.featureHint }}</p></div>
        <button class="secondary-action" :disabled="featureRunning" @click="runFeature"><i :class="[`icon icon-${featureRunning ? 'loader-circle' : 'play'}`, { spinning: featureRunning }]"></i>{{ featureRunning ? '运行中' : '运行检查' }}</button>
      </header>
      <div class="feature-flow">
        <template v-for="(step, index) in featureSteps" :key="step">
          <button class="flow-node" :class="{ warning: index === 3 && selectedRow?.status === 'warning' }" @click="showToast(`${step} 节点已选中`)"><span class="mono">0{{ index + 1 }}</span><strong>{{ step }}</strong><small>{{ index === 0 ? 'INPUT' : index === featureSteps.length - 1 ? 'OUTPUT' : 'PASS' }}</small></button>
          <i v-if="index < featureSteps.length - 1" class="icon icon-arrow-right flow-arrow"></i>
        </template>
      </div>
      <div v-if="featureResult || featureRunning" class="cli-result mono"><span>┌─ [ {{ featureRunning ? 'RUNNING' : 'RESULT' }} ] ─────────────────────────────────────────</span><br />│ {{ featureRunning ? '正在验证配置、策略与依赖关系…' : featureResult }}<br />└────────────────────────────────────────────────────</div>
      <div v-if="page.key === 'requests' && selectedRow?.status !== 'nominal'" class="approval-row">
        <button class="secondary-action" @click="showToast('申请已拒绝并写入审批记录')"><i class="icon icon-x"></i>拒绝</button>
        <button class="primary-action" @click="updateSelectedStatus('nominal')"><i class="icon icon-check"></i>批准并设置到期回收</button>
      </div>
    </section>

    <Transition name="toast"><div v-if="toast" class="toast mono" role="status"><span class="dot nominal"></span>{{ toast }}</div></Transition>

    <div v-if="drawerOpen" class="drawer-backdrop" @click.self="drawerOpen = false">
      <aside class="draft-drawer" role="dialog" aria-modal="true" :aria-label="page.action">
        <header><div><span class="mono">LOCAL CONFIG DRAFT</span><h2>{{ page.action }}</h2></div><button title="关闭" @click="drawerOpen = false"><i class="icon icon-x"></i></button></header>
        <div class="drawer-body">
          <div class="drawer-note"><i class="icon icon-info"></i><span>当前后端尚未提供此资源的持久化接口，提交后仅创建前端配置草稿。</span></div>
          <label class="field-label">名称</label>
          <input v-model="draftName" class="field-control" :placeholder="`输入${page.title}名称`" autofocus @keydown.enter="saveDraft" />
          <label class="field-label">负责人</label>
          <select v-model="draftOwner" class="field-control"><option>AI 平台组</option><option>设备工程部</option><option>质量工程部</option><option>安全治理组</option></select>
          <label class="field-label">作用域</label>
          <select v-model="draftScope" class="field-control"><option>当前工作区</option><option>组织全局</option><option>开发沙箱</option></select>
          <label class="toggle-row"><span><strong>创建后启用</strong><small>草稿通过审核后才会进入生产配置。</small></span><input v-model="draftEnabled" type="checkbox" /><i></i></label>
        </div>
        <footer><button class="secondary-action" @click="drawerOpen = false">取消</button><button class="primary-action" :disabled="!draftName.trim()" @click="saveDraft"><i class="icon icon-save"></i>保存草稿</button></footer>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.resource-page { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; background: var(--bg-deep); padding: 22px 24px 48px; }
.resource-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; max-width: 1500px; margin: 0 auto 18px; }
.breadcrumb { color: var(--text-dim); font-size: 9px; letter-spacing: .08em; text-transform: uppercase; }
.title-line { margin-top: 5px; display: flex; align-items: center; gap: 9px; }
.title-line > i { color: var(--accent-agent); font-size: 18px; }
.title-line h1 { font-family: var(--font-ui); font-size: 20px; line-height: 1.25; font-weight: 650; letter-spacing: 0; }
.draft-mark { padding: 2px 6px; border: 1px solid rgba(45, 212, 191, .28); border-radius: var(--radius-sm); color: var(--accent-agent); font-size: 8px; letter-spacing: .08em; }
.resource-heading p { margin-top: 6px; max-width: 760px; color: var(--text-muted); font-size: 12px; }
.primary-action,.secondary-action { min-height: 32px; border-radius: var(--radius-control); padding: 0 12px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-family: var(--font-ui); font-size: 10px; font-weight: 650; letter-spacing: .06em; cursor: pointer; transition: all var(--dur-fast) var(--ease-out); }
.primary-action { border: 1px solid rgba(45, 212, 191, .3); background: var(--accent-agent-dim); color: var(--accent-agent); }
.primary-action:hover { background: rgba(45, 212, 191, .18); box-shadow: 0 0 20px var(--accent-agent-glow); }
.primary-action:active,.secondary-action:active { transform: scale(.97); }
.primary-action:disabled,.secondary-action:disabled { opacity: .35; pointer-events: none; }
.secondary-action { border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text-secondary); }
.secondary-action:hover { border-color: var(--border-strong); color: var(--text-primary); }
.stats-strip { max-width: 1500px; margin: 0 auto 12px; min-height: 64px; display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-panel); }
.stat-item { padding: 11px 16px; display: flex; flex-direction: column; justify-content: center; gap: 1px; }
.stat-item + .stat-item { border-left: 1px solid var(--border-subtle); }
.stat-item strong { color: var(--text-primary); font-size: 17px; font-weight: 600; }
.stat-item span { color: var(--text-dim); font-family: var(--font-ui); font-size: 9px; letter-spacing: .08em; text-transform: uppercase; }
.resource-toolbar { max-width: 1500px; margin: 0 auto 8px; display: flex; align-items: center; gap: 8px; }
.toolbar-search { position: relative; width: min(340px, 35vw); display: flex; align-items: center; }
.toolbar-search i { position: absolute; left: 10px; color: var(--text-dim); font-size: 13px; }
.toolbar-search input,.field-control { width: 100%; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--bg-elevated); color: var(--text-primary); font-family: var(--font-body); font-size: 11px; }
.toolbar-search input { height: 32px; padding: 0 10px 0 30px; }
.toolbar-search input:focus,.field-control:focus { outline: none; border-color: var(--accent-agent); box-shadow: 0 0 0 2px var(--accent-agent-dim); }
.seg-control { padding: 2px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--bg-elevated); display: flex; gap: 2px; }
.seg-control button { min-height: 26px; padding: 0 9px; border: 0; border-radius: 3px; background: transparent; color: var(--text-muted); font-family: var(--font-data); font-size: 9px; cursor: pointer; }
.seg-control button.active { background: var(--bg-surface); color: var(--accent-agent); }
.seg-control.wide button { flex: 1; }
.seg-control.wide { width: 100%; }
.selection-summary { margin-left: auto; color: var(--accent-agent); font-size: 9px; }
.icon-action { width: 32px; height: 32px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--bg-elevated); color: var(--text-muted); cursor: pointer; }
.icon-action:hover { color: var(--accent-agent); border-color: rgba(45, 212, 191, .35); }
.workbench-grid { max-width: 1500px; min-height: 390px; margin: 0 auto; display: grid; grid-template-columns: minmax(620px, 1fr) 290px; border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; background: var(--bg-panel); }
.resource-table-wrap { min-width: 0; border-right: 1px solid var(--border); overflow: hidden; }
.table-scroll { width: 100%; overflow-x: auto; }
.resource-table { min-width: 780px; }
.table-grid { display: grid; grid-template-columns: 32px minmax(190px, 1.5fr) repeat(var(--col-count), minmax(100px, 1fr)) 64px; align-items: center; }
.table-head { height: 36px; padding: 0 8px; position: sticky; top: 0; z-index: 1; border-bottom: 1px solid var(--border); background: var(--bg-elevated); color: var(--text-dim); font-family: var(--font-data); font-size: 8px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.table-row { width: 100%; min-height: 64px; padding: 7px 8px; border: 0; border-bottom: 1px solid var(--border-subtle); background: var(--bg-panel); color: var(--text-primary); text-align: left; cursor: pointer; transition: background var(--dur-fast); }
.table-row:hover { background: var(--bg-surface); }
.table-row.selected { background: var(--accent-agent-dim); box-shadow: inset 2px 0 var(--accent-agent); }
.check-button { width: 24px; height: 24px; border: 0; background: transparent; color: var(--text-dim); display: grid; place-items: center; cursor: pointer; }
.check-button i { font-size: 13px; }
.resource-name-cell { min-width: 0; display: flex; flex-direction: column; gap: 2px; padding-right: 12px; }
.resource-name { display: flex; align-items: center; gap: 7px; min-width: 0; font-family: var(--font-ui); font-size: 11px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.resource-id,.cell-value { color: var(--text-muted); font-size: 9px; }
.cell-value { padding-right: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-actions { display: flex; gap: 2px; justify-content: flex-end; }
.row-actions button { width: 26px; height: 26px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-dim); cursor: pointer; }
.row-actions button:hover { background: var(--bg-hover); color: var(--text-primary); }
.table-empty { height: 260px; color: var(--text-dim); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; font-size: 11px; }
.table-empty svg { width: 40px; color: var(--accent-agent); opacity: .2; animation: glow-breathe 3s infinite; }
.table-empty button { border: 0; background: transparent; color: var(--accent-agent); font-size: 10px; cursor: pointer; }
.inspector { min-width: 0; background: var(--bg-surface); }
.inspector-head { min-height: 70px; padding: 13px 14px; display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; border-bottom: 1px solid var(--border); }
.inspector-kicker { color: var(--text-dim); font-size: 8px; }
.inspector-head h2 { margin-top: 3px; font-family: var(--font-ui); font-size: 13px; font-weight: 650; }
.status-badge { padding: 3px 6px; border: 1px solid var(--border); border-radius: var(--radius-pill); color: var(--text-muted); display: flex; align-items: center; gap: 5px; font-size: 8px; white-space: nowrap; }
.status-badge.warning { color: var(--status-warning); }.status-badge.error { color: var(--status-error); }.status-badge.nominal { color: var(--status-success); }
.inspector-tabs { height: 34px; padding: 0 10px; border-bottom: 1px solid var(--border); display: flex; }
.inspector-tabs button { flex: 1; border: 0; border-bottom: 1px solid transparent; background: transparent; color: var(--text-dim); font-size: 9px; cursor: pointer; }
.inspector-tabs button.active { color: var(--accent-agent); border-color: var(--accent-agent); }
.inspector-body { padding: 14px; }
.inspector-description { color: var(--text-secondary); font-size: 11px; line-height: 1.65; }
.meta-list { margin-top: 14px; border-top: 1px solid var(--border); }
.meta-list > div { min-height: 34px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.meta-list span { color: var(--text-dim); font-size: 9px; }.meta-list strong { color: var(--text-secondary); font-size: 9px; font-weight: 500; text-align: right; }
.tag-list { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 5px; }.tag-list span { padding: 2px 5px; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-muted); font-size: 8px; }
.field-label { margin: 12px 0 5px; display: block; color: var(--text-dim); font-family: var(--font-ui); font-size: 9px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
.field-control { min-height: 34px; padding: 7px 9px; resize: vertical; }
.inspector-body .secondary-action { width: 100%; margin-top: 12px; }
.history-item { padding: 9px 0; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 9px; align-items: flex-start; }.history-item .dot { margin-top: 5px; }.history-item strong { color: var(--text-secondary); font-size: 10px; }.history-item p { margin-top: 3px; color: var(--text-dim); font-size: 8px; }
.feature-panel { max-width: 1500px; margin: 12px auto 0; padding: 15px 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-panel); }
.feature-panel > header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }.feature-kicker { color: var(--accent-agent); font-size: 8px; letter-spacing: .1em; }.feature-panel h2 { margin-top: 2px; font-family: var(--font-ui); font-size: 13px; font-weight: 650; }.feature-panel header p { margin-top: 3px; color: var(--text-dim); font-size: 10px; }
.feature-flow { margin-top: 14px; display: flex; align-items: center; gap: 7px; overflow-x: auto; padding-bottom: 4px; }
.flow-node { min-width: 125px; min-height: 62px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--bg-elevated); color: var(--text-primary); display: grid; grid-template-columns: auto 1fr; gap: 2px 7px; text-align: left; cursor: pointer; }.flow-node:hover { border-color: rgba(45, 212, 191, .35); background: var(--bg-hover); }.flow-node > span { grid-row: 1 / 3; color: var(--accent-agent); font-size: 9px; }.flow-node strong { font-size: 10px; }.flow-node small { color: var(--text-dim); font-family: var(--font-data); font-size: 7px; }.flow-node.warning { border-color: rgba(251, 191, 36, .45); }.flow-arrow { flex: 0 0 auto; color: var(--text-dim); font-size: 12px; }
.cli-result { margin-top: 12px; padding: 9px 11px; border-radius: var(--radius-sm); background: var(--bg-deep); color: var(--text-secondary); font-size: 9px; line-height: 1.65; }.cli-result > span { color: var(--accent-agent); }
.approval-row { margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px; }
.toast { position: fixed; right: 20px; bottom: 20px; z-index: 40; min-height: 38px; padding: 0 12px; border: 1px solid var(--border-visible); border-radius: var(--radius-control); background: var(--bg-elevated); color: var(--text-secondary); display: flex; align-items: center; gap: 8px; font-size: 9px; }
.toast-enter-active,.toast-leave-active { transition: opacity var(--dur-med), transform var(--dur-med) var(--ease-out); }.toast-enter-from,.toast-leave-to { opacity: 0; transform: translateY(6px); }
.drawer-backdrop { position: fixed; inset: 48px 0 0; z-index: 30; background: rgba(0, 0, 0, .62); display: flex; justify-content: flex-end; }
.draft-drawer { width: min(420px, 92vw); height: 100%; border-left: 1px solid var(--border-visible); background: var(--bg-surface); display: flex; flex-direction: column; animation: drawer-in var(--dur-med) var(--ease-out); }
.draft-drawer > header { min-height: 68px; padding: 13px 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: flex-start; }.draft-drawer header span { color: var(--accent-agent); font-size: 8px; letter-spacing: .1em; }.draft-drawer header h2 { margin-top: 3px; font-family: var(--font-ui); font-size: 15px; }.draft-drawer header button { width: 30px; height: 30px; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; }
.drawer-body { flex: 1; overflow-y: auto; padding: 16px; }.drawer-note { padding: 9px 10px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--bg-elevated); color: var(--text-muted); display: flex; gap: 8px; font-size: 10px; line-height: 1.5; }.drawer-note i { color: var(--accent-agent); margin-top: 2px; }
.toggle-row { margin-top: 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; }.toggle-row > span { flex: 1; display: flex; flex-direction: column; }.toggle-row strong { color: var(--text-secondary); font-size: 10px; }.toggle-row small { color: var(--text-dim); font-size: 9px; }.toggle-row input { position: absolute; opacity: 0; }.toggle-row i { width: 32px; height: 18px; padding: 2px; border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--bg-elevated); }.toggle-row i::after { content: ''; display: block; width: 12px; height: 12px; border-radius: 50%; background: var(--text-dim); transition: transform var(--dur-fast), background var(--dur-fast); }.toggle-row input:checked + i { border-color: rgba(45, 212, 191, .45); background: var(--accent-agent-dim); }.toggle-row input:checked + i::after { transform: translateX(14px); background: var(--accent-agent); box-shadow: 0 0 6px var(--accent-agent-glow); }
.draft-drawer > footer { min-height: 58px; padding: 10px 16px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }
.spinning { animation: spin .8s linear infinite; }
@keyframes drawer-in { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@media (max-width: 1180px) { .workbench-grid { grid-template-columns: minmax(0, 1fr); }.inspector { display: block; border-top: 1px solid var(--border); }.resource-table-wrap { border-right: 0; } }
@media (max-width: 760px) { .resource-page { padding: 44px 12px 72px; }.resource-header { align-items: stretch; flex-direction: column; gap: 12px; }.resource-header > .primary-action { align-self: flex-start; }.stats-strip { grid-template-columns: repeat(2, 1fr); }.stat-item:nth-child(3) { border-left: 0; border-top: 1px solid var(--border-subtle); }.stat-item:nth-child(4) { border-top: 1px solid var(--border-subtle); }.resource-toolbar { flex-wrap: wrap; }.toolbar-search { width: 100%; }.selection-summary { margin-left: 0; }.workbench-grid { min-height: 340px; grid-template-columns: minmax(0, 1fr); }.feature-panel > header { flex-direction: column; }.drawer-backdrop { inset: 48px 0 50px; } }
</style>
