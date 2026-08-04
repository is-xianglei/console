<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'
import { computed, useCssModule, watch } from 'vue'
import { useAgentManager } from '@/hooks/useAgentManager'
import type { AgentResponse } from '@/interfaces/agent/api'
import { useAuthStore } from '@/stores/auth'
import AgentBuilder from '../agent-builder/index.vue'
import AgentInspector from '../agent-inspector/index.vue'

defineOptions({ name: 'AgentResource' })

const styles = useCssModule()
const manager = useAgentManager()
const authStore = useAuthStore()
const validationIssues = computed(() => manager.validateAgent(manager.draft.value))
const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
]
const columns: TableColumn<AgentResponse>[] = [
  { id: 'agent', header: 'Agent', meta: { class: { th: styles['ag-col-agent'], td: styles['ag-col-agent'] } } },
  { id: 'state', header: '状态', meta: { class: { th: styles['ag-col-state'], td: styles['ag-col-state'] } } },
  { id: 'model', header: '模型', meta: { class: { th: styles['ag-col-model'], td: styles['ag-col-model'] } } },
  { id: 'capabilities', header: '能力绑定', meta: { class: { th: styles['ag-col-capabilities'], td: styles['ag-col-capabilities'] } } },
  { id: 'workspace', header: '工作区', meta: { class: { th: styles['ag-col-version'], td: styles['ag-col-version'] } } },
  { id: 'updated', header: '更新时间', meta: { class: { th: styles['ag-col-runtime'], td: styles['ag-col-runtime'] } } },
  { id: 'actions', header: '操作', meta: { class: { th: styles['ag-col-actions'], td: styles['ag-col-actions'] } } },
]
const tableMeta = computed(() => ({
  class: { tr: (row: TableRow<AgentResponse>) => manager.selectedId.value === row.original.id ? styles.active : '' },
}))
const deleteTitle = computed(() => manager.pendingDelete.value ? `删除 ${manager.pendingDelete.value.name}？` : '删除 Agent？')

function agentCode(id: number) {
  return `AGT-${String(id).padStart(4, '0')}`
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}

function capabilitySummary(agent: AgentResponse) {
  return `${agent.skill_ids?.length ?? 0} Skills · ${agent.tool_ids?.length ?? 0} Tools`
}

async function onRefresh() {
  await manager.loadAll()
  if (!manager.loadingError.value) manager.showToast('Agents 与能力目录已刷新')
}

function onExportList() {
  const rows = manager.filteredAgents.value.map((agent) => [
    agent.id,
    agent.name,
    agent.is_enabled ? 'enabled' : 'disabled',
    agent.model_name ?? '',
    agent.skill_ids?.length ?? 0,
    agent.tool_ids?.length ?? 0,
    agent.workspace_id,
    agent.updated_at,
  ])
  const data = [['ID', '名称', '状态', '模型', 'Skills', 'Tools', '工作区', '更新时间'], ...rows]
  const csv = data.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'agents.csv'
  link.click()
  URL.revokeObjectURL(url)
  manager.showToast(`已导出 ${rows.length} 个 Agent`)
}

function onSelect(_event: Event, row: TableRow<AgentResponse>) {
  manager.selectedId.value = row.original.id
}

function agentMenuItems(agent: AgentResponse) {
  return [[
    { label: '配置', icon: 'i-lucide-sliders-horizontal', onSelect: () => { void manager.openEdit(agent) } },
    { label: '复制', icon: 'i-lucide-copy', onSelect: () => manager.openDuplicate(agent) },
    { label: '删除', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { manager.pendingDelete.value = agent } },
  ]]
}

watch(
  () => authStore.currentWorkspaceId,
  (workspaceId) => {
    manager.resetView()
    if (workspaceId) void manager.loadAll()
  },
  { immediate: true },
)
</script>

<template>
  <AgentBuilder v-if="manager.builderOpen.value" :agent="manager.draft.value" :mode="manager.builderMode.value" :issues="validationIssues" :skills="manager.skills.value" :tools="manager.tools.value" :saving="manager.saving.value" :error="manager.loadingError.value" @close="manager.builderOpen.value = false" @save="manager.saveDraft" @publish="manager.publish" />
  <main v-else :class="$style['ag-page']">
    <header :class="$style['ag-page-head']">
      <div :class="$style['ag-heading']"><nav aria-label="面包屑"><span>构建资源</span><i class="icon icon-chevron-right"></i><strong>智能体编排</strong></nav><div><span :class="$style['ag-page-icon']"><i class="icon icon-bot"></i></span><span><h1>Agents</h1><p>管理系统提示词、模型名称、启用状态以及当前工作区的 Skill 与 Tool 绑定。</p></span></div></div>
      <div :class="$style['ag-page-actions']"><span :class="[$style['ag-local-badge'], 'mono']"><i class="icon icon-database"></i>API CONNECTED</span><UButton :class="$style['ag-primary-button']" icon="i-lucide-plus" label="创建 Agent" @click="manager.openCreate" /></div>
    </header>

    <section :class="$style['ag-metrics']" aria-label="Agent 统计">
      <div :class="$style.active"><span>全部 Agent</span><strong>{{ manager.stats.value.all }}</strong><small class="mono">WORKSPACE</small></div>
      <div><span>已启用</span><strong>{{ manager.stats.value.enabled }}</strong><small><span class="dot nominal"></span>可用于新会话</small></div>
      <div><span>已停用</span><strong>{{ manager.stats.value.disabled }}</strong><small><span class="dot idle"></span>不可选择</small></div>
      <div><span>未绑定能力</span><strong>{{ manager.stats.value.unbound }}</strong><small><span class="dot warning"></span>无 Skill 与 Tool</small></div>
    </section>

    <section :class="$style['ag-workspace']">
      <div :class="$style['ag-toolbar']">
        <UInput v-model="manager.search.value" :class="$style['ag-search']" icon="i-lucide-search" trailing-icon="i-lucide-x" placeholder="搜索名称、ID、描述或模型" aria-label="搜索 Agents" @click:trailing="manager.search.value = ''" />
        <UTabs v-model="manager.enabledFilter.value" :class="$style['ag-filter-tabs']" :items="enabledOptions" :content="false" size="sm" aria-label="启用状态筛选" />
        <span :class="$style['ag-toolbar-spacer']"></span>
        <UTooltip text="刷新"><UButton :class="[$style['ag-icon-button'], $style.bordered]" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" square aria-label="刷新 Agents" :loading="manager.loading.value" @click="onRefresh" /></UTooltip>
        <UTooltip text="导出清单"><UButton :class="[$style['ag-icon-button'], $style.bordered]" icon="i-lucide-download" color="neutral" variant="ghost" square aria-label="导出 Agents 清单" @click="onExportList" /></UTooltip>
      </div>

      <UAlert v-if="manager.loadingError.value" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadingError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: onRefresh }]" />
      <div :class="$style['ag-content']">
        <div :class="$style['ag-list-pane']">
          <div :class="$style['ag-table-scroll']">
            <UTable :class="$style['ag-table']" :columns="columns" :data="manager.filteredAgents.value" :loading="manager.loading.value" :meta="tableMeta" :get-row-id="(agent: AgentResponse) => String(agent.id)" sticky="header" @select="onSelect">
              <template #agent-cell="{ row }"><UButton color="neutral" variant="ghost" :class="$style['ag-agent-cell']" @click.stop="manager.selectedId.value = row.original.id"><span :class="$style['ag-agent-glyph']"><i class="icon icon-bot"></i></span><span><strong>{{ row.original.name }}</strong><small class="mono">{{ agentCode(row.original.id) }}</small></span></UButton></template>
              <template #state-cell="{ row }"><UBadge color="neutral" variant="subtle" :class="[$style['ag-lifecycle'], row.original.is_enabled ? 'published' : 'disabled']"><span class="dot" :class="row.original.is_enabled ? 'nominal' : 'idle'"></span>{{ row.original.is_enabled ? '已启用' : '已停用' }}</UBadge></template>
              <template #model-cell="{ row }"><span :class="$style['ag-table-main']">{{ row.original.model_name || '平台默认模型' }}</span><small class="mono">MODEL_NAME</small></template>
              <template #capabilities-cell="{ row }"><span :class="$style['ag-table-main']">{{ capabilitySummary(row.original) }}</span><small>服务端数字 ID 绑定</small></template>
              <template #workspace-cell="{ row }"><span :class="[$style['ag-version'], 'mono']">#{{ row.original.workspace_id }}</span><small>创建者 #{{ row.original.created_by_user_id }}</small></template>
              <template #updated-cell="{ row }"><span :class="$style['ag-table-main']">{{ formatTime(row.original.updated_at) }}</span><small>{{ formatTime(row.original.created_at) }} 创建</small></template>
              <template #actions-cell="{ row }"><div :class="$style['ag-row-actions']"><div :class="$style['ag-desktop-actions']"><UTooltip text="配置"><UButton :class="$style['ag-icon-button']" icon="i-lucide-sliders-horizontal" color="neutral" variant="ghost" square :aria-label="`配置 ${row.original.name}`" @click.stop="manager.openEdit(row.original)" /></UTooltip><UTooltip text="复制"><UButton :class="$style['ag-icon-button']" icon="i-lucide-copy" color="neutral" variant="ghost" square :aria-label="`复制 ${row.original.name}`" @click.stop="manager.openDuplicate(row.original)" /></UTooltip><UTooltip text="删除"><UButton :class="$style['ag-icon-button']" icon="i-lucide-trash-2" color="error" variant="ghost" square :aria-label="`删除 ${row.original.name}`" @click.stop="manager.pendingDelete.value = row.original" /></UTooltip></div><UDropdownMenu :items="agentMenuItems(row.original)"><UButton :class="[$style['ag-icon-button'], $style['ag-mobile-actions']]" icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="`${row.original.name} 更多操作`" @click.stop /></UDropdownMenu></div></template>
              <template #empty><UEmpty icon="i-lucide-search-x" :title="manager.loading.value ? '正在加载 Agents' : '没有匹配的 Agent'" :description="manager.loading.value ? '正在读取当前工作区目录。' : '调整关键词或启用状态筛选后再试。'" variant="naked"><template v-if="!manager.loading.value" #actions><UButton label="清除筛选" variant="link" @click="manager.search.value = ''; manager.enabledFilter.value = 'all'" /></template></UEmpty></template>
            </UTable>
          </div>
          <footer :class="$style['ag-pagination']"><span>当前显示 {{ manager.filteredAgents.value.length }} / {{ manager.stats.value.all }} 个 Agent</span><span class="mono">API CATALOG</span></footer>
        </div>
        <AgentInspector :agent="manager.selectedAgent.value" :skills="manager.skills.value" :tools="manager.tools.value" @close="manager.selectedId.value = null" @edit="manager.openEdit" @duplicate="manager.openDuplicate" />
      </div>
    </section>

    <UModal :open="Boolean(manager.pendingDelete.value)" class="ag-confirm-modal" :title="deleteTitle" description="删除后该 Agent 将从当前工作区移除，已有会话记录不会被改绑。" @update:open="(open) => { if (!open) manager.pendingDelete.value = null }">
      <template #body><p :class="$style['ag-modal-copy']">此操作会调用 Agents 删除接口，无法在前端撤销。</p></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.pendingDelete.value = null" /><UButton label="确认删除" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="manager.confirmDelete" /></template>
    </UModal>
  </main>
  <Transition name="ag-toast"><div v-if="manager.toast.value" :class="$style['ag-toast']" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
