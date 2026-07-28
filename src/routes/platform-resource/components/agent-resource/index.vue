<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'
import { computed, useCssModule } from 'vue'
import { MODEL_OPTIONS } from '@/constants/agent'
import { useAgentManager } from '@/hooks/useAgentManager'
import type { AgentConfig } from '@/interfaces/agent/model'
import AgentBuilder from '../agent-builder/index.vue'
import AgentInspector from '../agent-inspector/index.vue'

defineOptions({ name: 'AgentResource' })

const styles = useCssModule()
const manager = useAgentManager()
const validationIssues = computed(() => manager.validateAgent(manager.draft.value))
const lifecycleLabel = { draft: '草稿', review: '审核中', published: '已发布', disabled: '已停用' }
const lifecycleOptions = [
  { value: 'all', label: '全部' },
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
  { value: 'disabled', label: '已停用' },
]
const columns: TableColumn<AgentConfig>[] = [
  { id: 'agent', header: 'Agent', meta: { class: { th: styles['ag-col-agent'], td: styles['ag-col-agent'] } } },
  { id: 'state', header: '生命周期', meta: { class: { th: styles['ag-col-state'], td: styles['ag-col-state'] } } },
  { id: 'model', header: '主模型', meta: { class: { th: styles['ag-col-model'], td: styles['ag-col-model'] } } },
  { id: 'capabilities', header: '能力绑定', meta: { class: { th: styles['ag-col-capabilities'], td: styles['ag-col-capabilities'] } } },
  { id: 'version', header: '版本', meta: { class: { th: styles['ag-col-version'], td: styles['ag-col-version'] } } },
  { id: 'runtime', header: '运行指标', meta: { class: { th: styles['ag-col-runtime'], td: styles['ag-col-runtime'] } } },
  { id: 'owner', header: '负责人', meta: { class: { th: styles['ag-col-owner'], td: styles['ag-col-owner'] } } },
  { id: 'actions', header: '操作', meta: { class: { th: styles['ag-col-actions'], td: styles['ag-col-actions'] } } },
]
const tableMeta = computed(() => ({
  class: { tr: (row: TableRow<AgentConfig>) => manager.selectedId.value === row.original.id ? styles.active : '' },
}))
const deleteTitle = computed(() => manager.pendingDelete.value ? `删除 ${manager.pendingDelete.value.name}？` : '删除 Agent？')

function modelName(agent: AgentConfig) {
  return MODEL_OPTIONS.find((model) => model.id === agent.model.primaryModelId)?.name ?? '未配置'
}

function capabilitySummary(agent: AgentConfig) {
  return `${agent.skills.length} Skills · ${agent.mcpServers.length} MCP · ${agent.tools.length} Tools`
}

function versionLabel(agent: AgentConfig) {
  return agent.publishedVersion ? `v${agent.publishedVersion}` : agent.draftVersion
}

function onExportList() {
  manager.showToast('已创建 Agents 配置清单导出任务')
}

function onSelect(_event: Event, row: TableRow<AgentConfig>) {
  manager.selectedId.value = row.original.id
}

function agentMenuItems(agent: AgentConfig) {
  return [[
    { label: '配置', icon: 'i-lucide-sliders-horizontal', onSelect: () => manager.openEdit(agent) },
    { label: '复制', icon: 'i-lucide-copy', onSelect: () => manager.openDuplicate(agent) },
    { label: '删除', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { manager.pendingDelete.value = agent } },
  ]]
}
</script>

<template>
  <AgentBuilder
    v-if="manager.builderOpen.value"
    :agent="manager.draft.value"
    :mode="manager.builderMode.value"
    :issues="validationIssues"
    @close="manager.builderOpen.value = false"
    @save="manager.saveDraft()"
    @publish="manager.publish()"
  />
  <main v-else :class="$style['ag-page']">
    <header :class="$style['ag-page-head']">
      <div :class="$style['ag-heading']"><nav aria-label="面包屑"><span>构建资源</span><i class="icon icon-chevron-right"></i><strong>智能体编排</strong></nav><div><span :class="$style['ag-page-icon']"><i class="icon icon-bot"></i></span><span><h1>Agents</h1><p>配置提示词、模型、Skills、MCP、工具权限与运行边界，并管理发布版本。</p></span></div></div>
      <div :class="$style['ag-page-actions']"><span :class="[$style['ag-local-badge'], 'mono']"><i class="icon icon-monitor-dot"></i>LOCAL CONFIG PREVIEW</span><UButton :class="$style['ag-primary-button']" icon="i-lucide-plus" label="创建 Agent" @click="manager.openCreate" /></div>
    </header>

    <section :class="$style['ag-metrics']" aria-label="Agent 统计">
      <div :class="$style['active']"><span>全部 Agent</span><strong>{{ manager.stats.value.all }}</strong><small class="mono">WORKSPACE</small></div>
      <div><span>已发布</span><strong>{{ manager.stats.value.published }}</strong><small><span class="dot nominal"></span>可运行</small></div>
      <div><span>草稿与审核</span><strong>{{ manager.stats.value.draft }}</strong><small><span class="dot idle"></span>未部署</small></div>
      <div><span>需要关注</span><strong>{{ manager.stats.value.attention }}</strong><small><span class="dot warning"></span>依赖或运行异常</small></div>
    </section>

    <section :class="$style['ag-workspace']">
      <div :class="$style['ag-toolbar']">
        <UInput v-model="manager.search.value" :class="$style['ag-search']" icon="i-lucide-search" trailing-icon="i-lucide-x" placeholder="搜索名称、ID、负责人或标签" aria-label="搜索 Agents" @click:trailing="manager.search.value = ''" />
        <UTabs v-model="manager.lifecycleFilter.value" :class="$style['ag-filter-tabs']" :items="lifecycleOptions" :content="false" size="sm" aria-label="生命周期筛选" />
        <span :class="$style['ag-toolbar-spacer']"></span>
        <UTooltip text="刷新"><UButton :class="[$style['ag-icon-button'], $style['bordered']]" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" square aria-label="刷新 Agents" @click="manager.showToast('Agents 配置目录已刷新')" /></UTooltip>
        <UTooltip text="导出清单"><UButton :class="[$style['ag-icon-button'], $style['bordered']]" icon="i-lucide-download" color="neutral" variant="ghost" square aria-label="导出 Agents 清单" @click="onExportList" /></UTooltip>
      </div>

      <div :class="$style['ag-content']">
        <div :class="$style['ag-list-pane']">
          <div :class="$style['ag-table-scroll']">
            <UTable :class="$style['ag-table']" :columns="columns" :data="manager.filteredAgents.value" :meta="tableMeta" :get-row-id="(agent: AgentConfig) => agent.id" sticky="header" @select="onSelect">
              <template #agent-cell="{ row }"><UButton color="neutral" variant="ghost" :class="$style['ag-agent-cell']" @click.stop="manager.selectedId.value = row.original.id"><span :class="$style['ag-agent-glyph']"><i class="icon icon-bot"></i></span><span><strong>{{ row.original.name }}</strong><small class="mono">{{ row.original.id }} · {{ row.original.slug }}</small></span></UButton></template>
              <template #state-cell="{ row }"><UBadge color="neutral" variant="subtle" :class="[$style['ag-lifecycle'], row.original.lifecycle]" ><span class="dot" :class="row.original.lifecycle === 'published' ? row.original.health : 'idle'"></span>{{ lifecycleLabel[row.original.lifecycle] }}</UBadge></template>
              <template #model-cell="{ row }"><span :class="$style['ag-table-main']">{{ modelName(row.original) }}</span><small>{{ row.original.model.preset === 'precise' ? '精确' : row.original.model.preset === 'creative' ? '创意' : '均衡' }} · T {{ row.original.model.temperature.toFixed(2) }}</small></template>
              <template #capabilities-cell="{ row }"><span :class="$style['ag-table-main']">{{ capabilitySummary(row.original) }}</span><small>{{ row.original.tools.filter((tool: AgentConfig['tools'][number]) => tool.permission === 'ask').length }} 个操作需要审批</small></template>
              <template #version-cell="{ row }"><span :class="[$style['ag-version'], 'mono']">{{ versionLabel(row.original) }}</span><small>{{ row.original.updatedAt }}</small></template>
              <template #runtime-cell="{ row }"><span :class="[$style['ag-table-main'], 'mono']">{{ row.original.successRate == null ? '—' : `${row.original.successRate}%` }}</span><small>{{ row.original.lastRun }}</small></template>
              <template #owner-cell="{ row }"><span :class="$style['ag-table-main']">{{ row.original.owner }}</span><small>{{ row.original.visibility === 'workspace' ? '工作区可见' : row.original.visibility === 'team' ? '团队可见' : '仅创建者' }}</small></template>
              <template #actions-cell="{ row }"><div :class="$style['ag-row-actions']"><div :class="$style['ag-desktop-actions']"><UTooltip text="配置"><UButton :class="$style['ag-icon-button']" icon="i-lucide-sliders-horizontal" color="neutral" variant="ghost" square :aria-label="`配置 ${row.original.name}`" @click.stop="manager.openEdit(row.original)" /></UTooltip><UTooltip text="复制"><UButton :class="$style['ag-icon-button']" icon="i-lucide-copy" color="neutral" variant="ghost" square :aria-label="`复制 ${row.original.name}`" @click.stop="manager.openDuplicate(row.original)" /></UTooltip><UTooltip text="删除"><UButton :class="$style['ag-icon-button']" icon="i-lucide-trash-2" color="error" variant="ghost" square :aria-label="`删除 ${row.original.name}`" @click.stop="manager.pendingDelete.value = row.original" /></UTooltip></div><UDropdownMenu :items="agentMenuItems(row.original)"><UButton :class="[$style['ag-icon-button'], $style['ag-mobile-actions']]" icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="`${row.original.name} 更多操作`" @click.stop /></UDropdownMenu></div></template>
              <template #empty><UEmpty :class="$style['ag-empty']" icon="i-lucide-search-x" title="没有匹配的 Agent" description="调整关键词或生命周期筛选后再试。" variant="naked"><template #actions><UButton label="清除筛选" variant="link" @click="manager.search.value = ''; manager.lifecycleFilter.value = 'all'" /></template></UEmpty></template>
            </UTable>
          </div>
          <footer :class="$style['ag-pagination']"><span>共 {{ manager.filteredAgents.value.length }} 个 Agent</span><span class="mono">PAGE 1 / 1</span></footer>
        </div>
        <AgentInspector :agent="manager.selectedAgent.value" @close="manager.selectedId.value = ''" @edit="manager.openEdit" @duplicate="manager.openDuplicate" />
      </div>
    </section>

    <UModal :open="Boolean(manager.pendingDelete.value)" class="ag-confirm-modal" :title="deleteTitle" description="该操作只影响当前本地配置预览，相关 Team 引用需要重新配置。" @update:open="(open) => { if (!open) manager.pendingDelete.value = null }">
      <template #body><p :class="$style['ag-modal-copy']">该操作只影响当前本地配置预览，相关 Team 引用需要重新配置。</p></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" @click="manager.pendingDelete.value = null" /><UButton label="确认删除" color="error" @click="manager.confirmDelete" /></template>
    </UModal>
    <Transition name="ag-toast"><div v-if="manager.toast.value" :class="$style['ag-toast']" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
  </main>
</template>

<style module src="./index.module.css"></style>
