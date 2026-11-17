<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ActionIconButton, ResourcePagination } from '@/components'
import { useMcpActions } from '@/hooks/useMcpActions'
import { MCP_PAGE_SIZES, useMcpManager, type McpEnabledFilter } from '@/hooks/useMcpManager'
import { useHighlightFromQuery } from '@/hooks/useSaveFeedback'
import type { McpServerResponse } from '@/interfaces/mcp/api'
import { mcpMetaText, mcpStatus } from '@/utils/mcp'

defineOptions({ name: 'McpResourceList' })

const router = useRouter()
const manager = useMcpManager()
const actions = useMcpActions()
const highlight = useHighlightFromQuery()
const gridRef = ref<HTMLElement | null>(null)

const enabledOptions = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
] as { value: McpEnabledFilter; label: string }[]

const showSkeleton = computed(() => manager.loading.value && !manager.servers.value.length)

function goToCreate() {
  void router.push({ name: 'mcp-create' })
}

function goToDetail(server: McpServerResponse) {
  void router.push({ name: 'mcp-detail', params: { id: String(server.id) } })
}

function goToEdit(server: McpServerResponse) {
  void router.push({ name: 'mcp-edit', params: { id: String(server.id) } })
}

function onCardKeydown(event: KeyboardEvent, server: McpServerResponse) {
  if (event.key !== 'Enter' || event.target !== event.currentTarget) return
  event.preventDefault()
  goToDetail(server)
}

watch(
  () => [highlight.value, manager.pagedItems.value] as const,
  ([id]) => {
    if (!id) return
    void nextTick(() => {
      gridRef.value
        ?.querySelector<HTMLElement>(`[data-server-id="${CSS.escape(id)}"]`)
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
        <h1 :class="$style.title">MCP Servers<span v-if="manager.servers.value.length" :class="$style.count">{{ manager.servers.value.length }}</span></h1>
        <div :class="$style.toolbar">
          <UInput v-model="manager.state.keyword" :class="$style.search" icon="i-lucide-search" placeholder="搜索" aria-label="搜索 MCP server" />
          <USelect
            :model-value="manager.state.enabled"
            :class="$style.status"
            :items="enabledOptions"
            aria-label="启用状态"
            @update:model-value="(value: unknown) => { manager.state.enabled = String(value ?? 'all') as McpEnabledFilter }"
          />
          <UButton icon="i-lucide-plus" label="新建" color="primary" @click="goToCreate" />
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
        :icon="manager.emptyMode.value === 'filtered' ? 'i-lucide-search-x' : 'i-lucide-server-cog'"
        :title="manager.emptyMode.value === 'filtered' ? '没有匹配的 MCP server' : '还没有 MCP server'"
      >
        <template #actions>
          <UButton v-if="manager.emptyMode.value === 'filtered'" icon="i-lucide-rotate-ccw" label="清除筛选" color="neutral" variant="outline" @click="manager.resetFilters" />
          <UButton v-else icon="i-lucide-plus" label="新建" color="neutral" variant="outline" @click="goToCreate" />
        </template>
      </UEmpty>

      <div v-else-if="manager.pagedItems.value.length" ref="gridRef" :class="$style.grid">
        <UCard
          v-for="server in manager.pagedItems.value"
          :key="server.id"
          :data-server-id="server.id"
          :class="[$style.card, highlight === String(server.id) && $style.highlighted]"
          :ui="{ body: 'p-0 sm:p-0' }"
          tabindex="0"
          :aria-label="`查看 MCP server ${server.name}`"
          @click="goToDetail(server)"
          @keydown="onCardKeydown($event, server)"
        >
          <div :class="$style.cardInner">
            <div :class="$style.cardHead">
              <UAvatar :class="$style.avatar" icon="i-lucide-server-cog" size="md" />
              <strong :class="$style.cardName">{{ server.name }}</strong>
              <UTooltip v-if="server.visibility === 'private'" text="仅自己可见">
                <UIcon name="i-lucide-lock" :class="$style.lock" />
                <span class="sr-only">仅自己可见</span>
              </UTooltip>
              <UTooltip :text="mcpStatus(server).label">
                <UIcon :name="mcpStatus(server).icon" :class="$style.statusIcon" :data-tone="mcpStatus(server).tone" />
                <span class="sr-only">{{ mcpStatus(server).label }}</span>
              </UTooltip>
              <div v-if="server.writable" :class="$style.cardActions" @click.stop @keydown.stop>
                <ActionIconButton label="编辑" icon="i-lucide-pencil" @click="goToEdit(server)" />
                <ActionIconButton label="删除" icon="i-lucide-trash-2" @click="actions.requestDelete(server)" />
              </div>
            </div>
            <p :class="[$style.cardDesc, !server.description && $style.cardUrl, !server.description && 'mono']">{{ server.description || server.url }}</p>
            <div :class="$style.cardFoot">
              <span :class="$style.cardMeta">{{ mcpMetaText(server) }}</span>
              <div v-if="server.writable" :class="$style.cardSwitch" @click.stop @keydown.stop>
                <USwitch
                  :model-value="server.is_enabled"
                  :disabled="actions.isToggling(server.id)"
                  :loading="actions.isToggling(server.id)"
                  :aria-label="`${server.is_enabled ? '停用' : '启用'} ${server.name}`"
                  @update:model-value="(value: boolean) => actions.toggleEnabled(server, value)"
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
        :page-sizes="MCP_PAGE_SIZES"
        @update:page="(page: number) => { manager.state.page = page }"
        @update:items-per-page="(size: number) => { manager.state.pageSize = size }"
      />
    </div>

    <UModal
      :open="actions.pendingDelete.value !== null"
      :title="actions.pendingDelete.value ? `删除 ${actions.pendingDelete.value.name}？` : '删除 MCP server？'"
      description="删除后无法恢复，绑定它的智能体会自动解除绑定。"
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
