<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, onMounted, ref, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FilterPanel, ListCard, ResourcePagination, ResourceTable } from '@/components'
import { usePeopleManager, USER_LIST_LIMIT, type PersonRow } from '@/hooks/usePeopleManager'
import { useHighlightFromQuery } from '@/hooks/useSaveFeedback'
import type { DepartmentTreeResponse } from '@/interfaces/department/model'
import { useAuthStore } from '@/stores/auth'
import { SELECT_NONE_VALUE } from '@/hooks/useOrganizationSupport'

defineOptions({ name: 'PeopleResourceList' })

const TREE_COLLAPSED_KEY = 'console.list.people.treeCollapsed'
const styles = useCssModule()
const manager = usePeopleManager()
const authStore = useAuthStore()
const router = useRouter()

// 左树折叠态记入 localStorage（A7）。
onMounted(() => {
  if (typeof localStorage !== 'undefined') {
    manager.treeCollapsed.value = localStorage.getItem(TREE_COLLAPSED_KEY) === '1'
  }
})

const highlight = useHighlightFromQuery()
const mobileTreeOpen = ref(false)
/** 批量删除目标（弹窗打开后的集合快照，避免确认时直接读 selectedIds）。 */
const batchTargets = ref<PersonRow[]>([])

const membershipOptions = [
  { value: 'all', label: '全部' },
  { value: 'member', label: '工作区成员' },
  { value: 'admin', label: '管理员' },
  { value: 'non-member', label: '非成员' },
] as { value: 'all' | 'member' | 'admin' | 'non-member'; label: string }[]

const departmentFilterOptions = computed(() => [
  { value: SELECT_NONE_VALUE, label: '全部部门' },
  ...manager.departmentOptions.value.filter((option) => option.value !== SELECT_NONE_VALUE),
])

/** 列宽由 table-baseline.module.css 的语义列类给出（col-name / col-status / col-time /
 * col-actions 随 ../shared 的 @import 进入本页），其余未标注的列自动分摊剩余宽度。 */
const columns: TableColumn<PersonRow>[] = [
  { id: 'name', header: '人员', meta: { class: { th: styles['col-name'], td: styles['col-name'] } } },
  { id: 'account', header: '账号' },
  { id: 'department', header: '部门' },
  { id: 'phone', header: '手机' },
  { id: 'state', header: '状态', meta: { class: { th: styles['col-status'], td: styles['col-status'] } } },
  { id: 'createdAt', header: '创建时间', meta: { class: { th: styles['col-time'], td: styles['col-time'] } } },
  { id: 'actions', header: '操作', meta: { class: { th: styles['col-actions'], td: styles['col-actions'] } } },
]

const workspaceId = computed(() => authStore.currentWorkspaceId ?? authStore.currentWorkspace?.id ?? null)
const workspaceName = computed(() => authStore.currentWorkspace?.display_name || authStore.currentWorkspace?.name || '未选择工作区')
const deleteTitle = computed(() => {
  const target = manager.pendingDelete.value
  return target ? `删除用户「${target.full_name || target.username}」？` : '删除用户？'
})
/**
 * 树选中：state.departmentId 与 store.state.selectedId 不共享（列表页不触发详情请求），
 * 这里维护一个本地树选中 set（UTree modelValue 受控，选中的项来自 departmentId 反查）。
 */
const treeSelected = computed<TreeItemOption[]>(() => {
  if (!manager.state.departmentId) return []
  const selected = manager.departmentTree.value.find((node) => String(node.id) === manager.state.departmentId)
  return selected ? [toTreeItem(selected)] : []
})
/** 左树数据（UTree items）：label / value / children。 */
const treeItems = computed(() => manager.departmentTree.value.map(toTreeItem))

interface TreeItemOption {
  label: string
  value: string
  icon?: string
  children?: TreeItemOption[]
}

function toTreeItem(node: DepartmentTreeResponse): TreeItemOption {
  return {
    label: node.name,
    value: String(node.id),
    icon: node.children?.length ? 'i-lucide-folder-open' : 'i-lucide-circle',
    children: (node.children ?? []).map(toTreeItem),
  }
}

function personName(item: PersonRow) {
  return item.full_name || item.username
}

function goToCreate() {
  void router.push({ name: 'person-create' })
}

function goToDetail(item: PersonRow) {
  void router.push({ name: 'person-detail', params: { id: String(item.id) } })
}

function goToEdit(item: PersonRow) {
  void router.push({ name: 'person-edit', params: { id: String(item.id) } })
}

async function onRefresh() {
  await manager.loadAll(workspaceId.value)
  if (!manager.loadingError.value) manager.showToast('人员目录已刷新')
}

function onApplyFilters() {
  void manager.loadAll(workspaceId.value)
}

function onResetFilters() {
  manager.clearFilters()
  void manager.loadAll(workspaceId.value)
}

/** 左树点击：写 departmentId 且 page 归 1（A2）。 */
function onTreeSelect(item: TreeItemOption) {
  manager.selectDepartment(String(item.value ?? ''))
}

function toggleTree() {
  manager.treeCollapsed.value = !manager.treeCollapsed.value
  if (typeof localStorage !== 'undefined') {
    if (manager.treeCollapsed.value) localStorage.setItem(TREE_COLLAPSED_KEY, '1')
    else localStorage.removeItem(TREE_COLLAPSED_KEY)
  }
}

/** 批量删除：选中集合快照（已剔除自己），供确认弹窗渲染人数与姓名。 */
function requestBatchDelete() {
  batchTargets.value = manager.selectedPeople()
}

function onBatchDeleteConfirm() {
  void manager.deleteSelected().then(() => {
    batchTargets.value = []
  })
}

function onPage(page: number) {
  manager.page.value = page
}

function onPageSize(size: number) {
  manager.pageSize.value = size
}

watch(
  workspaceId,
  (id) => {
    manager.resetView()
    void manager.loadAll(id)
  },
  { immediate: true },
)
</script>

<template>
  <main :class="styles.page">
    <div :class="styles.layout">
      <!-- 左部门树：范围导航，独立于右侧筛选。 -->
      <aside v-if="!manager.treeCollapsed.value" :class="styles.deptPanel" aria-label="部门结构">
        <header :class="styles.treeHeader">
          <span :class="styles.treeTitle"><UIcon name="i-lucide-folder-tree" />部门结构</span>
          <button type="button" :class="styles.treeToggleBtn" :aria-label="'收起部门树'" @click="toggleTree">
            <UIcon name="i-lucide-panel-left-close" />
          </button>
        </header>
        <div :class="styles.treeSearch">
          <UInput v-model="manager.treeSearch.value" icon="i-lucide-search" size="sm" placeholder="搜索部门名称" aria-label="搜索部门">
            <template v-if="manager.treeSearch.value" #trailing>
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" square size="xs" aria-label="清空部门搜索" @click="manager.treeSearch.value = ''" />
            </template>
          </UInput>
        </div>
        <div :class="styles.treeBody">
          <UTree
            :items="treeItems"
            :model-value="treeSelected"
            label-key="label"
            :get-key="(item: TreeItemOption) => item.value"
            :multiple="true"
            :selection-behavior="'replace'"
            @select="(_: unknown, item: TreeItemOption) => onTreeSelect(item)"
          />
          <UEmpty v-if="!treeItems.length" icon="i-lucide-folder-tree" title="暂无部门" description="创建部门后可按范围筛选人员。" variant="naked" />
        </div>
      </aside>

      <!-- <1200px 窄屏：左树收进抽屉。 -->
      <USlideover v-model:open="mobileTreeOpen" :close="{ color: 'neutral', variant: 'ghost' }" close-icon="i-lucide-x" :ui="{ content: 'resource-slideover', header: 'resource-slideover-header', body: 'resource-slideover-body', footer: 'resource-slideover-footer' }">
        <template #title>
          <div :class="styles.treeTitle"><UIcon name="i-lucide-folder-tree" />部门结构</div>
        </template>
        <template #body>
          <div :class="styles.treeSearch">
            <UInput v-model="manager.treeSearch.value" icon="i-lucide-search" size="sm" placeholder="搜索部门名称" aria-label="搜索部门">
              <template v-if="manager.treeSearch.value" #trailing>
                <UButton icon="i-lucide-x" color="neutral" variant="ghost" square size="xs" aria-label="清空部门搜索" @click="manager.treeSearch.value = ''" />
              </template>
            </UInput>
          </div>
          <UTree
            :items="treeItems"
            :model-value="treeSelected"
            label-key="label"
            :get-key="(item: TreeItemOption) => item.value"
            :multiple="true"
            :selection-behavior="'replace'"
            @select="(_: unknown, item: TreeItemOption) => { onTreeSelect(item); mobileTreeOpen = false }"
          />
        </template>
      </USlideover>

      <!-- 主列：筛选卡 + 列表卡 + 分页。 -->
      <div :class="styles.main">
        <FilterPanel
          title="筛选条件"
          :collapsible="true"
          @search="onApplyFilters"
          @reset="onResetFilters"
        >
          <template #default>
            <div :class="styles.filterForms">
              <UFormField label="用户名称"><UInput v-model="manager.state.keyword" icon="i-lucide-search" placeholder="搜索用户名 / 邮箱 / 姓名 / 手机号" aria-label="搜索人员" @keydown.enter="onApplyFilters" /></UFormField>
              <!-- 窄屏替代入口：部门级联（A7）。 -->
              <UFormField label="部门">
                <USelect
                  :model-value="manager.state.departmentId || SELECT_NONE_VALUE"
                  :items="departmentFilterOptions"
                  aria-label="部门"
                  @update:model-value="(value: unknown) => manager.selectDepartment(value === SELECT_NONE_VALUE ? '' : String(value ?? ''))"
                />
              </UFormField>
            </div>
            <div :class="styles.filterTabsRow">
              <UTabs v-model="manager.state.membership" :class="styles.filterTabs" :items="membershipOptions" :content="false" size="sm" aria-label="工作区归属筛选" />
              <span :class="styles.workspaceName"><UIcon name="i-lucide-panels-top-left" />{{ workspaceName }}</span>
            </div>
          </template>
        </FilterPanel>

        <ListCard title="人员" description="查看用户目录与其在当前工作区的部门、角色、岗位归属；点击行进入人员详情页。" :total="manager.total.value">
          <template #toolbar>
            <UButton label="邀请人员" icon="i-lucide-user-plus" color="primary" @click="goToCreate" />
            <UButton label="部门" icon="i-lucide-folder-tree" color="neutral" variant="outline" :class="styles.mobileTreeBtn" @click="mobileTreeOpen = true" />
            <UTooltip :text="manager.selectedTotal.value ? '删除选中人员' : '请先勾选人员'">
              <UButton
                label="批量删除"
                icon="i-lucide-trash-2"
                color="error"
                variant="outline"
                :disabled="manager.selectedTotal.value === 0"
                @click="requestBatchDelete"
              />
            </UTooltip>
            <UDropdownMenu :items="[
              { label: manager.treeCollapsed.value ? '展开部门树' : '收起部门树', icon: 'i-lucide-panel-left', onSelect: toggleTree },
              { label: '刷新目录', icon: 'i-lucide-refresh-cw', onSelect: onRefresh },
            ]">
              <UButton label="更多" icon="i-lucide-ellipsis" color="neutral" variant="outline" aria-label="更多操作" />
            </UDropdownMenu>
          </template>
          <template #tools>
            <UTooltip text="刷新目录">
              <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" square :loading="manager.loading.value" aria-label="刷新目录" @click="onRefresh" />
            </UTooltip>
          </template>

          <UAlert v-if="manager.loadingError.value" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadingError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: onRefresh }]" />
          <UAlert v-if="manager.userLimitReached.value" :class="styles.limitAlert" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="`用户目录已达单次拉取上限 ${USER_LIST_LIMIT}`" description="后端暂未提供分页 total，超出部分暂不展示，可用搜索精确定位（待后端补齐）。" />

          <ResourceTable
            :columns="columns"
            :data="manager.pagedItems.value"
            :loading="manager.loading.value"
            :row-key="(item: PersonRow) => String(item.id)"
            :table-class="styles.table"
            :selectable="true"
            v-model:selected="manager.selectedIds.value"
            :highlight-id="highlight"
            :empty-mode="manager.state.keyword || manager.state.departmentId ? 'filtered' : 'never'"
            :resource-name="'人员'"
            @select="goToDetail"
            @clear-filters="onResetFilters"
          >
            <template #name-cell="{ row }">
              <div :class="styles['primary-cell']">
                <UAvatar :alt="personName(row.original)" :src="row.original.avatar_url || undefined" size="sm" />
                <span>
                  <strong>{{ personName(row.original) }}<UBadge v-if="manager.isSelf(row.original.id)" :class="styles.mineBadge" label="我" color="primary" variant="subtle" size="xs" /></strong>
                  <small class="mono">@{{ row.original.username }} · #{{ row.original.id }}</small>
                </span>
              </div>
            </template>
            <template #account-cell="{ row }"><span :class="styles.emailText">{{ row.original.email }}</span></template>
            <template #department-cell="{ row }">
              <template v-if="row.original.membership">{{ manager.departmentName(row.original.membership.department_id) }}</template>
              <template v-else>—</template>
            </template>
            <template #phone-cell="{ row }">{{ row.original.phone || '—' }}</template>
            <!-- 状态列：后端无用户级启停接口，退化为只读徽章（A4，待后端补齐）。 -->
            <template #state-cell="{ row }">
              <StatusBadge :enabled="!row.original.suspended" :label="row.original.suspended ? '停用' : '正常'" />
            </template>
            <template #createdAt-cell="{ row }"><RelativeTime :value="row.original.created_at" /></template>
            <template #actions-cell="{ row }">
              <div :class="styles.rowActions">
                <UTooltip text="编辑"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" square :aria-label="`编辑 ${personName(row.original)}`" @click.stop="goToEdit(row.original)" /></UTooltip>
                <UTooltip :text="manager.canDeletePerson(row.original) ? '删除' : '不能删除当前登录用户'">
                  <UButton v-if="manager.canDeletePerson(row.original)" icon="i-lucide-trash-2" color="error" variant="ghost" square :aria-label="`删除 ${personName(row.original)}`" @click.stop="manager.requestDelete(row.original)" />
                </UTooltip>
                <UDropdownMenu :items="[
                  { label: '查看详情', icon: 'i-lucide-eye', onSelect: () => goToDetail(row.original) },
                ]">
                  <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="`${personName(row.original)} 更多操作`" />
                </UDropdownMenu>
              </div>
            </template>
            <template #empty>
              <UEmpty icon="i-lucide-user-round" :title="manager.loading.value ? '正在加载人员' : (manager.people.value.length ? '没有匹配的人员' : '暂无人员')" :description="manager.loading.value ? '正在读取用户目录与当前工作区成员。' : (manager.state.keyword || manager.state.departmentId ? '调整关键词、部门或归属筛选后再试。' : '创建用户或邀请成员加入当前工作区。')" variant="naked">
                <template v-if="!manager.loading.value && (manager.people.value.length || manager.state.keyword)" #actions><UButton label="清除筛选" variant="link" @click="onResetFilters" /></template>
              </UEmpty>
            </template>
          </ResourceTable>

          <template #footer>
            <ResourcePagination
              :shown="manager.pagedItems.value.length"
              :total="manager.total.value"
              :page="manager.page.value"
              :items-per-page="manager.pageSize.value"
              @update:page="onPage"
              @update:items-per-page="onPageSize"
            />
          </template>
        </ListCard>
      </div>
    </div>

    <!-- 单行删除确认。 -->
    <UModal :open="Boolean(manager.pendingDelete.value)" :title="deleteTitle" description="此操作会直接调用后端删除接口，无法在当前页面撤销。" @update:open="(open) => { if (!open) manager.cancelDelete() }">
      <template #body><UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" title="删除后该用户的工作区成员关系与归属一并失效，请确认没有仍需保留的引用。" /></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="manager.cancelDelete" /><UButton label="确认删除" icon="i-lucide-trash-2" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="manager.confirmDelete" /></template>
    </UModal>

    <!-- 批量删除确认：列人数与前 3 个姓名（已剔除自己）。 -->
    <UModal :open="batchTargets.length > 0" title="批量删除用户？" description="将移出用户目录与其在当前工作区的成员关系，无法在当前页面撤销。" @update:open="(open) => { if (!open) batchTargets = [] }">
      <template #body>
        <UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" title="请确认没有仍需保留的引用。">
          <template #description>
            <span>将删除 {{ batchTargets.length }} 位用户：</span>
            <span class="mono">{{ batchTargets.slice(0, 3).map(personName).join('、') }}{{ batchTargets.length > 3 ? ' 等' : '' }}</span>
          </template>
        </UAlert>
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="manager.deleting.value" @click="batchTargets = []" />
        <UButton label="确认删除" icon="i-lucide-trash-2" color="error" :loading="manager.deleting.value" :disabled="manager.deleting.value" @click="onBatchDeleteConfirm" />
      </template>
    </UModal>
  </main>
  <Transition name="dept-toast"><div v-if="manager.toast.value" :class="styles.toast" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
