<script setup lang="ts">
import { computed, ref, watch, useCssModule } from 'vue'
import { useRouter } from 'vue-router'
import type { TableColumn } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import { FilterPanel, ListCard, RelativeTime, ResourcePagination, ResourceTable } from '@/components'
import { useHighlightFromQuery } from '@/hooks/useSaveFeedback'
import { useSkillManager } from '@/hooks/useSkillManager'
import type { SkillResponse } from '@/interfaces/skill/model'
import { useSkillsStore } from '@/stores/skills'

defineOptions({ name: 'SkillListPanel' })

const styles = useCssModule()
const router = useRouter()
const toast = useToast()
const manager = useSkillManager()
const { state, uploadSkill, removeSkill } = useSkillsStore()
const highlight = useHighlightFromQuery()

const uploadError = ref('')
const uploadFile = ref<File | null>(null)
const rawFileInput = ref<HTMLInputElement | null>(null)
const pendingDeleteName = ref<string | null>(null)
const deleting = ref(false)

/** 列宽由 table-baseline.module.css 的语义列类给出：同类列全站同宽。
 * 「描述」列不设宽，自动占剩余；页面不再自己写 220/92/132/88px。 */
const columns: TableColumn<SkillResponse>[] = [
  { accessorKey: 'name', header: '名称', meta: { class: { th: styles['col-name'], td: styles['col-name'] } } },
  { accessorKey: 'description', header: '描述' },
  { accessorKey: 'version', header: '版本', meta: { class: { th: styles['col-status'], td: styles['col-status'] } } },
  { accessorKey: 'updated_at', header: '更新时间', meta: { class: { th: styles['col-time'], td: styles['col-time'] } } },
  { id: 'actions', header: '操作', meta: { class: { th: styles['col-actions'], td: styles['col-actions'] } } },
]

/** 空态分型：有筛选条件 →「筛选无结果」；否则 →「尚未上传技能包」。 */
const emptyMode = computed<'never' | 'filtered'>(() =>
  manager.hasActiveFilter.value ? 'filtered' : 'never',
)

/** 删除弹窗标题含技能名。 */
const deleteTitle = computed(() =>
  pendingDeleteName.value ? `删除技能「${pendingDeleteName.value}」？` : '删除技能？',
)

async function handleFile(file: File | undefined) {
  if (!file) return
  uploadError.value = ''
  const result = await uploadSkill(file)
  if (result?.error) {
    uploadError.value = result.error
    return
  }
  toast.add({ title: '技能已上传', color: 'success', icon: 'i-lucide-upload' })
  // 上传成功 → 回列表并高亮新行（B-10）。
  const highlightName = result?.highlight
  if (highlightName) {
    void router.push({ name: 'skills', query: { highlight: highlightName } })
  }
}

watch(uploadFile, async (file) => {
  if (!file) return
  await handleFile(file)
  uploadFile.value = null
})

/** 页头主按钮：触发隐藏 file input（与 UFileUpload 同一选择语义）。 */
function onUploadTrigger() {
  rawFileInput.value?.click()
}

async function onRawFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await handleFile(file)
}

function goToDetail(item: SkillResponse) {
  void router.push({ name: 'skill-detail', params: { name: item.name } })
}

function goToEdit(item: SkillResponse) {
  void router.push({ name: 'skill-edit', params: { name: item.name } })
}

function onDeleteRequest(name: string) {
  pendingDeleteName.value = name
}

function onDeleteCancel() {
  pendingDeleteName.value = null
}

function onModalOpenUpdate(open: boolean) {
  if (!open) onDeleteCancel()
}

async function onDeleteConfirm() {
  if (!pendingDeleteName.value || deleting.value) return
  const name = pendingDeleteName.value
  deleting.value = true
  const error = await removeSkill(name)
  deleting.value = false
  if (error) {
    // 失败 toast 带后端真实 message（B-11）。
    toast.add({ title: '删除失败', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  pendingDeleteName.value = null
  toast.add({ title: `技能「${name}」已删除`, color: 'success', icon: 'i-lucide-trash-2' })
  // 删除后当前页无数据则退页纠正，URL 由 useListUrlState 同步。
  if (manager.pagedItems.value.length === 0 && manager.state.page > 1) {
    manager.state.page -= 1
  }
  // 删除的是当前选中项时回列表，并高亮相邻项（B-13：选中态走路由，避免 URL 指向已删除 name）。
  if (state.selectedSkillName === name) {
    const remaining = manager.filteredSkillNames.value
    const deletedIndex = manager.filteredSkillNames.value.indexOf(name)
    // 剩余列表里与被删项同位置（越界则取最后一项）的项作为相邻高亮；无剩余则不带 highlight。
    const neighbor = deletedIndex >= 0 && remaining.length
      ? remaining[Math.min(deletedIndex, remaining.length - 1)]
      : (remaining[0] ?? '')
    const query: Record<string, string> = {}
    if (neighbor) query.highlight = neighbor
    void router.push({ name: 'skills', query })
  }
}
</script>

<template>
  <section :class="styles.panel" aria-label="技能列表">
    <div :class="styles.uploadArea">
      <!-- 隐藏 file input：页头主按钮触发，与 UFileUpload 同一选择语义。 -->
      <input ref="rawFileInput" type="file" accept=".zip" class="sr-only" aria-hidden="true" tabindex="-1" @change="onRawFileChange" />
      <!-- 次要入口：zip 拖拽区（页头主按钮为唯一 CTA）。 -->
      <UFileUpload
        v-model="uploadFile"
        :class="styles.drop"
        accept=".zip"
        variant="area"
        layout="list"
        :preview="false"
        :disabled="state.skillUploading"
        :icon="state.skillUploading ? 'i-lucide-loader-circle' : 'i-lucide-upload'"
        :label="state.skillUploading ? '上传中…' : '拖拽上传技能包（zip ≤ 8MB）'"
        description="拖拽或点击选择 zip 技能包"
        :ui="{ base: 'min-h-20 rounded-md' }"
      />
      <UAlert v-if="uploadError" :class="styles.uploadError" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="uploadError" />
    </div>

    <FilterPanel title="筛选条件" :collapsible="false">
      <template #default>
        <UInput :model-value="manager.state.keyword" :class="styles.search" icon="i-lucide-search" placeholder="搜索名称或描述" aria-label="搜索技能" @update:model-value="(v: unknown) => { manager.state.keyword = String(v ?? '') }" />
        <UFormField label="作用域">
          <USelect :model-value="manager.state.scope" :class="styles.scopeFilter" :items="manager.scopeOptions.value" aria-label="技能作用域" @update:model-value="(v: unknown) => { manager.state.scope = String(v ?? 'all') }" />
        </UFormField>
      </template>
      <template #actions>
        <UButton label="搜索" icon="i-lucide-search" color="primary" @click="manager.onRetry" />
        <UButton v-if="manager.hasActiveFilter.value" label="重置" icon="i-lucide-rotate-ccw" color="neutral" variant="outline" @click="manager.resetFilters" />
      </template>
    </FilterPanel>

    <ListCard title="技能列表" description="上传、筛选与管理当前工作区的技能包。点击名称进入详情。" :total="manager.total.value">
      <template #toolbar>
        <UButton icon="i-lucide-upload" label="上传技能包" color="primary" :loading="state.skillUploading" @click="onUploadTrigger" />
        <UTooltip text="刷新列表">
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" square :loading="manager.loading.value" aria-label="刷新列表" @click="manager.onRetry" />
        </UTooltip>
      </template>

      <UAlert v-if="manager.loadError.value" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: manager.onRetry }]" />

      <ResourceTable
        :columns="columns"
        :data="manager.pagedItems.value"
        :loading="manager.loading.value"
        :row-key="(item: SkillResponse) => String(item.name)"
        :table-class="styles.table"
        :empty-mode="emptyMode"
        :resource-name="'技能包'"
        :highlight-id="highlight"
        @select="goToDetail"
        @clear-filters="manager.resetFilters"
      >
        <template #loading>
          <div :class="styles.skeletonRow">
            <template v-for="r in 5" :key="r">
              <USkeleton :class="styles.skeletonCell" />
            </template>
          </div>
        </template>
        <template #name-cell="{ row }">
          <UButton color="neutral" variant="ghost" :class="styles.skillName" :aria-label="`查看技能 ${row.original.name} 详情`" @click.stop="goToDetail(row.original)">
            <span :class="styles.skillIcon"><UIcon name="i-lucide-puzzle" /></span>
            <span :class="styles.skillCopy">
              <strong>{{ row.original.name }}</strong>
            </span>
          </UButton>
        </template>
        <template #description-cell="{ row }">
          <UTooltip :text="row.original.description || '—'">
            <span :class="styles.desc">{{ row.original.description || '—' }}</span>
          </UTooltip>
        </template>
        <template #version-cell="{ row }"><span class="mono">{{ row.original.version ? `v${row.original.version}` : '—' }}</span></template>
        <template #updated_at-cell="{ row }"><RelativeTime :value="row.original.updated_at" /></template>
        <template #actions-cell="{ row }">
          <div :class="styles.rowActions">
            <UTooltip text="编辑"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" square :aria-label="`编辑 ${row.original.name}`" @click.stop="goToEdit(row.original)" /></UTooltip>
            <UTooltip text="删除"><UButton icon="i-lucide-trash-2" color="error" variant="ghost" square :aria-label="`删除 ${row.original.name}`" @click.stop="onDeleteRequest(row.original.name)" /></UTooltip>
          </div>
        </template>
        <template #empty>
          <UEmpty variant="naked" :icon="emptyMode === 'filtered' ? 'i-lucide-search' : 'i-lucide-inbox'" :title="emptyMode === 'filtered' ? '没有匹配的结果' : '尚未上传技能包'" :description="emptyMode === 'filtered' ? '调整关键词或筛选条件后再试。' : '点击右上角「上传技能包」导入一个 zip 包。'">
            <template #actions><UButton v-if="emptyMode === 'filtered'" icon="i-lucide-rotate-ccw" label="清除筛选" @click="manager.resetFilters" /></template>
          </UEmpty>
        </template>
      </ResourceTable>

      <template #footer>
        <ResourcePagination :shown="manager.pagedItems.value.length" :total="manager.total.value" :page="manager.state.page" :items-per-page="manager.state.pageSize" @update:page="(p: number) => { manager.state.page = p }" @update:items-per-page="(p: number) => { manager.state.pageSize = p }" />
      </template>
    </ListCard>

    <UModal
      :open="pendingDeleteName !== null"
      :title="deleteTitle"
      description="删除后需要重新上传技能包才能恢复。"
      @update:open="onModalOpenUpdate"
    >
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" :disabled="deleting" @click="onDeleteCancel" />
        <UButton color="error" label="确认删除" :loading="deleting" :disabled="deleting" @click="onDeleteConfirm" />
      </template>
    </UModal>
  </section>
</template>

<style module src="./index.module.css"></style>
