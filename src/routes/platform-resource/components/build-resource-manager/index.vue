<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, toRef } from 'vue'
import { useRouter } from 'vue-router'
import { useBuildResourceManager } from '@/hooks/useBuildResourceManager'
import type { ResourcePage, ResourceStatus } from '@/interfaces/platform/model'
import BuildResourceFormDrawer from '../build-resource-form-drawer/index.vue'
import BuildResourceInspector from '../build-resource-inspector/index.vue'
import BuildResourceTable from '../build-resource-table/index.vue'

defineOptions({ name: 'BuildResourceManager' })

const props = defineProps<{ page: ResourcePage }>()
const router = useRouter()
const manager = useBuildResourceManager(toRef(props, 'page'))
const summaryStats = computed(() => [
  [manager.rows.value.length, '全部'],
  [manager.rows.value.filter((row) => row.status === 'nominal').length, '正常'],
  [manager.rows.value.filter((row) => row.status === 'warning' || row.status === 'error').length, '需关注'],
  [manager.rows.value.filter((row) => row.status === 'idle').length, '未启用'],
])
const statusItems = [
  { value: 'all', label: '全部状态' },
  { value: 'nominal', label: '正常' },
  { value: 'warning', label: '需关注' },
  { value: 'idle', label: '未启用' },
  { value: 'error', label: '异常' },
]
const sortItems = [
  { value: 'name', label: '按名称' },
  { value: 'status', label: '按状态' },
  { value: 'owner', label: '按负责人' },
]
const ownerItems = computed(() => [
  { value: 'all', label: '全部负责人' },
  ...manager.owners.value.map((owner) => ({ value: owner, label: owner })),
])
const deleteModalOpen = computed({
  get: () => manager.pendingDeleteIds.value.length > 0,
  set: (open: boolean) => { if (!open) manager.pendingDeleteIds.value = [] },
})

function onSingleStatusChange(id: string, status: ResourceStatus) {
  manager.updateStatus([id], status)
}

function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (manager.pendingDeleteIds.value.length) manager.pendingDeleteIds.value = []
  else if (manager.formOpen.value) manager.formOpen.value = false
  else if (manager.selectedId.value) manager.selectedId.value = ''
}

onMounted(() => window.addEventListener('keydown', handleEscape))
onBeforeUnmount(() => window.removeEventListener('keydown', handleEscape))
</script>

<template>
  <main :class="$style['br-page']">
    <header :class="$style['br-page-head']">
      <div :class="$style['br-heading']">
        <nav aria-label="面包屑"><span>构建资源</span><UIcon name="i-lucide-chevron-right" /><strong>{{ page.group }}</strong></nav>
        <div :class="$style['br-title-row']"><span :class="$style['br-title-icon']"><UIcon :name="`i-lucide-${page.icon}`" /></span><div><h1>{{ page.title }}</h1><p>{{ page.description }}</p></div></div>
      </div>
      <div :class="$style['br-head-actions']">
        <UButton v-if="page.key === 'skills'" :class="$style['br-secondary-button']" label="技能包管理" icon="i-lucide-package-open" color="neutral" variant="outline" @click="router.push('/skills')" />
        <UButton :class="$style['br-primary-button']" :label="page.action" icon="i-lucide-plus" @click="manager.openCreate" />
      </div>
    </header>

    <section :class="$style['br-metrics']" aria-label="资源统计">
      <div v-for="(stat, index) in summaryStats" :key="stat[1]" :class="{ [$style.highlight]: index === 0 }"><span>{{ stat[1] }}</span><strong>{{ stat[0] }}</strong></div>
    </section>

    <section :class="$style['br-workspace']">
      <div :class="$style['br-toolbar']">
        <UInput v-model="manager.search.value" :class="$style['br-search']" icon="i-lucide-search" :placeholder="`搜索名称、ID、负责人或标签`" :aria-label="`搜索${page.title}`">
          <template v-if="manager.search.value" #trailing><UButton icon="i-lucide-x" color="neutral" variant="ghost" square size="xs" aria-label="清空搜索" @click="manager.search.value = ''" /></template>
        </UInput>
        <label :class="$style['br-filter']"><span class="sr-only">状态筛选</span><UIcon name="i-lucide-circle-dot" /><USelect v-model="manager.statusFilter.value" :items="statusItems" aria-label="状态筛选" /></label>
        <label :class="$style['br-filter']"><span class="sr-only">负责人筛选</span><UIcon name="i-lucide-users" /><USelect v-model="manager.ownerFilter.value" :items="ownerItems" aria-label="负责人筛选" /></label>
        <label :class="[$style['br-filter'], $style['br-sort']]"><span class="sr-only">排序方式</span><UIcon name="i-lucide-arrow-up-down" /><USelect v-model="manager.sortBy.value" :items="sortItems" aria-label="排序方式" /></label>
        <UTooltip text="刷新"><UButton :class="[$style['br-icon-button'], $style['bordered']]" icon="i-lucide-refresh-cw" color="neutral" variant="outline" square aria-label="刷新资源" @click="manager.showToast('资源目录已刷新')" /></UTooltip>
        <UTooltip text="导出 CSV"><UButton :class="[$style['br-icon-button'], $style['bordered']]" icon="i-lucide-download" color="neutral" variant="outline" square aria-label="导出当前列表" @click="manager.exportCsv" /></UTooltip>
      </div>

      <div v-if="manager.selectedIds.value.size" :class="$style['br-bulkbar']" role="toolbar" aria-label="批量操作">
        <strong>已选择 {{ manager.selectedIds.value.size }} 项</strong><span></span>
        <UButton label="启用" icon="i-lucide-circle-check-big" color="neutral" variant="ghost" @click="manager.updateStatus([...manager.selectedIds.value], 'nominal')" />
        <UButton label="停用" icon="i-lucide-circle-pause" color="neutral" variant="ghost" @click="manager.updateStatus([...manager.selectedIds.value], 'idle')" />
        <UButton label="删除" icon="i-lucide-trash-2" color="error" variant="ghost" @click="manager.requestDelete([...manager.selectedIds.value])" />
        <UTooltip text="清除选择"><UButton icon="i-lucide-x" color="neutral" variant="ghost" square aria-label="清除选择" @click="manager.selectedIds.value = new Set()" /></UTooltip>
      </div>

      <div :class="$style['br-content']">
        <div :class="$style['br-list-pane']">
          <BuildResourceTable :page="page" :rows="manager.visibleRows.value" :selected-id="manager.selectedId.value" :selected-ids="manager.selectedIds.value" @select="manager.selectedId.value = $event" @toggle="manager.toggleRow" @edit="manager.openEdit" @duplicate="manager.openDuplicate" @delete="manager.requestDelete([$event.id])" @reset="manager.resetView" />
          <footer :class="$style['br-pagination']">
            <span>共 {{ manager.filteredRows.value.length }} 项</span>
            <UPagination v-model:page="manager.pageNumber.value" :items-per-page="manager.pageSize" :total="manager.filteredRows.value.length" size="sm" />
          </footer>
        </div>
        <BuildResourceInspector :page="page" :row="manager.selectedRow.value" @close="manager.selectedId.value = ''" @edit="manager.openEdit" @duplicate="manager.openDuplicate" @status="onSingleStatusChange" />
      </div>
    </section>

    <BuildResourceFormDrawer v-if="manager.formOpen.value" :page="page" :mode="manager.formMode.value" :draft="manager.draft.value" @close="manager.formOpen.value = false" @save="manager.saveDraft" />
    <UModal v-model:open="deleteModalOpen" :title="manager.deleteTitle.value" description="删除后将从当前工作区移除，相关引用可能需要重新配置。" :close="false" :ui="{ content: 'br-confirm-modal', footer: 'br-confirm-footer' }">
      <template #body><span :class="$style['br-danger-icon']"><UIcon name="i-lucide-trash-2" /></span></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" @click="deleteModalOpen = false" /><UButton label="确认删除" color="error" @click="manager.confirmDelete" /></template>
    </UModal>
    <Transition name="br-toast"><UAlert v-if="manager.toast.value" :class="$style['br-toast']" color="success" variant="subtle" icon="i-lucide-circle-check-big" :title="manager.toast.value" /></Transition>
  </main>
</template>

<style module src="./index.module.css"></style>
