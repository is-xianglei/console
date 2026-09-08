<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ResourcePagination, ResourceTable } from '@/components'
import { WORKFLOW_MODE_LABEL, WORKFLOW_MODE_OPTIONS } from '@/constants/workflow'
import { useWorkflowManager } from '@/hooks/useWorkflowManager'
import type { WorkflowResponse } from '@/interfaces/workflow/api'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'WorkflowResourceList' })

const styles = useCssModule()
const manager = useWorkflowManager()
const authStore = useAuthStore()
const router = useRouter()

const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
]
const modeOptions: Array<{ value: 'all' | WorkflowResponse['mode']; label: string }> = [
  { value: 'all', label: '全部模式' },
  ...WORKFLOW_MODE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
]
const columns: TableColumn<WorkflowResponse>[] = [
  { id: 'name', header: '名称', meta: { class: { th: styles['wf-col-name'], td: styles['wf-col-name'] } } },
  { id: 'state', header: '状态', meta: { class: { th: styles['wf-col-state'], td: styles['wf-col-state'] } } },
  { id: 'mode', header: '编排模式', meta: { class: { th: styles['wf-col-mode'], td: styles['wf-col-mode'] } } },
  { id: 'members', header: '成员', meta: { class: { th: styles['wf-col-members'], td: styles['wf-col-members'] } } },
  { id: 'updated', header: '更新时间', meta: { class: { th: styles['wf-col-updated'], td: styles['wf-col-updated'] } } },
  { id: 'actions', header: '操作', meta: { class: { th: styles['wf-col-actions'], td: styles['wf-col-actions'] } } },
]
const deleteTitle = computed(() => manager.pendingDelete.value ? `删除 ${manager.pendingDelete.value.name}？` : '删除 Workflow？')

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}

function memberNames(workflow: WorkflowResponse) {
  return [...workflow.agents]
    .sort((left, right) => left.sort_order - right.sort_order || left.agent_id - right.agent_id)
    .map((member) => member.agent_name ?? '已删除的 Agent')
}

function goToCreate() {
  void router.push({ name: 'workflow-create', params: { module: 'build', resource: 'workflows' } })
}

function goToDetail(workflow: WorkflowResponse) {
  void router.push({ name: 'workflow-detail', params: { id: String(workflow.id) } })
}

function goToEdit(workflow: WorkflowResponse) {
  void router.push({ name: 'workflow-edit', params: { id: String(workflow.id) } })
}

function goToDuplicate(workflow: WorkflowResponse) {
  void router.push({ name: 'workflow-create', params: { module: 'build', resource: 'workflows' }, query: { duplicate: String(workflow.id) } })
}

async function onRefresh() {
  await manager.loadAll()
  if (!manager.loadingError.value) manager.showToast('Workflow 与 Agent 目录已刷新')
}

watch(
  () => authStore.currentWorkspaceId,
  (workspaceId) => {
    if (workspaceId) void manager.loadAll()
  },
  { immediate: true },
)
</script>

<template>
  <main :class="styles['wf-page']">
    <header :class="styles['wf-page-head']">
      <div :class="styles['wf-heading']"><nav aria-label="面包屑"><span>构建资源</span><i class="icon icon-chevron-right"></i><strong>Workflows</strong></nav><div><span :class="styles['wf-page-icon']"><i class="icon icon-workflow"></i></span><span><h1>Workflows</h1><p>把多个 Agent 组合成顺序、并行或智能路由的 Workflow，会话绑定后由后端编排执行。点击行查看详情。</p></span></div></div>
      <div :class="styles['wf-page-actions']"><span :class="[styles['wf-local-badge'], 'mono']"><i class="icon icon-database"></i>API CONNECTED</span><UButton :class="styles['wf-primary-button']" icon="i-lucide-plus" label="创建 Workflow" @click="goToCreate" /></div>
    </header>

    <section :class="styles['wf-metrics']" aria-label="Workflow 统计">
      <div :class="styles.active"><span>全部 Workflow</span><strong>{{ manager.stats.value.all }}</strong><small class="mono">WORKSPACE</small></div>
      <div><span>已启用</span><strong>{{ manager.stats.value.enabled }}</strong><small><span class="dot nominal"></span>可被会话绑定</small></div>
      <div><span>已停用</span><strong>{{ manager.stats.value.disabled }}</strong><small><span class="dot idle"></span>不可绑定</small></div>
      <div><span>成员失效</span><strong>{{ manager.stats.value.broken }}</strong><small><span class="dot warning"></span>含已停用或已删除 Agent</small></div>
    </section>

    <section :class="styles['wf-workspace']">
      <div :class="styles['wf-toolbar']">
        <UInput v-model="manager.search.value" :class="styles['wf-search']" icon="i-lucide-search" trailing-icon="i-lucide-x" placeholder="搜索名称、ID、描述或成员" aria-label="搜索 Workflow" @click:trailing="manager.search.value = ''" />
        <UTabs v-model="manager.enabledFilter.value" :class="styles['wf-filter-tabs']" :items="enabledOptions" :content="false" size="sm" aria-label="启用状态筛选" />
        <USelect v-model="manager.modeFilter.value" :class="styles['wf-mode-filter']" :items="modeOptions" size="sm" aria-label="编排模式筛选" />
        <span :class="styles['wf-toolbar-spacer']"></span>
        <UTooltip text="刷新"><UButton :class="[styles['wf-icon-button'], styles.bordered]" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" square aria-label="刷新 Workflow" :loading="manager.loading.value" @click="onRefresh" /></UTooltip>
      </div>

      <UAlert v-if="manager.loadingError.value" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadingError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: onRefresh }]" />
      <div :class="styles['wf-content']">
        <div :class="styles['wf-list-pane']">
          <div :class="styles['wf-table-scroll']">
            <ResourceTable :columns="columns" :data="manager.filteredWorkflows.value" :loading="manager.loading.value" :row-key="(workflow: WorkflowResponse) => String(workflow.id)" :table-class="styles['wf-table']" @select="goToDetail">
              <template #name-cell="{ row }"><UButton color="neutral" variant="ghost" :class="styles['wf-name-cell']" :aria-label="`查看 ${row.original.name} 详情`" @click.stop="goToDetail(row.original)"><span :class="styles['wf-name-glyph']"><i class="icon icon-workflow"></i></span><span><strong>{{ row.original.name }}</strong><small v-if="row.original.description" :class="styles['wf-name-description']">{{ row.original.description }}</small><small v-else class="mono">WF-{{ String(row.original.id).padStart(4, '0') }}</small></span></UButton></template>
              <template #state-cell="{ row }"><UBadge color="neutral" variant="subtle" :class="[styles['wf-lifecycle'], row.original.is_enabled ? 'published' : 'disabled']"><span class="dot" :class="row.original.is_enabled ? 'nominal' : 'idle'"></span>{{ row.original.is_enabled ? '已启用' : '已停用' }}</UBadge></template>
              <template #mode-cell="{ row }"><span :class="styles['wf-table-main']">{{ WORKFLOW_MODE_LABEL[row.original.mode] }}</span><small class="mono">{{ row.original.mode.toUpperCase() }}</small></template>
              <template #members-cell="{ row }"><span :class="styles['wf-table-main']">{{ row.original.agents.length }} 个成员</span><small v-if="manager.hasBrokenMember(row.original)" :class="styles['wf-member-alert']"><i class="icon icon-triangle-alert"></i>成员失效</small><small v-else>{{ memberNames(row.original).join(' → ') }}</small></template>
              <template #updated-cell="{ row }"><span :class="styles['wf-table-main']">{{ formatTime(row.original.updated_at) }}</span><small>{{ formatTime(row.original.created_at) }} 创建</small></template>
              <template #actions-cell="{ row }"><div :class="styles['wf-row-actions']"><div :class="styles['wf-desktop-actions']"><UTooltip text="详情"><UButton :class="styles['wf-icon-button']" icon="i-lucide-eye" color="neutral" variant="ghost" square :aria-label="`查看 ${row.original.name} 详情`" @click.stop="goToDetail(row.original)" /></UTooltip><UTooltip text="编辑"><UButton :class="styles['wf-icon-button']" icon="i-lucide-pencil" color="neutral" variant="ghost" square :aria-label="`编辑 ${row.original.name}`" @click.stop="goToEdit(row.original)" /></UTooltip><UTooltip text="复制"><UButton :class="styles['wf-icon-button']" icon="i-lucide-copy" color="neutral" variant="ghost" square :aria-label="`复制 ${row.original.name}`" @click.stop="goToDuplicate(row.original)" /></UTooltip><UTooltip :text="row.original.is_enabled ? '停用' : '启用'"><UButton :class="styles['wf-icon-button']" :icon="row.original.is_enabled ? 'i-lucide-power-off' : 'i-lucide-power'" color="neutral" variant="ghost" square :loading="manager.togglingId.value === row.original.id" :aria-label="`${row.original.is_enabled ? '停用' : '启用'} ${row.original.name}`" @click.stop="manager.toggleEnabled(row.original)" /></UTooltip><UTooltip text="删除"><UButton :class="styles['wf-icon-button']" icon="i-lucide-trash-2" color="error" variant="ghost" square :aria-label="`删除 ${row.original.name}`" @click.stop="manager.requestDelete(row.original)" /></UTooltip></div><UDropdownMenu :items="[[
        { label: '详情', icon: 'i-lucide-eye', onSelect: () => goToDetail(row.original) },
        { label: '编辑', icon: 'i-lucide-pencil', onSelect: () => goToEdit(row.original) },
        { label: '复制', icon: 'i-lucide-copy', onSelect: () => goToDuplicate(row.original) },
        row.original.is_enabled ? { label: '停用', icon: 'i-lucide-power-off', onSelect: () => { void manager.toggleEnabled(row.original) } } : { label: '启用', icon: 'i-lucide-power', onSelect: () => { void manager.toggleEnabled(row.original) } },
        { label: '删除', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => manager.requestDelete(row.original) },
      ]]"><UButton :class="[styles['wf-icon-button'], styles['wf-mobile-actions']]" icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="`${row.original.name} 更多操作`" @click.stop /></UDropdownMenu></div></template>
              <template #empty><UEmpty icon="i-lucide-search-x" :title="manager.loading.value ? '正在加载 Workflow' : '没有匹配的 Workflow'" :description="manager.loading.value ? '正在读取当前工作区 Workflow 列表。' : '调整筛选条件，或创建第一个 Workflow。'" variant="naked"><template v-if="!manager.loading.value" #actions><UButton label="清除筛选" variant="link" @click="manager.search.value = ''; manager.enabledFilter.value = 'all'; manager.modeFilter.value = 'all'" /></template></UEmpty></template>
            </ResourceTable>
          </div>
          <ResourcePagination :shown="manager.filteredWorkflows.value.length" :total="manager.stats.value.all" :items-per-page="0" footer-extra="API CATALOG" />
        </div>
      </div>
    </section>

    <UModal :open="Boolean(manager.pendingDelete.value)" :class="styles['ag-confirm-modal']" :title="deleteTitle" description="删除后不可恢复，请确认是否继续。" @update:open="(open) => { if (!open) manager.cancelDelete() }">
      <template #body><p :class="styles['wf-modal-copy']">此操作会调用 Workflow 删除接口，删除后该 Workflow 将从当前工作区移除，无法在前端撤销。</p></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.cancelDelete" /><UButton label="确认删除" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="manager.confirmDelete" /></template>
    </UModal>
  </main>
  <Transition name="wf-toast"><div v-if="manager.toast.value" :class="styles['wf-toast']" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
