<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import { RelativeTime } from '@/components'
import { useMcpActions } from '@/hooks/useMcpActions'
import type { McpProbeResponse, McpServerResponse, McpToolResponse } from '@/interfaces/mcp/api'
import { useMcpStore } from '@/stores/mcp'
import { approvalLabel, authLabel, mcpProbeStatus } from '@/utils/mcp'
import { rememberOAuthServer } from '@/utils/mcp-oauth'

defineOptions({ name: 'McpResourceDetail' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const mcpStore = useMcpStore()
const actions = useMcpActions()

const loading = ref(false)
const notFound = ref(false)
const loadError = ref('')
const detail = ref<McpServerResponse | null>(null)
const tools = ref<McpToolResponse[]>([])
const toolsError = ref('')
/** 最近一次重新探测的结果，显示在工具卡上方。 */
const probeResult = ref<McpProbeResponse | null>(null)
const probeError = ref('')
const authorizing = ref(false)
const revoking = ref(false)

const serverId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})
/** 优先读 store：启停的乐观更新、探测后的新状态都会写回 store。 */
const server = computed<McpServerResponse | null>(
  () => mcpStore.state.items.find((item) => item.id === serverId.value) ?? detail.value,
)
const status = computed(() => (server.value ? mcpProbeStatus(server.value) : null))
const probing = computed(() => mcpStore.state.probingIds.includes(serverId.value))
const toolsLoading = computed(() => mcpStore.state.toolsLoadingIds.includes(serverId.value))
const isOAuth = computed(() => server.value?.auth_type === 'oauth')
const authorized = computed(() => server.value?.oauth?.status === 'authorized')
const oauthLabel = computed(() => {
  const value = server.value?.oauth?.status
  if (value === 'authorized') return '已授权'
  if (value === 'expired') return '授权已过期'
  return '未授权'
})

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const current = server.value
  if (!current) return []
  return [[{ label: '删除', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => actions.requestDelete(current) }]]
})

/** 探测差异的一句话摘要。 */
const probeSummary = computed(() => {
  const diff = probeResult.value?.diff
  if (!diff) return ''
  const parts: string[] = []
  if (diff.added.length) parts.push(`新增 ${diff.added.join('、')}`)
  if (diff.removed.length) parts.push(`移除 ${diff.removed.join('、')}`)
  if (diff.schema_changed.length) parts.push(`参数变化 ${diff.schema_changed.map((item) => item.name).join('、')}`)
  return parts.length ? parts.join('；') : '工具没有变化'
})

async function loadTools(force = false) {
  toolsError.value = ''
  const result = await mcpStore.loadTools(serverId.value, force)
  if (!result) return
  tools.value = result.tools
  toolsError.value = result.error ?? ''
}

async function load() {
  notFound.value = false
  loadError.value = ''
  detail.value = null
  tools.value = []
  probeResult.value = null
  probeError.value = ''
  if (!Number.isInteger(serverId.value)) {
    notFound.value = true
    return
  }
  loading.value = true
  const [result] = await Promise.all([mcpStore.loadServerDetail(serverId.value), loadTools(true)])
  loading.value = false
  if (result === undefined) return
  if (result.status === 'not-found') {
    notFound.value = true
    return
  }
  if (result.status === 'error') {
    loadError.value = result.message
    return
  }
  detail.value = result.item
}

watch(serverId, () => { void load() }, { immediate: true })

function goToList() {
  void router.push({ name: 'platform-resource', params: { module: 'build', resource: 'mcp' } })
}

function goToEdit() {
  void router.push({ name: 'mcp-edit', params: { id: String(serverId.value) } })
}

function onToggle(value: boolean) {
  if (server.value) void actions.toggleEnabled(server.value, value)
}

async function onProbe() {
  probeResult.value = null
  probeError.value = ''
  const outcome = await mcpStore.probeServer(serverId.value)
  if (!outcome) return
  if (outcome.error) {
    probeError.value = outcome.error
    return
  }
  if (!outcome.result) return
  if (outcome.result.ok) {
    probeResult.value = outcome.result
    await loadTools(true)
  } else {
    probeError.value = outcome.result.error || '探测失败'
  }
}

/** 授权前半程拿到地址后整页跳转，授权服务器回跳到 /mcp/oauth/callback。 */
async function onAuthorize() {
  if (authorizing.value) return
  authorizing.value = true
  const { url, error } = await mcpStore.beginAuthorization(serverId.value)
  if (error || !url) {
    authorizing.value = false
    toast.add({ title: '发起授权失败', description: error ?? undefined, color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  rememberOAuthServer(serverId.value)
  window.location.assign(url)
}

async function onRevoke() {
  if (revoking.value) return
  revoking.value = true
  const error = await mcpStore.revokeAuthorization(serverId.value)
  revoking.value = false
  if (error === undefined) return
  if (error) {
    toast.add({ title: '撤销授权失败', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  toast.add({ title: '已撤销授权', color: 'success' })
}

async function onDeleteConfirm() {
  if (await actions.confirmDelete()) goToList()
}
</script>

<template>
  <main :class="$style.page">
    <div :class="$style.inner">
      <header :class="$style.toolbar">
        <UButton icon="i-lucide-arrow-left" label="MCP Servers" color="neutral" variant="ghost" @click="goToList" />
        <div v-if="server && server.writable && !notFound && !loadError" :class="$style.actions">
          <USwitch
            :model-value="server.is_enabled"
            :disabled="actions.isToggling(server.id)"
            :loading="actions.isToggling(server.id)"
            :aria-label="`${server.is_enabled ? '停用' : '启用'} ${server.name}`"
            @update:model-value="onToggle"
          />
          <UButton icon="i-lucide-refresh-cw" label="重新探测" color="neutral" variant="outline" :loading="probing" :disabled="probing" @click="onProbe" />
          <UButton icon="i-lucide-pencil" label="编辑" color="primary" @click="goToEdit" />
          <UDropdownMenu :items="menuItems">
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" square aria-label="更多操作" />
          </UDropdownMenu>
        </div>
      </header>

      <div v-if="loading && !server" :class="$style.skeletons" aria-busy="true">
        <USkeleton :class="$style.skeletonHero" />
        <USkeleton :class="$style.skeleton" />
        <USkeleton :class="$style.skeleton" />
      </div>

      <UEmpty v-else-if="notFound" :class="$style.empty" variant="naked" icon="i-lucide-server-off" title="MCP server 不存在">
        <template #actions>
          <UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="goToList" />
        </template>
      </UEmpty>

      <UEmpty v-else-if="loadError" :class="$style.empty" variant="naked" icon="i-lucide-cloud-off" title="MCP server 加载失败" :description="loadError">
        <template #actions>
          <UButton icon="i-lucide-refresh-cw" label="重试" color="neutral" variant="outline" @click="load" />
        </template>
      </UEmpty>

      <template v-else-if="server">
        <section :class="$style.hero">
          <UAvatar :class="$style.avatar" icon="i-lucide-server-cog" size="xl" />
          <div :class="$style.heroText">
            <h1 :class="$style.name">
              {{ server.name }}
              <UTooltip v-if="server.visibility === 'private'" text="仅自己可见">
                <UIcon name="i-lucide-lock" :class="$style.lock" />
                <span class="sr-only">仅自己可见</span>
              </UTooltip>
            </h1>
            <p v-if="server.description" :class="$style.description">{{ server.description }}</p>
          </div>
        </section>

        <section :class="$style.group">
          <h2 :class="$style.groupTitle">连接</h2>
          <UCard :ui="{ body: 'py-0 sm:py-0' }">
            <dl :class="$style.rows">
              <div :class="$style.row">
                <dt :class="$style.rowLabel">地址</dt>
                <dd :class="[$style.value, 'mono']">{{ server.url }}</dd>
              </div>
              <div :class="$style.row">
                <dt :class="$style.rowLabel">认证</dt>
                <dd :class="$style.value">
                  <span :class="$style.inline">
                    {{ authLabel(server.auth_type) }}
                    <template v-if="isOAuth">
                      <UTooltip :text="oauthLabel">
                        <UIcon
                          :name="authorized ? 'i-lucide-circle-check' : 'i-lucide-key-round'"
                          :class="$style.status"
                          :data-tone="authorized ? 'success' : 'warning'"
                        />
                        <span class="sr-only">{{ oauthLabel }}</span>
                      </UTooltip>
                      <UButton
                        v-if="authorized"
                        label="撤销授权"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :loading="revoking"
                        :disabled="revoking"
                        @click="onRevoke"
                      />
                      <UButton
                        v-else
                        :label="server.oauth?.status === 'expired' ? '重新授权' : '授权'"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :loading="authorizing"
                        :disabled="authorizing"
                        @click="onAuthorize"
                      />
                    </template>
                  </span>
                </dd>
              </div>
              <div :class="$style.row">
                <dt :class="$style.rowLabel">最近探测</dt>
                <dd :class="$style.value">
                  <span :class="$style.inline">
                    <RelativeTime v-if="server.last_probe_at" :value="server.last_probe_at" />
                    <span v-else :class="$style.none">无</span>
                    <UTooltip v-if="status" :text="status.label">
                      <UIcon :name="status.icon" :class="$style.status" :data-tone="status.tone" />
                      <span class="sr-only">{{ status.label }}</span>
                    </UTooltip>
                  </span>
                  <p v-if="server.last_probe_error" :class="$style.errorText">{{ server.last_probe_error }}</p>
                </dd>
              </div>
            </dl>
          </UCard>
        </section>

        <section :class="$style.group">
          <h2 :class="$style.groupTitle">工具<span :class="$style.count">{{ tools.length }}</span></h2>
          <UAlert
            v-if="probeError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            title="探测失败"
            :description="probeError"
            :close="{ color: 'neutral', variant: 'link' }"
            @update:open="probeError = ''"
          />
          <UAlert
            v-else-if="probeResult"
            color="success"
            variant="subtle"
            icon="i-lucide-circle-check"
            title="探测完成"
            :description="probeSummary"
            :close="{ color: 'neutral', variant: 'link' }"
            @update:open="probeResult = null"
          />
          <UCard :ui="{ body: 'py-0 sm:py-0' }">
            <div v-if="toolsLoading && !tools.length" :class="$style.toolsLoading">
              <USkeleton v-for="n in 3" :key="n" :class="$style.toolSkeleton" />
            </div>
            <UAlert
              v-else-if="toolsError"
              :class="$style.toolsAlert"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              :title="toolsError"
              :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: () => loadTools(true) }]"
            />
            <p v-else-if="!tools.length" :class="$style.emptyTools">无</p>
            <ul v-else :class="$style.rows">
              <li v-for="tool in tools" :key="tool.name" :class="[$style.row, tool.filtered_out && $style.filtered]">
                <div :class="$style.rowMain">
                  <span :class="[$style.toolName, 'mono']">{{ tool.name }}</span>
                  <span v-if="tool.description" :class="$style.rowMeta">{{ tool.description }}</span>
                </div>
                <div :class="$style.toolFlags">
                  <UTooltip v-if="tool.filtered_out" text="已被白名单 / 黑名单过滤">
                    <UIcon name="i-lucide-filter-x" :class="$style.flag" />
                    <span class="sr-only">已被白名单 / 黑名单过滤</span>
                  </UTooltip>
                  <UTooltip v-if="tool.read_only" text="只读">
                    <UIcon name="i-lucide-eye" :class="$style.flag" />
                    <span class="sr-only">只读</span>
                  </UTooltip>
                  <UTooltip v-if="tool.destructive" text="破坏性操作">
                    <UIcon name="i-lucide-triangle-alert" :class="$style.flag" data-tone="warning" />
                    <span class="sr-only">破坏性操作</span>
                  </UTooltip>
                  <UTooltip v-if="tool.requires_approval" text="调用前需要审批">
                    <UIcon name="i-lucide-shield-check" :class="$style.flag" />
                    <span class="sr-only">调用前需要审批</span>
                  </UTooltip>
                </div>
              </li>
            </ul>
          </UCard>
        </section>

        <section :class="$style.group">
          <h2 :class="$style.groupTitle">设置</h2>
          <UCard :ui="{ body: 'py-0 sm:py-0' }">
            <dl :class="$style.rows">
              <div :class="$style.row">
                <dt :class="$style.rowLabel">标识</dt>
                <dd :class="[$style.value, 'mono']">{{ server.server_key }}</dd>
              </div>
              <div :class="$style.row">
                <dt :class="$style.rowLabel">可见范围</dt>
                <dd :class="$style.value">{{ server.visibility === 'private' ? '仅自己' : '工作区共享' }}</dd>
              </div>
              <div :class="$style.row">
                <dt :class="$style.rowLabel">审批</dt>
                <dd :class="$style.value">{{ approvalLabel(server.approval_mode) }}</dd>
              </div>
              <div v-if="server.tool_allowlist.length" :class="$style.row">
                <dt :class="$style.rowLabel">白名单</dt>
                <dd :class="$style.chips">
                  <UBadge v-for="name in server.tool_allowlist" :key="name" :label="name" color="neutral" variant="soft" size="xs" class="mono" />
                </dd>
              </div>
              <div v-if="server.tool_denylist.length" :class="$style.row">
                <dt :class="$style.rowLabel">黑名单</dt>
                <dd :class="$style.chips">
                  <UBadge v-for="name in server.tool_denylist" :key="name" :label="name" color="neutral" variant="soft" size="xs" class="mono" />
                </dd>
              </div>
              <div :class="$style.row">
                <dt :class="$style.rowLabel">调用超时</dt>
                <dd :class="$style.value">{{ server.call_timeout_seconds ? `${server.call_timeout_seconds} 秒` : '默认' }}</dd>
              </div>
              <div :class="$style.row">
                <dt :class="$style.rowLabel">创建</dt>
                <dd :class="$style.value"><RelativeTime :value="server.created_at" mode="absolute" /></dd>
              </div>
              <div :class="$style.row">
                <dt :class="$style.rowLabel">更新</dt>
                <dd :class="$style.value"><RelativeTime :value="server.updated_at" /></dd>
              </div>
            </dl>
          </UCard>
        </section>
      </template>
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
