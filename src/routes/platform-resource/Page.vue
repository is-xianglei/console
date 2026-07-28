<script setup lang="ts">
import { computed, h, onBeforeUnmount, reactive, ref, resolveComponent, useCssModule, watch } from 'vue'
import type { FormError, TableColumn, TableRow } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import { useRoute, useRouter } from 'vue-router'
import AgentResource from './components/agent-resource/index.vue'
import BuildResourceManager from './components/build-resource-manager/index.vue'
import {
  PLATFORM_MODULES,
  RESOURCE_PAGES,
  getDefaultResource,
} from '@/constants/platform-catalog'
import type { PlatformModuleKey, ResourceRow } from '@/interfaces/platform/model'

defineOptions({ name: 'PlatformResourcePage' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const search = ref('')
const statusFilter = ref('all')
const inspectorTab = ref<'overview' | 'config' | 'history'>('overview')
const selectedId = ref('')
const selectedIds = ref<Set<string>>(new Set())
const drawerOpen = ref(false)
const featureRunning = ref(false)
const featureResult = ref('')
const governanceScope = ref('当前工作区')
const changeNote = ref('')
const draft = reactive({
  name: '',
  owner: 'AI 平台组',
  scope: '当前工作区',
  enabled: true,
})
let featureTimer: ReturnType<typeof setTimeout> | undefined

const statusFilterItems = [
  { value: 'all', label: '全部' },
  { value: 'nominal', label: '正常' },
  { value: 'warning', label: '关注' },
]
const inspectorItems = [
  { value: 'overview', label: '概览' },
  { value: 'config', label: '配置' },
  { value: 'history', label: '变更' },
]
const statusOptions = [
  { value: 'nominal', label: '启用' },
  { value: 'idle', label: '停用' },
  { value: 'warning', label: '审查' },
]
const ownerOptions = ['AI 平台组', '设备工程部', '质量工程部', '安全治理组'].map((value) => ({ value, label: value }))
const scopeOptions = ['当前工作区', '组织全局', '开发沙箱'].map((value) => ({ value, label: value }))
const governanceScopeOptions = ['当前工作区', '组织全局', '指定部门'].map((value) => ({ value, label: value }))

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
const moduleTitle = computed(() => PLATFORM_MODULES[moduleKey.value].title)
const statusLabel: Record<ResourceRow['status'], string> = { nominal: '正常', warning: '需关注', error: '高风险', idle: '未启用' }
const statusColor: Record<ResourceRow['status'], 'success' | 'warning' | 'error' | 'neutral'> = {
  nominal: 'success',
  warning: 'warning',
  error: 'error',
  idle: 'neutral',
}

const UCheckbox = resolveComponent('UCheckbox')

const columns = computed<TableColumn<ResourceRow>[]>(() => [
  {
    id: 'select',
    header: ({ table }) => h(UCheckbox, {
      modelValue: table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected(),
      'onUpdate:modelValue': (value: boolean | 'indeterminate') => table.toggleAllPageRowsSelected(Boolean(value)),
      'aria-label': '选择全部资源',
      onClick: (event: MouseEvent) => event.stopPropagation(),
    }),
    cell: ({ row }) => h(UCheckbox, {
      modelValue: row.getIsSelected(),
      'onUpdate:modelValue': (value: boolean | 'indeterminate') => row.toggleSelected(Boolean(value)),
      'aria-label': `选择 ${row.original.name}`,
      onClick: (event: MouseEvent) => event.stopPropagation(),
    }),
    enableSorting: false,
    meta: { class: { th: styles['resource-select-cell'], td: styles['resource-select-cell'] } },
  },
  { accessorKey: 'name', header: page.value.title, meta: { class: { th: styles['resource-name-cell'], td: styles['resource-name-cell'] } } },
  ...page.value.columns.map((header, index) => ({
    id: `value-${index}`,
    accessorFn: (row: ResourceRow) => row.values[index],
    header,
    meta: { class: { td: styles['resource-value-cell'] } },
  })),
  { id: 'actions', header: '操作', meta: { class: { th: styles['resource-actions-cell'], td: styles['resource-actions-cell'] } } },
])

const rowSelection = computed({
  get: () => Object.fromEntries([...selectedIds.value].map((id) => [id, true])),
  set: (selection: Record<string, boolean>) => {
    selectedIds.value = new Set(Object.entries(selection).filter(([, selected]) => selected).map(([id]) => id))
  },
})
const tableMeta = computed(() => ({
  class: { tr: (row: TableRow<ResourceRow>) => row.original.id === selectedRow.value?.id ? styles.selected : '' },
}))

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
  governanceScope.value = '当前工作区'
  changeNote.value = ''
  featureResult.value = ''
}, { immediate: true })

watch([moduleKey, () => route.params.resource], () => {
  const resource = String(route.params.resource ?? '')
  if (RESOURCE_PAGES[resource]?.module === moduleKey.value) return
  void router.replace(`/platform/${moduleKey.value}/${getDefaultResource(moduleKey.value)}`)
}, { immediate: true })

function handleFeedback(content: string) {
  toast.add({ title: content, color: 'success', icon: 'i-lucide-circle-check', duration: 2600 })
}

function onFeedback(content: string) {
  handleFeedback(content)
}

function onOpenDrawer() {
  draft.name = ''
  draft.owner = selectedRow.value?.owner ?? 'AI 平台组'
  draft.scope = '当前工作区'
  draft.enabled = true
  drawerOpen.value = true
}

function onSaveDraft() {
  if (!draft.name.trim()) return
  const id = `DRAFT-${String(rows.value.length + 1).padStart(3, '0')}`
  rows.value.unshift({
    id,
    name: draft.name.trim(),
    status: 'idle',
    values: page.value.columns.map((_, index) => index === 0 ? draft.scope : '待配置'),
    description: `由 ${draft.owner} 创建的本地配置草稿，尚未提交后端。`,
    tags: ['LOCAL DRAFT', draft.enabled ? 'ENABLED' : 'DISABLED'],
    owner: draft.owner,
  })
  selectedId.value = id
  drawerOpen.value = false
  handleFeedback(`${page.value.title} 草稿已创建`)
}

function onRunFeature() {
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

function handleSelectedStatusUpdate(status: ResourceRow['status']) {
  const row = selectedRow.value
  if (!row) return
  row.status = status
  handleFeedback(`${row.name} 状态已在本地更新`)
}

function onSelectedStatusUpdate(status: ResourceRow['status']) {
  handleSelectedStatusUpdate(status)
}

function onStatusChange(value: string | number) {
  handleSelectedStatusUpdate(value as ResourceRow['status'])
}

function getStatusLabel(status: string) {
  return statusLabel[status as ResourceRow['status']]
}

function onClearFilters() {
  search.value = ''
  statusFilter.value = 'all'
}

function onTableSelect(_event: Event, row: TableRow<ResourceRow>) {
  selectedId.value = row.original.id
}

function onSaveInspectorDraft() {
  if (!selectedRow.value) return
  handleFeedback(`${selectedRow.value.name} 配置草稿已保存`)
}

function validateDraft(state: Partial<typeof draft>): FormError[] {
  return state.name?.trim() ? [] : [{ name: 'name', message: `请输入${page.value.title}名称` }]
}

onBeforeUnmount(() => {
  if (featureTimer) clearTimeout(featureTimer)
})
</script>

<template>
  <AgentResource v-if="moduleKey === 'build' && page.key === 'agents'" />
  <BuildResourceManager v-else-if="moduleKey === 'build'" :page="page" />
  <main v-else :class="$style['resource-page']">
    <header :class="$style['resource-header']">
      <div :class="$style['resource-heading']">
        <div :class="[$style['breadcrumb'], 'mono']">{{ moduleTitle }} / {{ page.group }}</div>
        <div :class="$style['title-line']">
          <UIcon :name="`i-lucide-${page.icon}`" />
          <h1>{{ page.title }}</h1>
          <UBadge label="CONFIG PREVIEW" color="primary" variant="subtle" size="xs" :class="$style['draft-mark']" />
        </div>
        <p>{{ page.description }}</p>
      </div>
      <UButton :label="page.action" icon="i-lucide-plus" :class="$style['primary-action']" @click="onOpenDrawer" />
    </header>

    <section :class="$style['stats-strip']" aria-label="资源统计">
      <div v-for="stat in page.stats" :key="stat[1]" :class="$style['stat-item']">
        <strong class="mono">{{ stat[0] }}</strong>
        <span>{{ stat[1] }}</span>
      </div>
    </section>

    <div :class="$style['resource-toolbar']">
      <UInput v-model="search" icon="i-lucide-search" :class="$style['toolbar-search']" :placeholder="`搜索 ${page.title}…`">
        <template v-if="search" #trailing><UButton icon="i-lucide-x" color="neutral" variant="ghost" square size="xs" aria-label="清空搜索" @click="search = ''" /></template>
      </UInput>
      <UTabs v-model="statusFilter" :items="statusFilterItems" :content="false" size="sm" aria-label="状态筛选" />
      <span v-if="selectedIds.size" :class="[$style['selection-summary'], 'mono']">已选 {{ selectedIds.size }}</span>
      <UTooltip text="刷新列表"><UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" square :class="$style['icon-action']" aria-label="刷新列表" @click="onFeedback('资源目录已刷新')" /></UTooltip>
      <UTooltip text="导出当前视图"><UButton icon="i-lucide-download" color="neutral" variant="outline" square :class="$style['icon-action']" aria-label="导出当前视图" @click="onFeedback('已创建当前视图导出任务')" /></UTooltip>
    </div>

    <div :class="$style['workbench-grid']">
      <section :class="$style['resource-table-wrap']">
        <UTable
          v-model:row-selection="rowSelection"
          :class="$style['resource-table']"
          :data="filteredRows"
          :columns="columns"
          :meta="tableMeta"
          :get-row-id="(row: ResourceRow) => row.id"
          :ui="{ empty: 'p-0' }"
          sticky="header"
          @select="onTableSelect"
        >
          <template #name-cell="{ row }">
            <UButton color="neutral" variant="ghost" :class="$style['resource-name-button']" @click.stop="selectedId = row.original.id">
              <span :class="$style['resource-name']"><span class="dot" :class="row.original.status" :aria-label="getStatusLabel(row.original.status)"></span>{{ row.original.name }}</span>
              <span :class="[$style['resource-id'], 'mono']">{{ row.original.id }}</span>
            </UButton>
          </template>

          <template #actions-cell="{ row }">
            <div :class="$style['row-actions']">
              <UTooltip text="复制配置"><UButton icon="i-lucide-copy" color="neutral" variant="ghost" square :aria-label="`复制 ${row.original.name}`" @click.stop="onFeedback(`${row.original.name} 已复制为草稿`)" /></UTooltip>
              <UTooltip text="更多操作"><UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="`${row.original.name} 更多操作`" @click.stop="onFeedback(`已打开 ${row.original.name} 操作菜单`)" /></UTooltip>
            </div>
          </template>

          <template #empty><UEmpty icon="i-lucide-search-x" title="没有匹配当前条件的资源" variant="naked" :class="$style['table-empty']"><template #actions><UButton label="清除筛选" variant="link" @click="onClearFilters" /></template></UEmpty></template>
        </UTable>
      </section>

      <aside :class="$style['inspector']">
        <template v-if="selectedRow">
          <header :class="$style['inspector-head']">
            <div>
              <span :class="[$style['inspector-kicker'], 'mono']">{{ selectedRow.id }}</span>
              <h2>{{ selectedRow.name }}</h2>
            </div>
            <UBadge :color="statusColor[selectedRow.status]" variant="subtle" size="xs"><span class="dot" :class="selectedRow.status"></span>{{ statusLabel[selectedRow.status] }}</UBadge>
          </header>
          <UTabs v-model="inspectorTab" :items="inspectorItems" :content="false" variant="link" size="sm" :class="$style['inspector-tabs']" />
          <div :class="$style['inspector-body']">
            <template v-if="inspectorTab === 'overview'">
              <p :class="$style['inspector-description']">{{ selectedRow.description }}</p>
              <div :class="$style['meta-list']">
                <div><span>负责人</span><strong>{{ selectedRow.owner }}</strong></div>
                <div v-for="(column, index) in page.columns" :key="column"><span>{{ column }}</span><strong class="mono">{{ selectedRow.values[index] }}</strong></div>
              </div>
              <div :class="$style['tag-list']"><UBadge v-for="tag in selectedRow.tags" :key="tag" :label="tag" color="neutral" variant="outline" size="xs" class="mono" /></div>
            </template>
            <UForm v-else-if="inspectorTab === 'config'" :state="{ governanceScope, changeNote }" :class="$style['inspector-form']" @submit="onSaveInspectorDraft">
              <UFormField label="运行状态"><UTabs :model-value="selectedRow.status" :items="statusOptions" :content="false" size="xs" @update:model-value="onStatusChange" /></UFormField>
              <UFormField label="治理作用域"><USelect v-model="governanceScope" :items="governanceScopeOptions" /></UFormField>
              <UFormField label="变更说明"><UTextarea v-model="changeNote" :rows="4" autoresize :maxrows="7" placeholder="记录本次配置调整的业务原因" /></UFormField>
              <UButton type="submit" label="保存草稿" icon="i-lucide-save" color="neutral" variant="outline" block :class="$style['secondary-action']" />
            </UForm>
            <template v-else>
              <div :class="$style['history-item']"><span class="dot nominal" aria-label="正常"></span><div><strong>配置已同步</strong><p class="mono">今天 14:31 · system</p></div></div>
              <div :class="$style['history-item']"><span class="dot warning" aria-label="需关注"></span><div><strong>治理策略已更新</strong><p class="mono">昨天 18:42 · {{ selectedRow.owner }}</p></div></div>
              <div :class="$style['history-item']"><span class="dot idle" aria-label="未启用"></span><div><strong>资源已创建</strong><p class="mono">2026-07-18 09:16 · platform</p></div></div>
            </template>
          </div>
        </template>
      </aside>
    </div>

    <section :class="$style['feature-panel']">
      <header>
        <div><span :class="[$style['feature-kicker'], 'mono']">INTERACTIVE WORKBENCH</span><h2>{{ page.featureTitle }}</h2><p>{{ page.featureHint }}</p></div>
        <UButton :label="featureRunning ? '运行中' : '运行检查'" :icon="featureRunning ? undefined : 'i-lucide-play'" color="neutral" variant="outline" :class="$style['secondary-action']" :loading="featureRunning" @click="onRunFeature" />
      </header>
      <div :class="$style['feature-flow']">
        <template v-for="(step, index) in featureSteps" :key="step">
          <UButton color="neutral" variant="ghost" :class="[$style['flow-node'], { warning: index === 3 && selectedRow?.status === 'warning' }]" @click="onFeedback(`${step} 节点已选中`)"><span class="mono">0{{ index + 1 }}</span><strong>{{ step }}</strong><small>{{ index === 0 ? 'INPUT' : index === featureSteps.length - 1 ? 'OUTPUT' : 'PASS' }}</small></UButton>
          <UIcon v-if="index < featureSteps.length - 1" name="i-lucide-arrow-right" :class="$style['flow-arrow']" />
        </template>
      </div>
      <div v-if="featureResult || featureRunning" :class="[$style['cli-result'], 'mono']"><span>┌─ [ {{ featureRunning ? 'RUNNING' : 'RESULT' }} ] ─────────────────────────────────────────</span><br />│ {{ featureRunning ? '正在验证配置、策略与依赖关系…' : featureResult }}<br />└────────────────────────────────────────────────────</div>
      <div v-if="page.key === 'requests' && selectedRow?.status !== 'nominal'" :class="$style['approval-row']">
        <UButton label="拒绝" icon="i-lucide-x" color="error" variant="outline" :class="$style['secondary-action']" @click="onFeedback('申请已拒绝并写入审批记录')" />
        <UButton label="批准并设置到期回收" icon="i-lucide-check" :class="$style['primary-action']" @click="onSelectedStatusUpdate('nominal')" />
      </div>
    </section>

    <USlideover v-model:open="drawerOpen" :close="{ color: 'neutral', variant: 'ghost' }" close-icon="i-lucide-x" :ui="{ content: 'resource-slideover', header: 'resource-slideover-header', body: 'resource-slideover-body', footer: 'resource-slideover-footer' }">
      <template #title><div :class="$style['drawer-title']"><span class="mono">LOCAL CONFIG DRAFT</span><h2>{{ page.action }}</h2></div></template>
      <template #body>
        <UForm id="resource-draft-form" :state="draft" :validate="validateDraft" @submit="onSaveDraft">
          <UAlert :class="$style['drawer-note']" color="info" variant="subtle" icon="i-lucide-info" title="当前后端尚未提供此资源的持久化接口，提交后仅创建前端配置草稿。" />
          <UFormField label="名称" name="name" required><UInput v-model="draft.name" autofocus :placeholder="`输入${page.title}名称`" /></UFormField>
          <UFormField label="负责人" name="owner"><USelect v-model="draft.owner" :items="ownerOptions" /></UFormField>
          <UFormField label="作用域" name="scope"><USelect v-model="draft.scope" :items="scopeOptions" /></UFormField>
          <div :class="$style['toggle-row']"><span><strong>创建后启用</strong><small>草稿通过审核后才会进入生产配置。</small></span><USwitch v-model="draft.enabled" aria-label="创建后启用" /></div>
        </UForm>
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" @click="drawerOpen = false" /><UButton label="保存草稿" icon="i-lucide-save" type="submit" form="resource-draft-form" :disabled="!draft.name.trim()" />
      </template>
    </USlideover>
  </main>
</template>

<style module src="./index.module.css"></style>
