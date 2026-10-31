<script setup lang="ts">
import { computed, nextTick, ref, useCssModule, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import { FilterPanel, ListCard, RelativeTime, ResourcePagination } from '@/components'
import { useHighlightFromQuery } from '@/hooks/useSaveFeedback'
import { useSkillActions } from '@/hooks/useSkillActions'
import { SKILL_PAGE_SIZES, useSkillManager, type SkillEnabledFilter } from '@/hooks/useSkillManager'
import type { SkillResponse } from '@/interfaces/skill/model'
import SkillBundleModal from '@/routes/skills/components/skill-bundle-modal/index.vue'

defineOptions({ name: 'SkillListPanel' })

const styles = useCssModule()
const router = useRouter()
const toast = useToast()
const manager = useSkillManager()
const actions = useSkillActions()
const highlight = useHighlightFromQuery()

const uploadOpen = ref(false)
const gridRef = ref<HTMLElement | null>(null)

const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
] as { value: SkillEnabledFilter; label: string }[]

/** 空态分型：有筛选条件 →「筛选无结果」；否则 →「尚无技能」。 */
const emptyMode = computed<'never' | 'filtered'>(() =>
  manager.hasActiveFilter.value ? 'filtered' : 'never',
)

const deleteTitle = computed(() =>
  actions.pendingDelete.value ? `删除技能「${actions.pendingDelete.value.name}」？` : '删除技能？',
)

/** ⋯ 菜单：编辑 / 导出 / 删除；无写权限只保留导出。 */
function menuItems(skill: SkillResponse): DropdownMenuItem[][] {
  const exportItem: DropdownMenuItem = {
    label: '导出',
    icon: 'i-lucide-download',
    disabled: actions.exportingId.value !== null,
    onSelect: () => { void actions.exportBundle(skill) },
  }
  if (!actions.canWrite.value) return [[exportItem]]
  return [
    [{ label: '编辑', icon: 'i-lucide-pencil', onSelect: () => goToEdit(skill) }, exportItem],
    [{ label: '删除', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => actions.requestDelete(skill) }],
  ]
}

function goToCreate() {
  void router.push({ name: 'skill-create' })
}

function goToDetail(skill: SkillResponse) {
  void router.push({ name: 'skill-detail', params: { id: String(skill.id) } })
}

function goToEdit(skill: SkillResponse) {
  void router.push({ name: 'skill-edit', params: { id: String(skill.id) } })
}

/** 卡片键盘访问：只响应卡片自身的 Enter，开关/菜单上的回车保留它们自己的行为。 */
function onCardKeydown(event: KeyboardEvent, skill: SkillResponse) {
  if (event.key !== 'Enter' || event.target !== event.currentTarget) return
  event.preventDefault()
  goToDetail(skill)
}

/** 上传成功 → 回列表默认视图并高亮新卡片（新建排在最前）。 */
function onUploaded(skill: SkillResponse) {
  toast.add({ title: `技能「${skill.name}」已上传`, color: 'success', icon: 'i-lucide-upload' })
  void router.push({ name: 'skills', query: { highlight: String(skill.id) } })
}

/** 高亮卡片滚入视口：数据或高亮 id 变化后等卡片渲染出来再定位。 */
watch(
  () => [highlight.value, manager.pagedItems.value] as const,
  ([id]) => {
    if (!id) return
    void nextTick(() => {
      gridRef.value
        ?.querySelector<HTMLElement>(`[data-skill-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  },
)

async function onDeleteConfirm() {
  const removed = await actions.confirmDelete()
  // 删除后当前页无数据则退页纠正，URL 由 useListUrlState 同步。
  if (removed && manager.pagedItems.value.length === 0 && manager.state.page > 1) {
    manager.state.page -= 1
  }
}
</script>

<template>
  <section :class="styles.panel" aria-label="技能列表">
    <!-- 回车与「查询」都走 @search（重拉列表）；「重置」无筛选条件时禁用。 -->
    <FilterPanel
      title="筛选条件"
      :collapsible="false"
      :reset-disabled="!manager.hasActiveFilter.value"
      @search="manager.onRetry"
      @reset="manager.resetFilters"
    >
      <UFormField label="关键字">
        <UInput :model-value="manager.state.keyword" icon="i-lucide-search" placeholder="名称 / 描述" aria-label="搜索技能" @update:model-value="(v: unknown) => { manager.state.keyword = String(v ?? '') }" />
      </UFormField>
      <UFormField label="状态">
        <USelect :model-value="manager.state.enabled" :items="enabledOptions" aria-label="启用状态筛选" @update:model-value="(v: unknown) => { manager.state.enabled = String(v ?? 'all') as SkillEnabledFilter }" />
      </UFormField>
    </FilterPanel>

    <ListCard title="技能">
      <template #toolbar>
        <template v-if="actions.canWrite.value">
          <UButton icon="i-lucide-plus" label="新建" color="primary" @click="goToCreate" />
          <UButton icon="i-lucide-upload" label="上传技能包" color="neutral" variant="outline" @click="uploadOpen = true" />
        </template>
        <UTooltip text="刷新列表">
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" square :loading="manager.loading.value" aria-label="刷新列表" @click="manager.onRetry" />
        </UTooltip>
      </template>

      <UAlert v-if="manager.loadError.value" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="manager.loadError.value" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: manager.onRetry }]" />

      <div v-if="manager.loading.value && !manager.skills.value.length" :class="styles.grid" aria-busy="true">
        <USkeleton v-for="n in 6" :key="n" :class="styles.skeletonCard" />
      </div>

      <UEmpty
        v-else-if="!manager.pagedItems.value.length && !manager.loadError.value"
        :class="styles.empty"
        variant="naked"
        :icon="emptyMode === 'filtered' ? 'i-lucide-search' : 'i-lucide-inbox'"
        :title="emptyMode === 'filtered' ? '没有匹配的结果' : '尚无技能'"
      >
        <template #actions>
          <UButton v-if="emptyMode === 'filtered'" icon="i-lucide-rotate-ccw" label="清除筛选" @click="manager.resetFilters" />
        </template>
      </UEmpty>

      <div v-else ref="gridRef" :class="styles.grid">
        <UCard
          v-for="skill in manager.pagedItems.value"
          :key="skill.id"
          :data-skill-id="skill.id"
          :class="[styles.card, highlight === String(skill.id) && styles.highlighted]"
          :ui="{ body: 'p-0 sm:p-0' }"
          tabindex="0"
          :aria-label="`查看技能 ${skill.name}`"
          @click="goToDetail(skill)"
          @keydown="onCardKeydown($event, skill)"
        >
          <div :class="styles.cardInner">
            <div :class="styles.cardHead">
              <strong :class="[styles.cardName, 'mono']">{{ skill.name }}</strong>
              <span v-if="skill.version" :class="[styles.cardVer, 'mono']">v{{ skill.version }}</span>
              <div :class="styles.cardMenu" @click.stop @keydown.stop>
                <UDropdownMenu :items="menuItems(skill)">
                  <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm" square :aria-label="`${skill.name} 更多操作`" />
                </UDropdownMenu>
              </div>
            </div>
            <p :class="styles.cardDesc">{{ skill.description }}</p>
            <div :class="styles.cardFoot">
              <RelativeTime :value="skill.updated_at" />
              <div :class="styles.cardSwitch" @click.stop @keydown.stop>
                <USwitch
                  :model-value="skill.is_enabled"
                  :disabled="!actions.canWrite.value || actions.isToggling(skill.id)"
                  :loading="actions.isToggling(skill.id)"
                  size="sm"
                  :aria-label="`${skill.is_enabled ? '停用' : '启用'} ${skill.name}`"
                  @update:model-value="(value: boolean) => actions.toggleEnabled(skill, value)"
                />
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <template #footer>
        <ResourcePagination :shown="manager.pagedItems.value.length" :total="manager.total.value" :page="manager.state.page" :items-per-page="manager.state.pageSize" :page-sizes="SKILL_PAGE_SIZES" @update:page="(p: number) => { manager.state.page = p }" @update:items-per-page="(p: number) => { manager.state.pageSize = p }" />
      </template>
    </ListCard>

    <SkillBundleModal v-model:open="uploadOpen" @uploaded="onUploaded" />

    <UModal
      :open="actions.pendingDelete.value !== null"
      :title="deleteTitle"
      description="删除后会解除所有 Agent 对它的绑定。"
      @update:open="(open: boolean) => { if (!open) actions.cancelDelete() }"
    >
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" :disabled="actions.deleting.value" @click="actions.cancelDelete" />
        <UButton color="error" label="确认删除" :loading="actions.deleting.value" :disabled="actions.deleting.value" @click="onDeleteConfirm" />
      </template>
    </UModal>
  </section>
</template>

<style module src="./index.module.css"></style>
