<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'
import { computed, useCssModule, watch } from 'vue'
import { PLAN_MODE_LABEL, useOrchestrationPlanManager } from '@/hooks/useOrchestrationPlanManager'
import type { PlanResponse } from '@/interfaces/orchestration-plan/api'
import { useAuthStore } from '@/stores/auth'
import PlanBuilder from '../plan-builder/index.vue'

defineOptions({ name: 'PlanResource' })

const styles = useCssModule()
const manager = useOrchestrationPlanManager()
const authStore = useAuthStore()
const validationIssues = computed(() => manager.validatePlan(manager.draft.value))
const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
]
const modeOptions: Array<{ value: 'all' | PlanResponse['mode']; label: string }> = [
  { value: 'all', label: '全部模式' },
  { value: 'sequential', label: '顺序执行' },
  { value: 'parallel', label: '并行执行' },
  { value: 'routing', label: '智能路由' },
  { value: 'loop', label: '循环迭代' },
]
const columns: TableColumn<PlanResponse>[] = [
  { id: 'plan', header: '方案', meta: { class: { th: styles['pl-col-plan'], td: styles['pl-col-plan'] } } },
  { id: 'state', header: '状态', meta: { class: { th: styles['pl-col-state'], td: styles['pl-col-state'] } } },
  { id: 'mode', header: '编排模式', meta: { class: { th: styles['pl-col-mode'], td: styles['pl-col-mode'] } } },
  { id: 'members', header: '成员', meta: { class: { th: styles['pl-col-members'], td: styles['pl-col-members'] } } },
  { id: 'updated', header: '更新时间', meta: { class: { th: styles['pl-col-updated'], td: styles['pl-col-updated'] } } },
  { id: 'actions', header: '操作', meta: { class: { th: styles['pl-col-actions'], td: styles['pl-col-actions'] } } },
]
const tableMeta = computed(() => ({
  class: { tr: (row: TableRow<PlanResponse>) => manager.selectedId.value === row.original.id ? styles.active : '' },
}))
const deleteTitle = computed(() => manager.pendingDelete.value ? `删除 ${manager.pendingDelete.value.name}？` : '删除编排方案？')

function planCode(id: number) {
  return `PLAN-${String(id).padStart(4, '0')}`
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}

function sortedMembers(plan: PlanResponse) {
  return [...plan.members].sort((left, right) => left.position - right.position)
}

function hasUnavailableMember(plan: PlanResponse) {
  return plan.members.some((member) => !member.is_available)
}

async function onRefresh() {
  await manager.loadAll()
  if (!manager.loadingError.value) manager.showToast('编排方案与 Agent 目录已刷新')
}

function onSelect(_event: Event, row: TableRow<PlanResponse>) {
  manager.selectedId.value = row.original.id
}

function planMenuItems(plan: PlanResponse) {
  return [[
    { label: '配置', icon: 'i-lucide-sliders-horizontal', onSelect: () => { void manager.openEdit(plan) } },
    { label: '复制', icon: 'i-lucide-copy', onSelect: () => manager.openDuplicate(plan) },
    { label: '删除', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { manager.pendingDelete.value = plan } },
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
  <PlanBuilder v-if="manager.builderOpen.value" :plan="manager.draft.value" :mode="manager.builderMode.value" :issues="validationIssues" :agents="manager.agents.value" :saving="manager.saving.value" :error="manager.loadingError.value" @close="manager.builderOpen.value = false" @save="manager.saveDraft" @publish="manager.publish" />
  <main v-else :class="$style['pl-page']">
    <header :class="$style['pl-page-head']">
      <div :class="$style['pl-heading']"><nav aria-label="面包屑"><span>构建资源</span><i class="icon icon-chevron-right"></i><strong>智能体编排</strong></nav><div><span :class="$style['pl-page-icon']"><i class="icon icon-workflow"></i></span><span><h1>编排方案</h1><p>勾选 2-5 个 Agent 组成方案，选择顺序、并行、路由或循环模式，会话绑定后直接运行。</p></span></div></div>
      <div :class="$style['pl-page-actions']"><span :class="[$style['pl-local-badge'], 'mono']"><i class="icon icon-database"></i>API CONNECTED</span><UButton :class="$style['pl-primary-button']" icon="i-lucide-plus" label="创建方案" @click="manager.openCreate" /></div>
    </header>

    <section :class="$style['pl-metrics']" aria-label="编排方案统计">
      <div :class="$style.active"><span>全部方案</span><strong>{{ manager.stats.value.all }}</strong><small class="mono">WORKSPACE</small></div>
      <div><span>已启用</span><strong>{{ manager.stats.value.enabled }}</strong><small><span class="dot nominal"></span>可绑定会话</small></div>
      <div><span>已停用</span><strong>{{ manager.stats.value.disabled }}</strong><small><span class="dot idle"></span>不可绑定</small></div>
      <div><span>成员失效</span><strong>{{ manager.stats.value.broken }}</strong><small><span class="dot warning"></span>含已停用 Agent</small></div>
    </section>

    <section :class="$style['pl-workspace']">
      <div :class="$style['pl-toolbar']">
        <UInput v-model="manager.search.value" :class="$style['pl-search']" icon="i-lucide-search" trailing-icon="i-lucide-x" placeholder="搜索名称、ID、描述或成员" aria-label="搜索编排方案" @click:trailing="manager.search.value = ''" />
        <UTabs v-model="manager.enabledFilter.value" :class="$style['pl-filter-tabs']" :items="enabledOptions" :content="false" size="sm" aria-label="启用状态筛选" />
        <USelect v-model="manager.modeFilter.value" :class="$style['pl-mode-filter']" :items="modeOptions" size="sm" aria-label="编排模式筛选" />
        <span :class="$style['pl-toolbar-spacer']"></span>
        <UTooltip text="刷新"><UButton :class="[$style['pl-icon-button'], $style.bordered]" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" square aria-label="刷新编排方案" :loading="manager.loading.value" @click="onRefresh" /></UTooltip>
      </div>

      <UAlert v-if="manager.loadingError.value" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadingError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: onRefresh }]" />
      <div :class="$style['pl-content']">
        <div :class="$style['pl-list-pane']">
          <div :class="$style['pl-table-scroll']">
            <UTable :class="$style['pl-table']" :columns="columns" :data="manager.filteredPlans.value" :loading="manager.loading.value" :meta="tableMeta" :get-row-id="(plan: PlanResponse) => String(plan.id)" sticky="header" @select="onSelect">
              <template #plan-cell="{ row }"><UButton color="neutral" variant="ghost" :class="$style['pl-plan-cell']" @click.stop="manager.selectedId.value = row.original.id"><span :class="$style['pl-plan-glyph']"><i class="icon icon-workflow"></i></span><span><strong>{{ row.original.name }}</strong><small class="mono">{{ planCode(row.original.id) }}</small></span></UButton></template>
              <template #state-cell="{ row }"><UBadge color="neutral" variant="subtle" :class="[$style['pl-lifecycle'], row.original.is_enabled ? 'published' : 'disabled']"><span class="dot" :class="row.original.is_enabled ? 'nominal' : 'idle'"></span>{{ row.original.is_enabled ? '已启用' : '已停用' }}</UBadge></template>
              <template #mode-cell="{ row }"><span :class="$style['pl-table-main']">{{ PLAN_MODE_LABEL[row.original.mode] }}</span><small class="mono">{{ row.original.mode.toUpperCase() }}</small></template>
              <template #members-cell="{ row }"><span :class="$style['pl-table-main']">{{ row.original.members.length }} 个成员</span><small v-if="hasUnavailableMember(row.original)" :class="$style['pl-member-alert']"><i class="icon icon-triangle-alert"></i>成员已停用</small><small v-else>{{ sortedMembers(row.original).map((member) => member.agent_name).join(' → ') }}</small></template>
              <template #updated-cell="{ row }"><span :class="$style['pl-table-main']">{{ formatTime(row.original.updated_at) }}</span><small>{{ formatTime(row.original.created_at) }} 创建</small></template>
              <template #actions-cell="{ row }"><div :class="$style['pl-row-actions']"><div :class="$style['pl-desktop-actions']"><UTooltip text="配置"><UButton :class="$style['pl-icon-button']" icon="i-lucide-sliders-horizontal" color="neutral" variant="ghost" square :aria-label="`配置 ${row.original.name}`" @click.stop="manager.openEdit(row.original)" /></UTooltip><UTooltip text="复制"><UButton :class="$style['pl-icon-button']" icon="i-lucide-copy" color="neutral" variant="ghost" square :aria-label="`复制 ${row.original.name}`" @click.stop="manager.openDuplicate(row.original)" /></UTooltip><UTooltip text="删除"><UButton :class="$style['pl-icon-button']" icon="i-lucide-trash-2" color="error" variant="ghost" square :aria-label="`删除 ${row.original.name}`" @click.stop="manager.pendingDelete.value = row.original" /></UTooltip></div><UDropdownMenu :items="planMenuItems(row.original)"><UButton :class="[$style['pl-icon-button'], $style['pl-mobile-actions']]" icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="`${row.original.name} 更多操作`" @click.stop /></UDropdownMenu></div></template>
              <template #empty><UEmpty icon="i-lucide-search-x" :title="manager.loading.value ? '正在加载编排方案' : '没有匹配的编排方案'" :description="manager.loading.value ? '正在读取当前工作区方案列表。' : '调整筛选条件，或创建第一个编排方案。'" variant="naked"><template v-if="!manager.loading.value" #actions><UButton label="清除筛选" variant="link" @click="manager.search.value = ''; manager.enabledFilter.value = 'all'; manager.modeFilter.value = 'all'" /></template></UEmpty></template>
            </UTable>
          </div>
          <footer :class="$style['pl-pagination']"><span>当前显示 {{ manager.filteredPlans.value.length }} / {{ manager.stats.value.all }} 个方案</span><span class="mono">API CATALOG</span></footer>
        </div>

        <aside v-if="manager.selectedPlan.value" :class="$style['pl-inspector']" aria-label="方案详情">
          <header :class="$style['pl-inspector-head']">
            <span :class="$style['pl-plan-glyph']"><i class="icon icon-workflow"></i></span>
            <span><small class="mono">{{ planCode(manager.selectedPlan.value.id) }}</small><strong>{{ manager.selectedPlan.value.name }}</strong></span>
            <UButton :class="$style['pl-icon-button']" icon="i-lucide-x" color="neutral" variant="ghost" square aria-label="关闭方案详情" @click="manager.selectedId.value = null" />
          </header>
          <div :class="$style['pl-inspector-scroll']">
            <div :class="$style['pl-detail-state']">
              <UBadge color="neutral" variant="subtle" :class="[$style['pl-lifecycle'], manager.selectedPlan.value.is_enabled ? 'published' : 'disabled']"><span class="dot" :class="manager.selectedPlan.value.is_enabled ? 'nominal' : 'idle'"></span>{{ manager.selectedPlan.value.is_enabled ? '已启用' : '已停用' }}</UBadge>
              <span class="mono">{{ PLAN_MODE_LABEL[manager.selectedPlan.value.mode] }}</span>
            </div>
            <p :class="$style['pl-detail-description']">{{ manager.selectedPlan.value.description || '未填写用途描述' }}</p>
            <UAlert v-if="hasUnavailableMember(manager.selectedPlan.value)" color="error" variant="subtle" icon="i-lucide-triangle-alert" title="部分成员 Agent 已停用，方案将无法运行。" />
            <section :class="$style['pl-detail-section']">
              <h3>成员编排</h3>
              <ol :class="$style['pl-detail-members']">
                <li v-for="member in sortedMembers(manager.selectedPlan.value)" :key="member.id" :class="{ [$style.unavailable]: !member.is_available }">
                  <span class="mono">{{ String(member.position + 1).padStart(2, '0') }}</span>
                  <span :class="$style['pl-detail-member-main']">
                    <strong>{{ member.agent_name }}</strong>
                    <small v-if="typeof member.role_config.route_key === 'string' && member.role_config.route_key" class="mono">{{ member.role_config.route_key }}</small>
                  </span>
                  <em v-if="!member.is_available"><i class="icon icon-triangle-alert"></i>已停用</em>
                </li>
              </ol>
            </section>
            <section :class="$style['pl-detail-section']">
              <h3>服务端信息</h3>
              <dl :class="$style['pl-detail-list']">
                <div><dt>方案 ID</dt><dd class="mono">{{ manager.selectedPlan.value.id }}</dd></div>
                <div><dt>工作区 ID</dt><dd class="mono">{{ manager.selectedPlan.value.workspace_id }}</dd></div>
                <div><dt>创建者 ID</dt><dd class="mono">{{ manager.selectedPlan.value.created_by_user_id }}</dd></div>
                <div><dt>创建时间</dt><dd>{{ formatTime(manager.selectedPlan.value.created_at) }}</dd></div>
                <div><dt>更新时间</dt><dd>{{ formatTime(manager.selectedPlan.value.updated_at) }}</dd></div>
              </dl>
            </section>
          </div>
          <footer :class="$style['pl-inspector-actions']">
            <UButton :class="$style['pl-secondary-button']" icon="i-lucide-copy" color="neutral" variant="outline" label="复制" @click="manager.openDuplicate(manager.selectedPlan.value!)" />
            <UButton :class="$style['pl-primary-button']" icon="i-lucide-sliders-horizontal" label="配置方案" @click="manager.openEdit(manager.selectedPlan.value!)" />
          </footer>
        </aside>
      </div>
    </section>

    <UModal :open="Boolean(manager.pendingDelete.value)" class="ag-confirm-modal" :title="deleteTitle" description="删除后该方案将从当前工作区移除，已绑定的会话需要重新选择编排。" @update:open="(open) => { if (!open) manager.pendingDelete.value = null }">
      <template #body><p :class="$style['pl-modal-copy']">此操作会调用编排方案删除接口，无法在前端撤销。</p></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.pendingDelete.value = null" /><UButton label="确认删除" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="manager.confirmDelete" /></template>
    </UModal>
  </main>
  <Transition name="pl-toast"><div v-if="manager.toast.value" :class="$style['pl-toast']" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
