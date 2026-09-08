<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ResourcePagination, ResourceTable } from '@/components'
import { useAgentManager } from '@/hooks/useAgentManager'
import type { AgentResponse } from '@/interfaces/agent/api'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'AgentResourceList' })

const styles = useCssModule()
const manager = useAgentManager()
const authStore = useAuthStore()
const router = useRouter()

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

function goToCreate() {
  void router.push({ name: 'agent-create', params: { module: 'build', resource: 'agents' } })
}

function goToDetail(agent: AgentResponse) {
  void router.push({ name: 'agent-detail', params: { id: String(agent.id) } })
}

function goToEdit(agent: AgentResponse) {
  void router.push({ name: 'agent-edit', params: { id: String(agent.id) } })
}

function goToDuplicate(agent: AgentResponse) {
  void router.push({ name: 'agent-create', params: { module: 'build', resource: 'agents' }, query: { duplicate: String(agent.id) } })
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
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xFEFF) + csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'agents.csv'
  link.click()
  URL.revokeObjectURL(url)
  manager.showToast(`已导出 ${rows.length} 个 Agent`)
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
  <main :class="styles['ag-page']">
    <header :class="styles['ag-page-head']">
      <div :class="styles['ag-heading']"><nav aria-label="面包屑"><span>构建资源</span><i class="icon icon-chevron-right"></i><strong>智能体编排</strong></nav><div><span :class="styles['ag-page-icon']"><i class="icon icon-bot"></i></span><span><h1>Agents</h1><p>管理系统提示词、模型名称、启用状态以及当前工作区的 Skill 与 Tool 绑定。点击行查看详情。</p></span></div></div>
      <div :class="styles['ag-page-actions']"><span :class="[styles['ag-local-badge'], 'mono']"><i class="icon icon-database"></i>API CONNECTED</span><UButton :class="styles['ag-primary-button']" icon="i-lucide-plus" label="创建 Agent" @click="goToCreate" /></div>
    </header>

    <section :class="styles['ag-metrics']" aria-label="Agent 统计">
      <div :class="styles.active"><span>全部 Agent</span><strong>{{ manager.stats.value.all }}</strong><small class="mono">WORKSPACE</small></div>
      <div><span>已启用</span><strong>{{ manager.stats.value.enabled }}</strong><small><span class="dot nominal"></span>可用于新会话</small></div>
      <div><span>已停用</span><strong>{{ manager.stats.value.disabled }}</strong><small><span class="dot idle"></span>不可选择</small></div>
      <div><span>未绑定能力</span><strong>{{ manager.stats.value.unbound }}</strong><small><span class="dot warning"></span>无 Skill 与 Tool</small></div>
    </section>

    <section :class="styles['ag-workspace']">
      <div :class="styles['ag-toolbar']">
        <UInput v-model="manager.search.value" :class="styles['ag-search']" icon="i-lucide-search" trailing-icon="i-lucide-x" placeholder="搜索名称、ID、描述或模型" aria-label="搜索 Agents" @click:trailing="manager.search.value = ''" />
        <UTabs v-model="manager.enabledFilter.value" :class="styles['ag-filter-tabs']" :items="enabledOptions" :content="false" size="sm" aria-label="启用状态筛选" />
        <span :class="styles['ag-toolbar-spacer']"></span>
        <UTooltip text="刷新"><UButton :class="[styles['ag-icon-button'], styles.bordered]" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" square aria-label="刷新 Agents" :loading="manager.loading.value" @click="onRefresh" /></UTooltip>
        <UTooltip text="导出清单"><UButton :class="[styles['ag-icon-button'], styles.bordered]" icon="i-lucide-download" color="neutral" variant="ghost" square aria-label="导出 Agents 清单" @click="onExportList" /></UTooltip>
      </div>

      <UAlert v-if="manager.loadingError.value" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadingError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: onRefresh }]" />
      <div :class="styles['ag-content']">
        <div :class="styles['ag-list-pane']">
          <div :class="styles['ag-table-scroll']">
            <ResourceTable :columns="columns" :data="manager.filteredAgents.value" :loading="manager.loading.value" :row-key="(agent: AgentResponse) => String(agent.id)" :table-class="styles['ag-table']" @select="goToDetail">
              <template #agent-cell="{ row }"><UButton color="neutral" variant="ghost" :class="styles['ag-agent-cell']" :aria-label="`查看 ${row.original.name} 详情`" @click.stop="goToDetail(row.original)"><span :class="styles['ag-agent-glyph']"><i class="icon icon-bot"></i></span><span><strong>{{ row.original.name }}</strong><small class="mono">{{ agentCode(row.original.id) }}</small></span></UButton></template>
              <template #state-cell="{ row }"><UBadge color="neutral" variant="subtle" :class="[styles['ag-lifecycle'], row.original.is_enabled ? 'published' : 'disabled']"><span class="dot" :class="row.original.is_enabled ? 'nominal' : 'idle'"></span>{{ row.original.is_enabled ? '已启用' : '已停用' }}</UBadge></template>
              <template #model-cell="{ row }"><span :class="styles['ag-table-main']">{{ row.original.model_name || '平台默认模型' }}</span><small class="mono">MODEL_NAME</small></template>
              <template #capabilities-cell="{ row }"><span :class="styles['ag-table-main']">{{ capabilitySummary(row.original) }}</span><small>服务端数字 ID 绑定</small></template>
              <template #workspace-cell="{ row }"><span :class="[styles['ag-version'], 'mono']">#{{ row.original.workspace_id }}</span><small>创建者 #{{ row.original.created_by_user_id }}</small></template>
              <template #updated-cell="{ row }"><span :class="styles['ag-table-main']">{{ formatTime(row.original.updated_at) }}</span><small>{{ formatTime(row.original.created_at) }} 创建</small></template>
              <template #actions-cell="{ row }"><div :class="styles['ag-row-actions']"><div :class="styles['ag-desktop-actions']"><UTooltip text="详情"><UButton :class="styles['ag-icon-button']" icon="i-lucide-eye" color="neutral" variant="ghost" square :aria-label="`查看 ${row.original.name} 详情`" @click.stop="goToDetail(row.original)" /></UTooltip><UTooltip text="配置"><UButton :class="styles['ag-icon-button']" icon="i-lucide-sliders-horizontal" color="neutral" variant="ghost" square :aria-label="`配置 ${row.original.name}`" @click.stop="goToEdit(row.original)" /></UTooltip><UTooltip text="复制"><UButton :class="styles['ag-icon-button']" icon="i-lucide-copy" color="neutral" variant="ghost" square :aria-label="`复制 ${row.original.name}`" @click.stop="goToDuplicate(row.original)" /></UTooltip><UTooltip text="删除"><UButton :class="styles['ag-icon-button']" icon="i-lucide-trash-2" color="error" variant="ghost" square :aria-label="`删除 ${row.original.name}`" @click.stop="manager.pendingDelete.value = row.original" /></UTooltip></div><UDropdownMenu :items="[[
        { label: '详情', icon: 'i-lucide-eye', onSelect: () => goToDetail(row.original) },
        { label: '配置', icon: 'i-lucide-sliders-horizontal', onSelect: () => goToEdit(row.original) },
        { label: '复制', icon: 'i-lucide-copy', onSelect: () => goToDuplicate(row.original) },
        { label: '删除', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { manager.pendingDelete.value = row.original } },
      ]]"><UButton :class="[styles['ag-icon-button'], styles['ag-mobile-actions']]" icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="`${row.original.name} 更多操作`" @click.stop /></UDropdownMenu></div></template>
              <template #empty><UEmpty icon="i-lucide-search-x" :title="manager.loading.value ? '正在加载 Agents' : '没有匹配的 Agent'" :description="manager.loading.value ? '正在读取当前工作区目录。' : '调整关键词或启用状态筛选后再试。'" variant="naked"><template v-if="!manager.loading.value" #actions><UButton label="清除筛选" variant="link" @click="manager.search.value = ''; manager.enabledFilter.value = 'all'" /></template></UEmpty></template>
            </ResourceTable>
          </div>
          <ResourcePagination :shown="manager.filteredAgents.value.length" :total="manager.stats.value.all" :items-per-page="0" footer-extra="API CATALOG" />
        </div>
      </div>
    </section>

    <UModal :open="Boolean(manager.pendingDelete.value)" class="ag-confirm-modal" :title="deleteTitle" description="删除后该 Agent 将从当前工作区移除，已有会话记录不会被改绑。" @update:open="(open) => { if (!open) manager.pendingDelete.value = null }">
      <template #body><p :class="styles['ag-modal-copy']">此操作会调用 Agents 删除接口，无法在前端撤销。</p></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.pendingDelete.value = null" /><UButton label="确认删除" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="manager.confirmDelete" /></template>
    </UModal>
  </main>
  <Transition name="ag-toast"><div v-if="manager.toast.value" :class="styles['ag-toast']" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
