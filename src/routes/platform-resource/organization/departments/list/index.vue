<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ResourcePagination, ResourceTable } from '@/components'
import { useDepartmentManager } from '@/hooks/useDepartmentManager'
import { useOrganizationSupport } from '@/hooks/useOrganizationSupport'
import type { DepartmentResponse } from '@/interfaces/department/model'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'DepartmentResourceList' })

const styles = useCssModule()
const manager = useDepartmentManager()
const support = useOrganizationSupport()
const authStore = useAuthStore()
const router = useRouter()

const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
]
const columns: TableColumn<DepartmentResponse>[] = [
  { id: 'name', header: '部门' },
  { id: 'code', header: '编码' },
  { id: 'parent', header: '上级部门' },
  { id: 'manager', header: '负责人' },
  { id: 'sort', header: '顺序' },
  { id: 'state', header: '状态' },
  { id: 'actions', header: '操作' },
]
const workspaceId = computed(() => authStore.currentWorkspaceId ?? authStore.currentWorkspace?.id ?? null)
const workspaceName = computed(() => authStore.currentWorkspace?.display_name || authStore.currentWorkspace?.name || '未选择工作区')
const deleteTitle = computed(() => manager.pendingDelete.value ? `删除部门「${manager.pendingDelete.value.name}」？` : '删除部门？')

function goToCreate() {
  void router.push({ name: 'department-create' })
}

function goToDetail(item: DepartmentResponse) {
  void router.push({ name: 'department-detail', params: { id: String(item.id) } })
}

function goToEdit(item: DepartmentResponse) {
  void router.push({ name: 'department-edit', params: { id: String(item.id) } })
}

async function onRefresh() {
  await Promise.all([manager.loadAll(workspaceId.value), support.loadSupportData(workspaceId.value)])
  if (!manager.loadingError.value) manager.showToast('部门目录已刷新')
}

function clearFilters() {
  manager.search.value = ''
  manager.enabledFilter.value = 'all'
}

watch(
  workspaceId,
  (id) => {
    manager.resetView()
    support.reset()
    void manager.loadAll(id)
    if (id) void support.loadSupportData(id)
  },
  { immediate: true },
)
</script>

<template>
  <main :class="styles.page">
    <header :class="styles.header">
      <div :class="styles.heading">
        <nav :class="styles.breadcrumb" aria-label="面包屑"><span>组织管理</span><i class="icon icon-chevron-right"></i><strong>组织目录</strong></nav>
        <div :class="styles.titleRow">
          <span :class="styles.titleIcon"><UIcon name="i-lucide-building-2" /></span>
          <div><h1>部门</h1><p>维护组织层级、部门负责人与成员归属。点击行进入部门详情页。</p></div>
          <UBadge label="LIVE API" color="success" variant="subtle" size="xs" />
        </div>
      </div>
      <div :class="styles.headerActions"><UButton label="新建部门" icon="i-lucide-plus" @click="goToCreate" /></div>
    </header>

    <section :class="styles.metrics" aria-label="部门统计">
      <div><span>全部部门</span><strong class="mono">{{ manager.stats.value.all }}</strong></div>
      <div><span>一级部门</span><strong class="mono">{{ manager.stats.value.topLevel }}</strong></div>
      <div><span>已启用</span><strong class="mono">{{ manager.stats.value.enabled }}</strong></div>
      <div><span>目录根节点</span><strong class="mono">{{ manager.stats.value.roots }}</strong></div>
    </section>

    <section :class="styles.workspace">
      <div :class="styles.toolbar">
        <UInput v-model="manager.search.value" :class="styles.search" icon="i-lucide-search" placeholder="搜索部门名称、编码或描述" aria-label="搜索部门">
          <template v-if="manager.search.value" #trailing><UButton icon="i-lucide-x" color="neutral" variant="ghost" square size="xs" aria-label="清空搜索" @click="manager.search.value = ''" /></template>
        </UInput>
        <UTabs v-model="manager.enabledFilter.value" :class="styles.filterTabs" :items="enabledOptions" :content="false" size="sm" aria-label="启用状态筛选" />
        <span :class="styles.workspaceName"><UIcon name="i-lucide-panels-top-left" />{{ workspaceName }}</span>
        <UTooltip text="刷新目录"><UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" square :loading="manager.loading.value" aria-label="刷新目录" @click="onRefresh" /></UTooltip>
      </div>

      <UAlert v-if="manager.loadingError.value" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadingError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: onRefresh }]" />

      <div :class="styles.listPane">
        <ResourceTable :columns="columns" :data="manager.filteredDepartments.value" :loading="manager.loading.value" :row-key="(item: DepartmentResponse) => String(item.id)" :table-class="styles.table" @select="goToDetail">
          <template #name-cell="{ row }"><div :class="styles.primaryCell"><span :class="styles.entityIcon"><UIcon name="i-lucide-building-2" /></span><span><strong>{{ row.original.name }}</strong><small class="mono">DEPT-{{ row.original.id }}</small></span></div></template>
          <template #code-cell="{ row }"><span class="mono">{{ row.original.code || '—' }}</span></template>
          <template #parent-cell="{ row }">{{ row.original.parent_id == null ? '—' : support.departmentName(row.original.parent_id) }}</template>
          <template #manager-cell="{ row }">{{ support.userName(row.original.manager_id) }}</template>
          <template #sort-cell="{ row }"><span class="mono">{{ row.original.sort_order }}</span></template>
          <template #state-cell="{ row }"><UBadge :class="styles.statusBadge" :color="row.original.is_active ? 'success' : 'neutral'" variant="subtle" size="xs">{{ row.original.is_active ? '启用' : '停用' }}</UBadge></template>
          <template #actions-cell="{ row }"><div :class="styles.rowActions"><UTooltip text="详情"><UButton icon="i-lucide-eye" color="neutral" variant="ghost" square :aria-label="`查看 ${row.original.name} 详情`" @click.stop="goToDetail(row.original)" /></UTooltip><UTooltip text="编辑"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" square :aria-label="`编辑 ${row.original.name}`" @click.stop="goToEdit(row.original)" /></UTooltip><UTooltip text="删除"><UButton icon="i-lucide-trash-2" color="error" variant="ghost" square :aria-label="`删除 ${row.original.name}`" @click.stop="manager.requestDelete(row.original)" /></UTooltip></div></template>
          <template #empty><UEmpty icon="i-lucide-building-2" :title="manager.loading.value ? '正在加载部门' : (manager.departments.value.length ? '没有匹配的部门' : '暂无部门')" :description="manager.loading.value ? '正在读取当前工作区目录。' : (manager.departments.value.length ? '调整关键词或启用状态筛选后再试。' : '创建第一个部门来建立组织层级。')" variant="naked"><template v-if="!manager.loading.value && manager.departments.value.length" #actions><UButton label="清除筛选" variant="link" @click="clearFilters" /></template></UEmpty></template>
        </ResourceTable>
      </div>
      <ResourcePagination :shown="manager.filteredDepartments.value.length" :total="manager.stats.value.all" :items-per-page="0" footer-extra="LIVE API" />
    </section>

    <UModal :open="Boolean(manager.pendingDelete.value)" :title="deleteTitle" description="此操作会直接调用后端删除接口，无法在当前页面撤销。" @update:open="(open) => { if (!open) manager.cancelDelete() }">
      <template #body><UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" title="请确认该部门没有仍需保留的成员或下级部门。" /></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.cancelDelete" /><UButton label="确认删除" icon="i-lucide-trash-2" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="manager.confirmDelete" /></template>
    </UModal>
  </main>
  <Transition name="dept-toast"><div v-if="manager.toast.value" :class="styles.toast" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
