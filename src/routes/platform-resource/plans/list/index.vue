<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ResourcePagination, ResourceTable } from '@/components'
import { PLAN_MODE_LABEL } from '@/hooks/useOrchestrationPlanManager'
import { useOrchestrationPlanManager } from '@/hooks/useOrchestrationPlanManager'
import type { PlanResponse } from '@/interfaces/orchestration-plan/api'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'PlanResourceList' })

const styles = useCssModule()
const manager = useOrchestrationPlanManager()
const authStore = useAuthStore()
const router = useRouter()

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

function goToCreate() {
  void router.push({ name: 'plan-create', params: { module: 'build', resource: 'plans' } })
}

function goToDetail(plan: PlanResponse) {
  void router.push({ name: 'plan-detail', params: { id: String(plan.id) } })
}

function goToEdit(plan: PlanResponse) {
  void router.push({ name: 'plan-edit', params: { id: String(plan.id) } })
}

function goToDuplicate(plan: PlanResponse) {
  void router.push({ name: 'plan-create', params: { module: 'build', resource: 'plans' }, query: { duplicate: String(plan.id) } })
}

async function onRefresh() {
  await manager.loadAll()
  if (!manager.loadingError.value) manager.showToast('编排方案与 Agent 目录已刷新')
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
  <main :class="styles['pl-page']">
    <header :class="styles['pl-page-head']">
      <div :class="styles['pl-heading']"><nav aria-label="面包屑"><span>构建资源</span><i class="icon icon-chevron-right"></i><strong>智能体编排</strong></nav><div><span :class="styles['pl-page-icon']"><i class="icon icon-workflow"></i></span><span><h1>编排方案</h1><p>勾选 2-5 个 Agent 组成方案，选择顺序、并行、路由或循环模式，会话绑定后直接运行。点击行查看详情。</p></span></div></div>
      <div :class="styles['pl-page-actions']"><span :class="[styles['pl-local-badge'], 'mono']"><i class="icon icon-database"></i>API CONNECTED</span><UButton :class="styles['pl-primary-button']" icon="i-lucide-plus" label="创建方案" @click="goToCreate" /></div>
    </header>

    <section :class="styles['pl-metrics']" aria-label="编排方案统计">
      <div :class="styles.active"><span>全部方案</span><strong>{{ manager.stats.value.all }}</strong><small class="mono">WORKSPACE</small></div>
      <div><span>已启用</span><strong>{{ manager.stats.value.enabled }}</strong><small><span class="dot nominal"></span>可绑定会话</small></div>
      <div><span>已停用</span><strong>{{ manager.stats.value.disabled }}</strong><small><span class="dot idle"></span>不可绑定</small></div>
      <div><span>成员失效</span><strong>{{ manager.stats.value.broken }}</strong><small><span class="dot warning"></span>含已停用 Agent</small></div>
    </section>

    <section :class="styles['pl-workspace']">
      <div :class="styles['pl-toolbar']">
        <UInput v-model="manager.search.value" :class="styles['pl-search']" icon="i-lucide-search" trailing-icon="i-lucide-x" placeholder="搜索名称、ID、描述或成员" aria-label="搜索编排方案" @click:trailing="manager.search.value = ''" />
        <UTabs v-model="manager.enabledFilter.value" :class="styles['pl-filter-tabs']" :items="enabledOptions" :content="false" size="sm" aria-label="启用状态筛选" />
        <USelect v-model="manager.modeFilter.value" :class="styles['pl-mode-filter']" :items="modeOptions" size="sm" aria-label="编排模式筛选" />
        <span :class="styles['pl-toolbar-spacer']"></span>
        <UTooltip text="刷新"><UButton :class="[styles['pl-icon-button'], styles.bordered]" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" square aria-label="刷新编排方案" :loading="manager.loading.value" @click="onRefresh" /></UTooltip>
      </div>

      <UAlert v-if="manager.loadingError.value" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadingError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: onRefresh }]" />
      <div :class="styles['pl-content']">
        <div :class="styles['pl-list-pane']">
          <div :class="styles['pl-table-scroll']">
            <ResourceTable :columns="columns" :data="manager.filteredPlans.value" :loading="manager.loading.value" :row-key="(plan: PlanResponse) => String(plan.id)" :table-class="styles['pl-table']" @select="goToDetail">
              <template #plan-cell="{ row }"><UButton color="neutral" variant="ghost" :class="styles['pl-plan-cell']" :aria-label="`查看 ${row.original.name} 详情`" @click.stop="goToDetail(row.original)"><span :class="styles['pl-plan-glyph']"><i class="icon icon-workflow"></i></span><span><strong>{{ row.original.name }}</strong><small class="mono">{{ planCode(row.original.id) }}</small></span></UButton></template>
              <template #state-cell="{ row }"><UBadge color="neutral" variant="subtle" :class="[styles['pl-lifecycle'], row.original.is_enabled ? 'published' : 'disabled']"><span class="dot" :class="row.original.is_enabled ? 'nominal' : 'idle'"></span>{{ row.original.is_enabled ? '已启用' : '已停用' }}</UBadge></template>
              <template #mode-cell="{ row }"><span :class="styles['pl-table-main']">{{ PLAN_MODE_LABEL[row.original.mode] }}</span><small class="mono">{{ row.original.mode.toUpperCase() }}</small></template>
              <template #members-cell="{ row }"><span :class="styles['pl-table-main']">{{ row.original.members.length }} 个成员</span><small v-if="hasUnavailableMember(row.original)" :class="styles['pl-member-alert']"><i class="icon icon-triangle-alert"></i>成员已停用</small><small v-else>{{ sortedMembers(row.original).map((member) => member.agent_name).join(' → ') }}</small></template>
              <template #updated-cell="{ row }"><span :class="styles['pl-table-main']">{{ formatTime(row.original.updated_at) }}</span><small>{{ formatTime(row.original.created_at) }} 创建</small></template>
              <template #actions-cell="{ row }"><div :class="styles['pl-row-actions']"><div :class="styles['pl-desktop-actions']"><UTooltip text="详情"><UButton :class="styles['pl-icon-button']" icon="i-lucide-eye" color="neutral" variant="ghost" square :aria-label="`查看 ${row.original.name} 详情`" @click.stop="goToDetail(row.original)" /></UTooltip><UTooltip text="配置"><UButton :class="styles['pl-icon-button']" icon="i-lucide-sliders-horizontal" color="neutral" variant="ghost" square :aria-label="`配置 ${row.original.name}`" @click.stop="goToEdit(row.original)" /></UTooltip><UTooltip text="复制"><UButton :class="styles['pl-icon-button']" icon="i-lucide-copy" color="neutral" variant="ghost" square :aria-label="`复制 ${row.original.name}`" @click.stop="goToDuplicate(row.original)" /></UTooltip><UTooltip :text="row.original.is_enabled ? '停用' : '启用'"><UButton :class="styles['pl-icon-button']" :icon="row.original.is_enabled ? 'i-lucide-power-off' : 'i-lucide-power'" color="neutral" variant="ghost" square :loading="manager.togglingId.value === row.original.id" :aria-label="`${row.original.is_enabled ? '停用' : '启用'} ${row.original.name}`" @click.stop="manager.toggleEnabled(row.original)" /></UTooltip><UTooltip text="删除"><UButton :class="styles['pl-icon-button']" icon="i-lucide-trash-2" color="error" variant="ghost" square :aria-label="`删除 ${row.original.name}`" @click.stop="manager.requestDelete(row.original)" /></UTooltip></div><UDropdownMenu :items="[[
        { label: '详情', icon: 'i-lucide-eye', onSelect: () => goToDetail(row.original) },
        { label: '配置', icon: 'i-lucide-sliders-horizontal', onSelect: () => goToEdit(row.original) },
        { label: '复制', icon: 'i-lucide-copy', onSelect: () => goToDuplicate(row.original) },
        row.original.is_enabled ? { label: '停用', icon: 'i-lucide-power-off', onSelect: () => { void manager.toggleEnabled(row.original) } } : { label: '启用', icon: 'i-lucide-power', onSelect: () => { void manager.toggleEnabled(row.original) } },
        { label: '删除', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => manager.requestDelete(row.original) },
      ]]"><UButton :class="[styles['pl-icon-button'], styles['pl-mobile-actions']]" icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="`${row.original.name} 更多操作`" @click.stop /></UDropdownMenu></div></template>
              <template #empty><UEmpty icon="i-lucide-search-x" :title="manager.loading.value ? '正在加载编排方案' : '没有匹配的编排方案'" :description="manager.loading.value ? '正在读取当前工作区方案列表。' : '调整筛选条件，或创建第一个编排方案。'" variant="naked"><template v-if="!manager.loading.value" #actions><UButton label="清除筛选" variant="link" @click="manager.search.value = ''; manager.enabledFilter.value = 'all'; manager.modeFilter.value = 'all'" /></template></UEmpty></template>
            </ResourceTable>
          </div>
          <ResourcePagination :shown="manager.filteredPlans.value.length" :total="manager.stats.value.all" :items-per-page="0" footer-extra="API CATALOG" />
        </div>
      </div>
    </section>

    <UModal :open="Boolean(manager.pendingDelete.value)" class="ag-confirm-modal" :title="deleteTitle" description="删除后该方案将从当前工作区移除，已绑定的会话需要重新选择编排。" @update:open="(open) => { if (!open) manager.cancelDelete() }">
      <template #body><p :class="styles['pl-modal-copy']">此操作会调用编排方案删除接口，无法在前端撤销。</p></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.cancelDelete" /><UButton label="确认删除" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="manager.confirmDelete" /></template>
    </UModal>
  </main>
  <Transition name="pl-toast"><div v-if="manager.toast.value" :class="styles['pl-toast']" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
