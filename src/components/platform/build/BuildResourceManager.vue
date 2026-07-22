<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, toRef } from 'vue'
import { useRouter } from 'vue-router'
import type { ResourcePage, ResourceStatus } from '../../../data/platformCatalog'
import BuildResourceFormDrawer from './BuildResourceFormDrawer.vue'
import BuildResourceInspector from './BuildResourceInspector.vue'
import BuildResourceTable from './BuildResourceTable.vue'
import { useBuildResourceManager } from './useBuildResourceManager'

const props = defineProps<{ page: ResourcePage }>()
const router = useRouter()
const manager = useBuildResourceManager(toRef(props, 'page'))
const rangeStart = computed(() => manager.filteredRows.value.length ? (manager.pageNumber.value - 1) * manager.pageSize + 1 : 0)
const rangeEnd = computed(() => Math.min(manager.pageNumber.value * manager.pageSize, manager.filteredRows.value.length))
const summaryStats = computed(() => [
  [manager.rows.value.length, '全部'],
  [manager.rows.value.filter((row) => row.status === 'nominal').length, '正常'],
  [manager.rows.value.filter((row) => row.status === 'warning' || row.status === 'error').length, '需关注'],
  [manager.rows.value.filter((row) => row.status === 'idle').length, '未启用'],
])

function updateSingleStatus(id: string, status: ResourceStatus) {
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
  <main class="br-page">
    <header class="br-page-head">
      <div class="br-heading">
        <nav aria-label="面包屑"><span>构建资源</span><i class="icon icon-chevron-right"></i><strong>{{ page.group }}</strong></nav>
        <div class="br-title-row"><span class="br-title-icon"><i :class="`icon icon-${page.icon}`"></i></span><div><h1>{{ page.title }}</h1><p>{{ page.description }}</p></div></div>
      </div>
      <div class="br-head-actions">
        <button v-if="page.key === 'skills'" class="br-secondary-button" @click="router.push('/skills')"><i class="icon icon-package-open"></i>技能包管理</button>
        <button class="br-primary-button" @click="manager.openCreate"><i class="icon icon-plus"></i>{{ page.action }}</button>
      </div>
    </header>

    <section class="br-metrics" aria-label="资源统计">
      <div v-for="(stat, index) in summaryStats" :key="stat[1]" :class="{ highlight: index === 0 }"><span>{{ stat[1] }}</span><strong>{{ stat[0] }}</strong></div>
    </section>

    <section class="br-workspace">
      <div class="br-toolbar">
        <label class="br-search"><span class="sr-only">搜索 {{ page.title }}</span><i class="icon icon-search"></i><input v-model="manager.search.value" type="search" :placeholder="`搜索名称、ID、负责人或标签`" /><button v-if="manager.search.value" aria-label="清空搜索" @click="manager.search.value = ''"><i class="icon icon-x"></i></button></label>
        <label class="br-filter"><span class="sr-only">状态筛选</span><i class="icon icon-circle-dot"></i><select v-model="manager.statusFilter.value"><option value="all">全部状态</option><option value="nominal">正常</option><option value="warning">需关注</option><option value="idle">未启用</option><option value="error">异常</option></select></label>
        <label class="br-filter"><span class="sr-only">负责人筛选</span><i class="icon icon-users"></i><select v-model="manager.ownerFilter.value"><option value="all">全部负责人</option><option v-for="owner in manager.owners.value" :key="owner" :value="owner">{{ owner }}</option></select></label>
        <label class="br-filter br-sort"><span class="sr-only">排序方式</span><i class="icon icon-arrow-up-down"></i><select v-model="manager.sortBy.value"><option value="name">按名称</option><option value="status">按状态</option><option value="owner">按负责人</option></select></label>
        <button class="br-icon-button bordered" title="刷新" aria-label="刷新资源" @click="manager.showToast('资源目录已刷新')"><i class="icon icon-refresh-cw"></i></button>
        <button class="br-icon-button bordered" title="导出 CSV" aria-label="导出当前列表" @click="manager.exportCsv"><i class="icon icon-download"></i></button>
      </div>

      <div v-if="manager.selectedIds.value.size" class="br-bulkbar" role="toolbar" aria-label="批量操作">
        <strong>已选择 {{ manager.selectedIds.value.size }} 项</strong><span></span>
        <button @click="manager.updateStatus([...manager.selectedIds.value], 'nominal')"><i class="icon icon-circle-check-big"></i>启用</button>
        <button @click="manager.updateStatus([...manager.selectedIds.value], 'idle')"><i class="icon icon-circle-pause"></i>停用</button>
        <button class="danger" @click="manager.requestDelete([...manager.selectedIds.value])"><i class="icon icon-trash-2"></i>删除</button>
        <button class="br-icon-button" aria-label="清除选择" @click="manager.selectedIds.value = new Set()"><i class="icon icon-x"></i></button>
      </div>

      <div class="br-content">
        <div class="br-list-pane">
          <BuildResourceTable :page="page" :rows="manager.visibleRows.value" :selected-id="manager.selectedId.value" :selected-ids="manager.selectedIds.value" :all-selected="manager.allVisibleSelected.value" @select="manager.selectedId.value = $event" @toggle="manager.toggleRow" @toggle-all="manager.toggleAllVisible" @edit="manager.openEdit" @duplicate="manager.openDuplicate" @delete="manager.requestDelete([$event.id])" @reset="manager.resetView" />
          <footer class="br-pagination"><span>共 {{ manager.filteredRows.value.length }} 项，显示 {{ rangeStart }}–{{ rangeEnd }}</span><div><button class="br-icon-button bordered" :disabled="manager.pageNumber.value <= 1" aria-label="上一页" @click="manager.pageNumber.value--"><i class="icon icon-chevron-left"></i></button><span>第 {{ manager.pageNumber.value }} / {{ manager.totalPages.value }} 页</span><button class="br-icon-button bordered" :disabled="manager.pageNumber.value >= manager.totalPages.value" aria-label="下一页" @click="manager.pageNumber.value++"><i class="icon icon-chevron-right"></i></button></div></footer>
        </div>
        <BuildResourceInspector :page="page" :row="manager.selectedRow.value" @close="manager.selectedId.value = ''" @edit="manager.openEdit" @duplicate="manager.openDuplicate" @status="updateSingleStatus" />
      </div>
    </section>

    <BuildResourceFormDrawer v-if="manager.formOpen.value" :page="page" :mode="manager.formMode.value" :draft="manager.draft.value" @close="manager.formOpen.value = false" @save="manager.saveDraft" />
    <div v-if="manager.pendingDeleteIds.value.length" class="br-overlay br-confirm-overlay" @click.self="manager.pendingDeleteIds.value = []"><section class="br-confirm" role="alertdialog" aria-modal="true" aria-labelledby="br-delete-title"><span class="br-danger-icon"><i class="icon icon-trash-2"></i></span><h2 id="br-delete-title">{{ manager.deleteTitle.value }}</h2><p>删除后将从当前工作区移除，相关引用可能需要重新配置。</p><footer><button class="br-secondary-button" @click="manager.pendingDeleteIds.value = []">取消</button><button class="br-danger-button" @click="manager.confirmDelete">确认删除</button></footer></section></div>
    <Transition name="br-toast"><div v-if="manager.toast.value" class="br-toast" role="status"><i class="icon icon-circle-check-big"></i>{{ manager.toast.value }}</div></Transition>
  </main>
</template>

<style src="./build-resource-manager.css"></style>
