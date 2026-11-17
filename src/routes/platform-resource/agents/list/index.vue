<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ActionIconButton, ResourcePagination } from '@/components'
import { useAgentActions } from '@/hooks/useAgentActions'
import { AGENT_PAGE_SIZES, useAgentManager, type AgentEnabledFilter } from '@/hooks/useAgentManager'
import { useHighlightFromQuery } from '@/hooks/useSaveFeedback'
import type { AgentResponse } from '@/interfaces/agent/api'

defineOptions({ name: 'AgentResourceList' })

const router = useRouter()
const manager = useAgentManager()
const actions = useAgentActions()
const highlight = useHighlightFromQuery()
const gridRef = ref<HTMLElement | null>(null)

const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
] as { value: AgentEnabledFilter; label: string }[]

const showSkeleton = computed(() => manager.loading.value && !manager.agents.value.length)

/** 描述为空时退回系统提示词开头；空白折叠成一行，交给两行截断。 */
function summary(agent: AgentResponse) {
  return (agent.description?.trim() || agent.system_prompt.trim()).replace(/\s+/g, ' ')
}

/** 卡片底部：模型名 · N 技能 · M 工具 · K MCP（为 0 的不显示）。 */
function metaText(agent: AgentResponse) {
  const parts = [agent.model_name || '默认模型']
  if (agent.skill_ids?.length) parts.push(`${agent.skill_ids.length} 技能`)
  if (agent.tool_ids?.length) parts.push(`${agent.tool_ids.length} 工具`)
  if (agent.mcp_servers?.length) parts.push(`${agent.mcp_servers.length} MCP`)
  return parts.join(' · ')
}

function goToCreate() {
  void router.push({ name: 'agent-create', params: { module: 'build', resource: 'agents' } })
}

function goToDetail(agent: AgentResponse) {
  void router.push({ name: 'agent-detail', params: { id: String(agent.id) } })
}

function goToEdit(agent: AgentResponse) {
  void router.push({ name: 'agent-edit', params: { id: String(agent.id) } })
}

function goToDuplicate(agent: AgentResponse) {
  void router.push({ name: 'agent-create', params: { module: 'build', resource: 'agents' }, query: { duplicate: String(agent.id) } })
}

/** 卡片键盘访问：只响应卡片自身的 Enter，开关 / 按钮上的回车保留它们自己的行为。 */
function onCardKeydown(event: KeyboardEvent, agent: AgentResponse) {
  if (event.key !== 'Enter' || event.target !== event.currentTarget) return
  event.preventDefault()
  goToDetail(agent)
}

/** 保存后带 ?highlight 回来：等卡片渲染出来再滚入视口。 */
watch(
  () => [highlight.value, manager.pagedItems.value] as const,
  ([id]) => {
    if (!id) return
    void nextTick(() => {
      gridRef.value
        ?.querySelector<HTMLElement>(`[data-agent-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  },
)

async function onDeleteConfirm() {
  if (await actions.confirmDelete()) manager.stepBackIfPageEmpty()
}
</script>

<template>
  <main :class="$style.page">
    <div :class="$style.inner">
      <header :class="$style.header">
        <h1 :class="$style.title">智能体<span v-if="manager.agents.value.length" :class="$style.count">{{ manager.agents.value.length }}</span></h1>
        <div :class="$style.toolbar">
          <UInput v-model="manager.state.keyword" :class="$style.search" icon="i-lucide-search" placeholder="搜索" aria-label="搜索智能体" />
          <USelect
            :model-value="manager.state.enabled"
            :class="$style.status"
            :items="enabledOptions"
            aria-label="启用状态"
            @update:model-value="(value: unknown) => { manager.state.enabled = String(value ?? 'all') as AgentEnabledFilter }"
          />
          <UButton icon="i-lucide-plus" label="新建智能体" color="primary" @click="goToCreate" />
        </div>
      </header>

      <UAlert
        v-if="manager.loadError.value"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="manager.loadError.value"
        :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: manager.load }]"
      />

      <div v-if="showSkeleton" :class="$style.grid" aria-busy="true">
        <USkeleton v-for="n in 6" :key="n" :class="$style.skeleton" />
      </div>

      <UEmpty
        v-else-if="!manager.pagedItems.value.length && !manager.loadError.value"
        :class="$style.empty"
        variant="naked"
        :icon="manager.emptyMode.value === 'filtered' ? 'i-lucide-search-x' : 'i-lucide-bot'"
        :title="manager.emptyMode.value === 'filtered' ? '没有匹配的智能体' : '还没有智能体'"
      >
        <template #actions>
          <UButton v-if="manager.emptyMode.value === 'filtered'" icon="i-lucide-rotate-ccw" label="清除筛选" color="neutral" variant="outline" @click="manager.resetFilters" />
          <UButton v-else icon="i-lucide-plus" label="新建智能体" color="neutral" variant="outline" @click="goToCreate" />
        </template>
      </UEmpty>

      <div v-else-if="manager.pagedItems.value.length" ref="gridRef" :class="$style.grid">
        <UCard
          v-for="agent in manager.pagedItems.value"
          :key="agent.id"
          :data-agent-id="agent.id"
          :class="[$style.card, highlight === String(agent.id) && $style.highlighted]"
          :ui="{ body: 'p-0 sm:p-0' }"
          tabindex="0"
          :aria-label="`查看智能体 ${agent.name}`"
          @click="goToDetail(agent)"
          @keydown="onCardKeydown($event, agent)"
        >
          <div :class="$style.cardInner">
            <div :class="$style.cardHead">
              <UAvatar :class="$style.avatar" icon="i-lucide-bot" size="md" />
              <strong :class="$style.cardName">{{ agent.name }}</strong>
              <div :class="$style.cardActions" @click.stop @keydown.stop>
                <ActionIconButton label="编辑" icon="i-lucide-pencil" @click="goToEdit(agent)" />
                <ActionIconButton label="复制" icon="i-lucide-copy" @click="goToDuplicate(agent)" />
                <ActionIconButton label="删除" icon="i-lucide-trash-2" @click="actions.requestDelete(agent)" />
              </div>
            </div>
            <p v-if="summary(agent)" :class="$style.cardDesc">{{ summary(agent) }}</p>
            <div :class="$style.cardFoot">
              <span :class="$style.cardMeta">{{ metaText(agent) }}</span>
              <div :class="$style.cardSwitch" @click.stop @keydown.stop>
                <USwitch
                  :model-value="agent.is_enabled"
                  :disabled="actions.isToggling(agent.id)"
                  :loading="actions.isToggling(agent.id)"
                  :aria-label="`${agent.is_enabled ? '停用' : '启用'} ${agent.name}`"
                  @update:model-value="(value: boolean) => actions.toggleEnabled(agent, value)"
                />
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <ResourcePagination
        v-if="manager.total.value"
        :class="$style.pagination"
        :shown="manager.pagedItems.value.length"
        :total="manager.total.value"
        :page="manager.clampedPage.value"
        :items-per-page="manager.state.pageSize"
        :page-sizes="AGENT_PAGE_SIZES"
        @update:page="(page: number) => { manager.state.page = page }"
        @update:items-per-page="(size: number) => { manager.state.pageSize = size }"
      />
    </div>

    <UModal
      :open="actions.pendingDelete.value !== null"
      :title="actions.pendingDelete.value ? `删除 ${actions.pendingDelete.value.name}？` : '删除智能体？'"
      description="删除后无法恢复。"
      @update:open="(open: boolean) => { if (!open) actions.cancelDelete() }"
    >
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="actions.deleting.value" @click="actions.cancelDelete" />
        <UButton label="删除" color="error" :loading="actions.deleting.value" :disabled="actions.deleting.value" @click="onDeleteConfirm" />
      </template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
