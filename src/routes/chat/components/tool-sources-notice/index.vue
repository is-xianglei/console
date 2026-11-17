<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from '@nuxt/ui/composables'
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
  return {
    key: `${fault.source}|${fault.kind}`,
    fault,
    name: server?.name ?? sourceServerKey(fault.source),
    label: faultLabel(fault),
    icon: authRequired ? 'i-lucide-key-round' : 'i-lucide-circle-x',
    tone: authRequired ? 'warning' : 'error',
    action: fault.server_id == null ? null : authRequired ? 'authorize' as const : 'view' as const,
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
  <section :class="$style.notice" aria-label="本轮不可用的 MCP server">
    <div v-for="row in rows" :key="row.key" :class="$style.row">
      <UTooltip :text="row.fault.message">
        <UIcon :name="row.icon" :class="$style.icon" :data-tone="row.tone" />
      </UTooltip>
      <span :class="$style.text"><strong>{{ row.name }}</strong> {{ row.label }}，本轮没有它的工具</span>
      <UButton
        v-if="row.action === 'authorize'"
        label="去授权"
        color="neutral"
        variant="outline"
        size="xs"
        :loading="authorizingId === row.fault.server_id"
        :disabled="authorizingId != null"
        @click="authorize(row.fault.server_id!)"
      />
      <UButton
        v-else-if="row.action === 'view'"
        label="查看"
        color="neutral"
        variant="ghost"
        size="xs"
        @click="view(row.fault.server_id!)"
      />
    </div>
  </section>
</template>

<style module src="./index.module.css"></style>
