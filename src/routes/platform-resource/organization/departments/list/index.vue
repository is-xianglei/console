<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, useCssModule, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FilterPanel, ListCard, ResourceTable } from '@/components'
import { useDepartmentManager, type DepartmentEnabledFilter, type DepartmentTreeRow } from '@/hooks/useDepartmentManager'
import { useOrganizationSupport } from '@/hooks/useOrganizationSupport'
import { useHighlightFromQuery } from '@/hooks/useSaveFeedback'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'DepartmentResourceList' })

const styles = useCssModule()
const manager = useDepartmentManager()
const support = useOrganizationSupport()
const authStore = useAuthStore()
const router = useRouter()

const highlight = useHighlightFromQuery()
const tableRef = ref<{ expandAll: () => void; collapseAll: () => void } | null>(null)

const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
] as { value: DepartmentEnabledFilter; label: string }[]

/** 列宽由 table-baseline.module.css 的语义列类给出（col-name / col-status / col-time /
 * col-actions 随 ../shared 的 @import 进入本页），其余未标注的列自动分摊剩余宽度。 */
const columns: TableColumn<DepartmentTreeRow>[] = [
  { id: 'name', header: '部门名称', meta: { class: { th: styles['col-name'], td: styles['col-name'] } } },
  { id: 'code', header: '编码' },
  { id: 'manager', header: '负责人' },
  { id: 'sort', header: '排序' },
  { id: 'state', header: '状态', meta: { class: { th: styles['col-status'], td: styles['col-status'] } } },
  { id: 'createdAt', header: '创建时间', meta: { class: { th: styles['col-time'], td: styles['col-time'] } } },
  { id: 'actions', header: '操作', meta: { class: { th: styles['col-actions'], td: styles['col-actions'] } } },
]

/** 树形行 children 展开（UTable getSubRows）。 */
function treeChildrenKey(row: DepartmentTreeRow): DepartmentTreeRow[] | undefined {
  return (row.children as DepartmentTreeRow[] | undefined)
}

const workspaceId = computed(() => authStore.currentWorkspaceId ?? authStore.currentWorkspace?.id ?? null)
const workspaceName = computed(() => authStore.currentWorkspace?.display_name || authStore.currentWorkspace?.name || '未选择工作区')
const deleteTitle = computed(() => manager.pendingDelete.value ? `删除部门「${manager.pendingDelete.value.name}」？` : '删除部门？')
/** 删除确认是否可点：无阻断信息时允许；有阻断信息且非「仅后端原因」时禁用。 */
const deleteConfirmDisabled = computed(() => Boolean(manager.deleteBlockers.value && (manager.deleteBlockers.value.childrenCount > 0 || manager.deleteBlockers.value.memberCount > 0)))

function goToCreate() {
  void router.push({ name: 'department-create' })
}

function goToCreateChild(item: DepartmentTreeRow) {
  void router.push({ name: 'department-create', query: { parent: String(item.id) } })
}

function goToDetail(item: DepartmentTreeRow) {
  void router.push({ name: 'department-detail', params: { id: String(item.id) } })
}

function goToEdit(item: DepartmentTreeRow) {
  void router.push({ name: 'department-edit', params: { id: String(item.id) } })
}

function goToDeleteDetail() {
  const target = manager.pendingDelete.value
  if (target) goToDetail(target)
}

function onToggleExpand() {
  if (tableRef.value) {
    if (manager.state.collapsed) tableRef.value.expandAll()
    else tableRef.value.collapseAll()
  }
  manager.toggleCollapsed()
}

async function onRefresh() {
  await Promise.all([manager.loadAll(workspaceId.value), support.loadSupportData(workspaceId.value)])
  if (!manager.loadingError.value) manager.showToast('部门目录已刷新')
}

function onApplyFilters() {
  void manager.loadAll(workspaceId.value)
}

function onResetFilters() {
  manager.resetView()
  void manager.loadAll(workspaceId.value)
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
    <FilterPanel
      title="筛选条件"
      :collapsible="true"
      @search="onApplyFilters"
      @reset="onResetFilters"
    >
      <template #default>
        <div :class="styles.filterRow">
          <UInput
            v-model="manager.state.keyword"
            :class="styles.search"
            icon="i-lucide-search"
            placeholder="搜索部门名称、编码或描述"
            aria-label="搜索部门"
          >
            <template v-if="manager.state.keyword" #trailing>
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" square size="xs" aria-label="清空搜索" @click="manager.state.keyword = ''" />
            </template>
          </UInput>
          <UTabs
            v-model="manager.state.enabledFilter"
            :class="styles.filterTabs"
            :items="enabledOptions"
            :content="false"
            size="sm"
            aria-label="启用状态筛选"
          />
          <span :class="styles.workspaceName"><UIcon name="i-lucide-panels-top-left" />{{ workspaceName }}</span>
        </div>
      </template>
    </FilterPanel>

    <ListCard title="部门列表" description="支持树状层级维护、负责人指定和部门状态管理。点击行进入部门详情页。" :total="manager.allCount.value">
      <template #toolbar>
        <UButton label="新建部门" icon="i-lucide-plus" color="primary" @click="goToCreate" />
        <UButton
          :label="manager.state.collapsed ? '全部展开' : '全部折叠'"
          :icon="manager.state.collapsed ? 'i-lucide-chevrons-down-up' : 'i-lucide-chevrons-up-down'"
          color="neutral"
          variant="outline"
          @click="onToggleExpand"
        />
        <UTooltip text="刷新目录">
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" square :loading="manager.loading.value" aria-label="刷新目录" @click="onRefresh" />
        </UTooltip>
      </template>

      <UAlert v-if="manager.loadingError.value" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadingError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: onRefresh }]" />

      <ResourceTable
        ref="tableRef"
        :columns="columns"
        :data="manager.rows.value"
        :loading="manager.loading.value"
        :row-key="(item: DepartmentTreeRow) => String(item.id)"
        :table-class="styles.table"
        :tree-children-key="treeChildrenKey"
        :highlight-id="highlight"
        :empty-mode="manager.state.keyword ? 'filtered' : 'never'"
        :resource-name="'部门'"
        @select="goToDetail"
        @clear-filters="onResetFilters"
      >
        <template #name-cell="{ row }">
          <div :class="[styles['primary-cell'], { [styles.ancestor]: row.original.ancestorOfMatch, [styles.matched]: row.original.match, [styles.subtreeInactive]: row.original.subtreeInactive }]">
            <span :class="styles['entity-icon']"><UIcon name="i-lucide-building-2" /></span>
            <span>
              <strong>{{ row.original.name }}</strong>
              <small class="mono">DEPT-{{ row.original.id }}</small>
            </span>
          </div>
        </template>
        <template #code-cell="{ row }"><span class="mono">{{ row.original.code || '—' }}</span></template>
        <template #manager-cell="{ row }">{{ support.userName(row.original.manager_id) }}</template>
        <template #sort-cell="{ row }"><span class="mono">{{ row.original.sort_order }}</span></template>
        <template #state-cell="{ row }"><UBadge :class="styles.statusBadge" :color="row.original.is_active ? 'success' : 'neutral'" variant="subtle" size="xs">{{ row.original.is_active ? '启用' : '停用' }}</UBadge></template>
        <template #createdAt-cell="{ row }"><RelativeTime :value="row.original.created_at" /></template>
        <template #actions-cell="{ row }">
          <div :class="styles.rowActions">
            <UTooltip text="编辑"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" square :aria-label="`编辑 ${row.original.name}`" @click.stop="goToEdit(row.original)" /></UTooltip>
            <UTooltip text="新增子部门"><UButton icon="i-lucide-folder-plus" color="neutral" variant="ghost" square :aria-label="`为 ${row.original.name} 新增子部门`" @click.stop="goToCreateChild(row.original)" /></UTooltip>
            <UTooltip text="删除"><UButton icon="i-lucide-trash-2" color="error" variant="ghost" square :aria-label="`删除 ${row.original.name}`" @click.stop="manager.requestDelete(row.original)" /></UTooltip>
          </div>
        </template>
        <template #empty>
          <UEmpty icon="i-lucide-building-2" :title="manager.loading.value ? '正在加载部门' : (manager.departments.value.length ? '没有匹配的部门' : '暂无部门')" :description="manager.loading.value ? '正在读取当前工作区目录。' : (manager.departments.value.length ? '调整关键词或启用状态筛选后再试。' : '创建第一个部门来建立组织层级。')" variant="naked">
            <template v-if="!manager.loading.value && manager.departments.value.length" #actions><UButton label="清除筛选" variant="link" @click="onResetFilters" /></template>
          </UEmpty>
        </template>
      </ResourceTable>

      <template #footer>
        <div :class="styles.countBar">共 {{ manager.allCount.value }} 个部门<span v-if="manager.state.keyword"> · 匹配 {{ manager.rows.value.length }} 个</span></div>
      </template>
    </ListCard>

    <UModal :open="Boolean(manager.pendingDelete.value)" :title="deleteTitle" description="此操作会直接调用后端删除接口，无法在当前页面撤销。" @update:open="(open) => { if (!open) manager.cancelDelete() }">
      <template #body>
        <div v-if="manager.blockerBusyId.value != null" :class="styles.blockerBusy">
          <UIcon name="i-lucide-loader-circle" class="animate-spin" />
          <span>正在检查下级部门与直属成员…</span>
        </div>
        <UAlert v-else-if="manager.deleteBlockers.value" color="error" variant="subtle" icon="i-lucide-triangle-alert" title="该部门仍有依赖，无法删除">
          <template #description>
            <ul :class="styles.blockerList">
              <li v-if="manager.deleteBlockers.value.childrenCount > 0">存在下级部门 {{ manager.deleteBlockers.value.childrenCount }} 个</li>
              <li v-if="manager.deleteBlockers.value.memberCount > 0">存在直属成员 {{ manager.deleteBlockers.value.memberCount }} 人</li>
              <li v-if="manager.deleteBlockers.value.reason">{{ manager.deleteBlockers.value.reason }}</li>
            </ul>
            <UButton label="前往部门详情处理" color="neutral" variant="link" size="sm" @click="goToDeleteDetail" />
          </template>
        </UAlert>
        <UAlert v-else color="error" variant="subtle" icon="i-lucide-triangle-alert" title="删除后该部门的下级与成员关系一并失效，请确认没有仍需保留的引用。" />
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.cancelDelete" />
        <UButton label="确认删除" icon="i-lucide-trash-2" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value || deleteConfirmDisabled" @click="manager.confirmDelete" />
      </template>
    </UModal>
  </main>
  <Transition name="dept-toast"><div v-if="manager.toast.value" :class="styles.toast" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
