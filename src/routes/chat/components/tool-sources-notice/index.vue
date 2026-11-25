<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from '@nuxt/ui/composables'
import type { ButtonProps } from '@nuxt/ui'
import type { ToolSourceFault } from '@/interfaces/console/model'
import { useMcpStore } from '@/stores/mcp'
import { rememberOAuthServer } from '@/utils/mcp-oauth'
import { faultLabel, sourceServerKey } from '@/utils/mcp-tool'

/** 本轮回复顶部：列出回合开始时不可用的 MCP server，未授权的直接去授权，其他故障跳到 server 详情。 */
defineOptions({ name: 'ToolSourcesNotice' })

const props = defineProps<{ faults: ToolSourceFault[] }>()

const route = useRoute()
const router = useRouter()
const toast = useToast()
const mcpStore = useMcpStore()
const authorizingId = ref<number | null>(null)

const rows = computed(() => props.faults.map((fault) => {
  const server = fault.server_id == null ? undefined : mcpStore.state.items.find((item) => item.id === fault.server_id)
  const authRequired = fault.kind === 'auth_required'
  const actions: ButtonProps[] = fault.server_id == null
    ? []
    : authRequired
      ? [{
          label: '去授权',
          color: 'neutral',
          variant: 'outline',
          size: 'xs',
          loading: authorizingId.value === fault.server_id,
          disabled: authorizingId.value != null,
          onClick: () => authorize(fault.server_id!),
        }]
      : [{
          label: '查看',
          color: 'neutral',
          variant: 'ghost',
          size: 'xs',
          onClick: () => view(fault.server_id!),
        }]
  return {
    key: `${fault.source}|${fault.kind}`,
    fault,
    name: server?.name ?? sourceServerKey(fault.source),
    label: faultLabel(fault),
    icon: authRequired ? 'i-lucide-key-round' : 'i-lucide-circle-x',
    color: authRequired ? 'warning' as const : 'error' as const,
    actions,
  }
}))

/** 名称来自 MCP 列表；聊天页没加载过时补拉一次，拉不到就显示 server_key。 */
onMounted(() => {
  const missing = props.faults.some((fault) => fault.server_id != null && !mcpStore.state.items.some((item) => item.id === fault.server_id))
  if (missing && !mcpStore.state.loading) void mcpStore.loadServers()
})

/** 授权完成后回调页把用户带回当前会话。 */
async function authorize(serverId: number) {
  if (authorizingId.value != null) return
  authorizingId.value = serverId
  const { url, error } = await mcpStore.beginAuthorization(serverId)
  if (error || !url) {
    authorizingId.value = null
    toast.add({ title: '发起授权失败', description: error ?? undefined, color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  rememberOAuthServer(serverId, route.fullPath)
  window.location.assign(url)
}

function view(serverId: number) {
  void router.push({ name: 'mcp-detail', params: { id: String(serverId) } })
}
</script>

<template>
  <div :class="$style.list" aria-label="本轮不可用的 MCP server">
    <UAlert
      v-for="row in rows"
      :key="row.key"
      :color="row.color"
      variant="subtle"
      :icon="row.icon"
      :title="`${row.name} ${row.label}`"
      :description="`本轮没有它的工具。${row.fault.message}`"
      :actions="row.actions"
    />
  </div>
</template>

<style module src="./index.module.css"></style>
