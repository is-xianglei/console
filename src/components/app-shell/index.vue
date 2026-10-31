<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { PlatformModuleKey } from '@/interfaces/platform/model'
import AgentSidebar from '@/routes/chat/components/agent-sidebar/index.vue'
import SessionSidebar from '@/routes/chat/components/session-sidebar/index.vue'
import { useAuthStore } from '@/stores/auth'
import { useConsoleStore } from '@/stores/console'
import ActivityRail from '../activity-rail/index.vue'
import ModuleSidebar from '../module-sidebar/index.vue'

defineOptions({ name: 'AppShell' })

const router = useRouter()
const route = useRoute()
const consoleStore = useConsoleStore()
const { state, toggleTheme, toggleLeft, toggleRight, selectSession, resetConsole } = consoleStore
const authStore = useAuthStore()
const settingsReturnTo = ref('/chat')
const paletteOpen = ref(false)
const commandQuery = ref('')
const isMobile = ref(false)
const mobileContextOpen = ref(false)
const mobileRightOpen = ref(false)

const commandItems = [
  { label: '应用会话工作台', meta: 'WORKBENCH', icon: 'message-square-more', to: '/chat' },
  { label: '长期记忆', meta: 'MEMORY', icon: 'brain', to: '/memories' },
  { label: 'Agents', meta: 'BUILD RESOURCE', icon: 'bot', to: '/platform/build/agents' },
  { label: 'Teams', meta: 'BUILD RESOURCE', icon: 'network', to: '/platform/build/teams' },
  { label: 'Models', meta: 'BUILD RESOURCE', icon: 'cpu', to: '/platform/build/models' },
  { label: 'Skills', meta: 'BUILD RESOURCE', icon: 'wrench', to: '/skills' },
  { label: 'MCP Servers', meta: 'BUILD RESOURCE', icon: 'server-cog', to: '/platform/build/mcp' },
  { label: '策略与护栏', meta: 'GOVERNANCE', icon: 'shield', to: '/platform/governance/policies' },
  { label: '运行追踪', meta: 'OBSERVABILITY', icon: 'route', to: '/platform/governance/traces' },
  { label: '审计日志', meta: 'OBSERVABILITY', icon: 'scroll-text', to: '/platform/governance/audits' },
  { label: '部门', meta: 'ORGANIZATION', icon: 'building-2', to: '/platform/organization/departments' },
  { label: '角色', meta: 'ACCESS CONTROL', icon: 'badge-check', to: '/platform/organization/roles' },
  { label: '访问申请', meta: 'ACCESS CONTROL', icon: 'inbox', to: '/platform/organization/requests' },
  { label: '应用市场', meta: 'MARKET', icon: 'store', to: '/apps' },
  { label: '平台设置', meta: 'SETTINGS', icon: 'settings', to: '/settings' },
]

const agentCount = computed(() => state.agents.length)
const rightAvailable = computed(() => route.name === 'chat' && state.workbenchMode === 'chat' && state.agents.length > 0)
const showRight = computed(() => rightAvailable.value && (isMobile.value ? mobileRightOpen.value : !state.rightCollapsed))
const hasContextSidebar = computed(() => route.name === 'chat' || route.path.startsWith('/skills') || route.name === 'platform-resource' || route.meta.platform === true)
const showContextSidebar = computed(() => hasContextSidebar.value && (isMobile.value ? mobileContextOpen.value : !state.leftCollapsed))
const moduleContext = computed<PlatformModuleKey | null>(() => {
  if (route.path.startsWith('/skills')) return 'build'
  if (route.meta.platform === true) {
    const module = String(route.meta.module ?? route.params.module ?? '')
    return module === 'build' || module === 'governance' || module === 'organization' ? module : null
  }
  if (route.name !== 'platform-resource') return null
  const module = String(route.params.module)
  return module === 'build' || module === 'governance' || module === 'organization' ? module : null
})
const healthDot = computed(() => state.health === 'ok' ? 'nominal' : state.health === 'degraded' ? 'warning' : state.health === 'unknown' ? 'idle' : 'error')
const healthText = computed(() => state.health === 'ok' ? 'SYSTEM NOMINAL' : state.health === 'degraded' ? 'PARTIAL SERVICE' : state.health === 'unknown' ? 'CONNECTING…' : 'BACKEND OFFLINE')
const filteredCommands = computed(() => {
  const query = commandQuery.value.trim().toLowerCase()
  if (!query) return commandItems
  return commandItems.filter((item) => `${item.label} ${item.meta}`.toLowerCase().includes(query))
})

watch(() => [route.params.sessionId, state.sessionsLoading, state.sessions.map((session) => session.id).join('|')] as const, ([sessionId, sessionsLoading]) => {
  if (route.name !== 'chat' || sessionsLoading || typeof sessionId !== 'string') return
  if (sessionId === state.activeSessionId) return
  // 流式进行中由 store 主导会话归属:草稿升级瞬间地址栏仍是上一个会话,
  // 跟随路由会把本轮回复整个 loadMessages 冲掉。地址栏交给 App.vue 规范化。
  if (state.busy) return
  // 本地草稿会话还没有后端 id,地址栏必然滞留在上一个会话。此时跟随路由会把草稿
  // (含编排方案选择)整个顶掉;等 SSE 返回真实 id 后由 App.vue 统一规范化地址。
  if (state.activeSessionId.startsWith('sess-')) return
  if (state.sessions.some((session) => session.id === sessionId)) selectSession(sessionId)
}, { immediate: true })

watch(() => route.fullPath, () => {
  mobileContextOpen.value = false
  mobileRightOpen.value = false
})

async function onLogout() {
  resetConsole()
  authStore.logout()
  await router.replace({ name: 'login' })
}

function toggleSettings() {
  if (route.name === 'settings') void router.push(settingsReturnTo.value)
  else {
    settingsReturnTo.value = route.fullPath
    void router.push({ name: 'settings' })
  }
}

function openCommand(item: typeof commandItems[number]) {
  paletteOpen.value = false
  commandQuery.value = ''
  void router.push(item.to)
}

function toggleContextSidebar() {
  if (isMobile.value) mobileContextOpen.value = !mobileContextOpen.value
  else toggleLeft()
}

function toggleRuntimePanel() {
  if (isMobile.value) mobileRightOpen.value = !mobileRightOpen.value
  else toggleRight()
}

function closeMobilePanels() {
  mobileContextOpen.value = false
  mobileRightOpen.value = false
}

function updateViewport() {
  isMobile.value = window.matchMedia('(max-width: 760px)').matches
  if (!isMobile.value) closeMobilePanels()
}

function onGlobalKey(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    paletteOpen.value = !paletteOpen.value
  }
  if (event.key === 'Escape') {
    paletteOpen.value = false
  }
}

onMounted(() => {
  updateViewport()
  window.addEventListener('resize', updateViewport)
  window.addEventListener('keydown', onGlobalKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
  window.removeEventListener('keydown', onGlobalKey)
})
</script>

<template>
  <div :class="$style.shell">
    <header :class="$style['command-bar']">
      <div :class="$style['cmd-brand']">
        <svg :class="$style['cmd-hex']" viewBox="0 0 20 22" fill="none"><path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" /></svg>
        <span :class="$style['cmd-title']">Hyperreal</span>
        <span :class="[$style['brand-env'], 'mono']">Enterprise</span>
      </div>
      <UButton
        v-if="hasContextSidebar"
        color="neutral"
        variant="ghost"
        square
        :class="[$style['cmd-btn'], 'context-toggle', { [$style.active]: showContextSidebar }]"
        :title="showContextSidebar ? '收起侧栏' : '展开侧栏'"
        :aria-label="showContextSidebar ? '收起侧栏' : '展开侧栏'"
        :aria-expanded="showContextSidebar"
        @click="toggleContextSidebar"
      >
        <i class="icon icon-panel-left"></i>
      </UButton>
      <UButton color="neutral" variant="outline" :class="$style['command-search']" @click="paletteOpen = true">
        <i class="icon icon-search"></i><span>搜索资源、应用和人员</span><kbd class="mono">⌘ K</kbd>
      </UButton>
      <div :class="$style['cmd-spacer']"></div>
      <div :class="[$style['cmd-stat'], 'mono']"><span class="dot" :class="healthDot"></span>{{ healthText }}</div>
      <div :class="[$style['cmd-stat'], 'mono']">◇ {{ agentCount }} RUNNING</div>
      <UButton v-if="authStore.state.user" color="neutral" variant="outline" :class="$style['cmd-user']" title="打开用户资料" aria-label="打开用户资料" @click="router.push('/profile')">
        <span :class="$style['user-avatar']">{{ authStore.state.user.username.slice(0, 1).toUpperCase() }}</span>
        <span :class="$style['cmd-user-name']">{{ authStore.state.user.username }}</span>
      </UButton>
      <UButton color="neutral" variant="ghost" square :class="$style['cmd-btn']" :title="state.theme === 'dark' ? '切到亮色' : '切到暗色'" :aria-label="state.theme === 'dark' ? '切到亮色' : '切到暗色'" @click="toggleTheme"><i :class="`icon icon-${state.theme === 'dark' ? 'sun' : 'moon'}`"></i></UButton>
      <UButton v-if="rightAvailable" color="neutral" variant="ghost" square :class="[$style['cmd-btn'], { [$style.active]: isMobile ? mobileRightOpen : !state.rightCollapsed }]" :title="showRight ? '收起运行 Agent' : '展开运行 Agent'" :aria-label="showRight ? '收起运行 Agent' : '展开运行 Agent'" @click="toggleRuntimePanel"><i class="icon icon-panel-right"></i></UButton>
      <UButton color="neutral" variant="ghost" square :class="[$style['cmd-btn'], $style['desktop-settings-button'], { [$style.active]: route.name === 'settings' }]" title="平台设置" aria-label="平台设置" @click="toggleSettings"><i class="icon icon-settings"></i></UButton>
      <UButton color="neutral" variant="ghost" square :class="$style['cmd-btn']" title="退出登录" aria-label="退出登录" @click="onLogout"><i class="icon icon-log-out"></i></UButton>
    </header>

    <div :class="$style['workspace-shell']">
      <ActivityRail />
      <Transition name="context-shell">
        <div v-if="showContextSidebar" :class="$style['context-sidebar-shell']">
          <div :class="$style['context-sidebar-content']">
            <SessionSidebar v-if="route.name === 'chat'" @navigate="closeMobilePanels" />
            <ModuleSidebar v-else-if="moduleContext" :module="moduleContext" />
          </div>
        </div>
      </Transition>
      <UButton v-if="isMobile && (mobileContextOpen || mobileRightOpen)" color="neutral" variant="ghost" :class="$style['mobile-panel-backdrop']" aria-label="关闭侧栏" @click="closeMobilePanels" />
      <div :class="$style['page-stage']">
        <router-view v-slot="{ Component, route: currentRoute }">
          <Transition name="page-fade">
            <component
              :is="Component"
              :key="currentRoute.name === 'platform-resource' ? `${String(currentRoute.name)}-${String(currentRoute.params.module)}-${String(currentRoute.params.resource)}` : String(currentRoute.name)"
            />
          </Transition>
        </router-view>
      </div>
      <Transition name="right-slide"><AgentSidebar v-if="showRight" /></Transition>
    </div>

    <UModal
      v-model:open="paletteOpen"
      title="全局命令搜索"
      :close="false"
      :ui="{ content: 'command-palette-content', body: 'p-0' }"
    >
      <template #body>
        <section :class="$style['command-palette']" aria-label="全局命令搜索">
          <div :class="$style['palette-input']">
            <UInput
              v-model="commandQuery"
              autofocus
              :class="$style['palette-search-input']"
              placeholder="输入资源、应用或人员名称…"
              @keydown.enter="filteredCommands[0] && openCommand(filteredCommands[0])"
            >
              <template #leading><i class="icon icon-search"></i></template>
              <template #trailing><kbd class="mono">ESC</kbd></template>
            </UInput>
          </div>
          <div :class="[$style['palette-label'], 'mono']">NAVIGATE · {{ filteredCommands.length }}</div>
          <div :class="$style['palette-results']">
            <UButton v-for="item in filteredCommands" :key="item.to" color="neutral" variant="ghost" block @click="openCommand(item)"><i :class="`icon icon-${item.icon}`"></i><span><strong>{{ item.label }}</strong><small class="mono">{{ item.meta }}</small></span><i class="icon icon-arrow-up-right"></i></UButton>
            <UEmpty v-if="!filteredCommands.length" :class="$style['palette-empty']" icon="i-lucide-search-x" title="没有匹配的资源" />
          </div>
        </section>
      </template>
    </UModal>
  </div>
</template>

<style module src="./index.module.css"></style>
