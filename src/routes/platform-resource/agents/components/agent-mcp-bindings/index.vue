<script setup lang="ts">
import { computed, watch } from 'vue'
import type { McpServerResponse } from '@/interfaces/mcp/api'
import type { AgentMcpBindingDraft } from '@/interfaces/mcp/model'
import { useMcpStore } from '@/stores/mcp'
import { bindableToolNames, isBindableMcpServer } from '@/utils/mcp'

/** 智能体表单「能力」组里的 MCP 绑定：先选 server，再按需为每个 server 勾选工具，不勾表示全部工具。 */
defineOptions({ name: 'AgentMcpBindings' })

const props = defineProps<{
  /** 可绑定的 server，以及已绑定但已停用 / 不可见的。 */
  servers: McpServerResponse[]
  loading?: boolean
  /** MCP 目录加载失败的提示。 */
  error?: string
}>()
const bindings = defineModel<AgentMcpBindingDraft[]>({ required: true })

const mcpStore = useMcpStore()

const serverById = computed(() => new Map(props.servers.map((server) => [server.id, server])))

const serverItems = computed(() => props.servers.map((server) => ({
  label: server.name,
  value: server.id,
  keywords: server.server_key,
  inactive: !isBindableMcpServer(server),
})))

const selectedIds = computed<number[]>({
  get: () => bindings.value.map((binding) => binding.serverId),
  set: (ids) => {
    const current = new Map(bindings.value.map((binding) => [binding.serverId, binding]))
    bindings.value = ids.map((serverId) => current.get(serverId) ?? { serverId, toolNames: [] })
  },
})

function serverName(serverId: number) {
  return serverById.value.get(serverId)?.name ?? `#${serverId}`
}

function toolItems(binding: AgentMcpBindingDraft) {
  return bindableToolNames(mcpStore.state.toolsByServer[binding.serverId] ?? [], binding.toolNames)
}

function toolsLoading(serverId: number) {
  return mcpStore.state.toolsLoadingIds.includes(serverId)
}

function setToolNames(serverId: number, toolNames: string[]) {
  bindings.value = bindings.value.map((binding) => (binding.serverId === serverId ? { serverId, toolNames } : binding))
}

/** 选中 server 后再拉它的工具快照（有缓存时不重复请求）。 */
watch(
  () => bindings.value.map((binding) => binding.serverId),
  (ids) => {
    for (const id of ids) {
      if (!mcpStore.state.toolsByServer[id] && !toolsLoading(id)) void mcpStore.loadTools(id)
    }
  },
  { immediate: true },
)
</script>

<template>
  <UFormField label="MCP" name="mcpServers" :hint="bindings.length ? String(bindings.length) : undefined" :error="error || undefined">
    <USelectMenu
      v-model="selectedIds"
      class="w-full"
      :items="serverItems"
      value-key="value"
      :filter-fields="['label', 'keywords']"
      multiple
      :loading="loading"
      placeholder="选择 MCP server"
      :search-input="{ placeholder: '搜索' }"
    >
      <template #item-label="{ item }">
        {{ item.label }}<span v-if="item.inactive" :class="$style.inactive">不可绑定</span>
      </template>
    </USelectMenu>
    <div v-if="bindings.length" :class="$style.rows">
      <div v-for="binding in bindings" :key="binding.serverId" :class="$style.row">
        <span :class="$style.serverName">{{ serverName(binding.serverId) }}</span>
        <USelectMenu
          :model-value="binding.toolNames"
          :class="$style.tools"
          :items="toolItems(binding)"
          multiple
          :loading="toolsLoading(binding.serverId)"
          placeholder="全部工具"
          :search-input="{ placeholder: '搜索' }"
          :aria-label="`${serverName(binding.serverId)} 可用的工具`"
          @update:model-value="(value: string[]) => setToolNames(binding.serverId, value)"
        />
      </div>
    </div>
  </UFormField>
</template>

<style module src="./index.module.css"></style>
