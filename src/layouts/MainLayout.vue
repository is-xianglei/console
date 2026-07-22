<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useConsoleStore } from '../stores/console'
import { useAuthStore } from '../stores/auth'
import type { PlatformModuleKey } from '../data/platformCatalog'
import LeftSidebar from '../components/LeftSidebar.vue'
import RightSidebar from '../components/right/RightSidebar.vue'
import ActivityRail from '../components/navigation/ActivityRail.vue'
import ModuleSidebar from '../components/navigation/ModuleSidebar.vue'

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
  { label: 'Agents', meta: 'BUILD RESOURCE', icon: 'bot', to: '/platform/build/agents' },
  { label: 'Teams', meta: 'BUILD RESOURCE', icon: 'network', to: '/platform/build/teams' },
  { label: 'Models', meta: 'BUILD RESOURCE', icon: 'cpu', to: '/platform/build/models' },
  { label: 'Skills', meta: 'BUILD RESOURCE', icon: 'wrench', to: '/platform/build/skills' },
  { label: '技能包管理', meta: 'SKILLS API', icon: 'package-open', to: '/skills' },
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
const hasContextSidebar = computed(() => route.name === 'chat' || route.name === 'skills' || route.name === 'platform-resource')
const showContextSidebar = computed(() => hasContextSidebar.value && (isMobile.value ? mobileContextOpen.value : !state.leftCollapsed))
const moduleContext = computed<PlatformModuleKey | null>(() => {
  if (route.name === 'skills') return 'build'
  if (route.name !== 'platform-resource') return null
  const module = String(route.params.module)
  return module === 'build' || module === 'governance' || module === 'organization' ? module : null
})
const healthDot = computed(() => state.health === 'ok' ? 'nominal' : state.health === 'unknown' ? 'idle' : 'error')
const healthText = computed(() => state.health === 'ok' ? 'SYSTEM NOMINAL' : state.health === 'unknown' ? 'CONNECTING…' : 'BACKEND OFFLINE')
const filteredCommands = computed(() => {
  const query = commandQuery.value.trim().toLowerCase()
  if (!query) return commandItems
  return commandItems.filter((item) => `${item.label} ${item.meta}`.toLowerCase().includes(query))
})

watch(() => [route.params.sessionId, state.sessionsLoading, state.sessions.map((session) => session.id).join('|')] as const, ([sessionId, sessionsLoading]) => {
  if (route.name !== 'chat' || sessionsLoading || typeof sessionId !== 'string') return
  if (sessionId === state.activeSessionId) return
  if (state.sessions.some((session) => session.id === sessionId)) selectSession(sessionId)
}, { immediate: true })

watch(() => route.fullPath, () => {
  mobileContextOpen.value = false
  mobileRightOpen.value = false
})

async function handleLogout() {
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

function handleGlobalKey(event: KeyboardEvent) {
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
  window.addEventListener('keydown', handleGlobalKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
  window.removeEventListener('keydown', handleGlobalKey)
})
</script>

<template>
  <div class="shell">
    <header class="command-bar">
      <div class="cmd-brand">
        <svg class="cmd-hex" viewBox="0 0 20 22" fill="none"><path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" /></svg>
        <span class="cmd-title">Hyperreal</span>
        <span class="brand-env mono">Enterprise</span>
      </div>
      <button
        v-if="hasContextSidebar"
        type="button"
        class="cmd-btn context-toggle"
        :class="{ active: showContextSidebar }"
        :title="showContextSidebar ? '收起侧栏' : '展开侧栏'"
        :aria-label="showContextSidebar ? '收起侧栏' : '展开侧栏'"
        :aria-expanded="showContextSidebar"
        @click="toggleContextSidebar"
      >
        <i class="icon icon-panel-left"></i>
      </button>
      <button class="command-search" @click="paletteOpen = true">
        <i class="icon icon-search"></i><span>搜索资源、应用和人员</span><kbd class="mono">⌘ K</kbd>
      </button>
      <div class="cmd-spacer"></div>
      <div class="cmd-stat mono"><span class="dot" :class="healthDot"></span>{{ healthText }}</div>
      <div class="cmd-stat mono">◇ {{ agentCount }} RUNNING</div>
      <button v-if="authStore.state.user" class="cmd-user" title="打开用户资料" @click="router.push('/profile')">
        <span class="user-avatar">{{ authStore.state.user.username.slice(0, 1).toUpperCase() }}</span>
        <span class="cmd-user-name">{{ authStore.state.user.username }}</span>
      </button>
      <button class="cmd-btn" :title="state.theme === 'dark' ? '切到亮色' : '切到暗色'" @click="toggleTheme"><i :class="`icon icon-${state.theme === 'dark' ? 'sun' : 'moon'}`"></i></button>
      <button v-if="rightAvailable" class="cmd-btn" :class="{ active: isMobile ? mobileRightOpen : !state.rightCollapsed }" :title="showRight ? '收起运行 Agent' : '展开运行 Agent'" @click="toggleRuntimePanel"><i class="icon icon-panel-right"></i></button>
      <button class="cmd-btn" :class="{ active: route.name === 'settings' }" title="平台设置" @click="toggleSettings"><i class="icon icon-settings"></i></button>
      <button class="cmd-btn" title="退出登录" @click="handleLogout"><i class="icon icon-log-out"></i></button>
    </header>

    <div class="workspace-shell">
      <ActivityRail />
      <Transition name="context-shell">
        <div v-if="showContextSidebar" class="context-sidebar-shell">
          <Transition name="context-content">
            <div v-if="route.name === 'chat'" key="workbench" class="context-sidebar-content">
              <LeftSidebar @navigate="closeMobilePanels" />
            </div>
            <div v-else-if="moduleContext" :key="moduleContext" class="context-sidebar-content">
              <ModuleSidebar :module="moduleContext" />
            </div>
          </Transition>
        </div>
      </Transition>
      <button v-if="isMobile && (mobileContextOpen || mobileRightOpen)" class="mobile-panel-backdrop" aria-label="关闭侧栏" @click="closeMobilePanels"></button>
      <div class="page-stage">
        <router-view v-slot="{ Component, route: currentRoute }">
          <Transition name="page-fade">
            <component
              :is="Component"
              :key="currentRoute.name === 'platform-resource' ? `${String(currentRoute.name)}-${String(currentRoute.params.module)}` : String(currentRoute.name)"
            />
          </Transition>
        </router-view>
      </div>
      <Transition name="right-slide"><RightSidebar v-if="showRight" /></Transition>
    </div>

    <div v-if="paletteOpen" class="palette-backdrop" @click.self="paletteOpen = false">
      <section class="command-palette" role="dialog" aria-modal="true" aria-label="全局命令搜索">
        <div class="palette-input"><i class="icon icon-search"></i><input v-model="commandQuery" autofocus placeholder="输入资源、应用或人员名称…" @keydown.enter="filteredCommands[0] && openCommand(filteredCommands[0])" /><kbd class="mono">ESC</kbd></div>
        <div class="palette-label mono">NAVIGATE · {{ filteredCommands.length }}</div>
        <div class="palette-results">
          <button v-for="item in filteredCommands" :key="item.to" @click="openCommand(item)"><i :class="`icon icon-${item.icon}`"></i><span><strong>{{ item.label }}</strong><small class="mono">{{ item.meta }}</small></span><i class="icon icon-arrow-up-right"></i></button>
          <div v-if="!filteredCommands.length" class="palette-empty">没有匹配的资源</div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.shell { height: 100vh; min-width: 0; overflow: hidden; display: flex; flex-direction: column; background: var(--bg-deep); }
.command-bar { height: 48px; flex: 0 0 48px; padding: 0 10px; border-bottom: 1px solid var(--border); background: var(--bg-panel); display: flex; align-items: center; gap: 8px; position: relative; z-index: 20; }
.cmd-brand { padding: 0 8px 0 4px; display: flex; align-items: center; gap: 8px; }.cmd-hex { width: 17px; height: 19px; color: var(--accent-agent); }.cmd-title { font-family: var(--font-ui); font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }.brand-env { padding-left: 8px; border-left: 1px solid var(--border); color: var(--accent-agent); font-size: 7px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.command-search { width: clamp(190px, 25vw, 360px); height: 30px; margin-left: 6px; padding: 0 8px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--bg-surface); color: var(--text-dim); display: flex; align-items: center; gap: 7px; cursor: pointer; }.command-search > i { font-size: 12px; }.command-search > span { flex: 1; text-align: left; font-size: 9px; }.command-search kbd { padding: 1px 5px; border: 1px solid var(--border); border-radius: 3px; background: var(--bg-elevated); color: var(--text-muted); font-size: 8px; }
.cmd-spacer { flex: 1; }.cmd-stat { display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 8px; letter-spacing: .04em; white-space: nowrap; }.cmd-btn { width: 30px; height: 30px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-muted); display: grid; place-items: center; cursor: pointer; transition: all var(--dur-fast); }.cmd-btn:hover { background: var(--bg-surface); color: var(--text-secondary); }.cmd-btn.active { color: var(--accent-agent); }.cmd-btn:active { transform: scale(.95); }.cmd-btn i { font-size: 14px; }.cmd-user { height: 30px; padding: 0 7px 0 4px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--bg-surface); color: var(--text-secondary); display: flex; align-items: center; gap: 6px; cursor: pointer; }.user-avatar { width: 21px; height: 21px; border-radius: var(--radius-sm); background: var(--accent-agent-dim); color: var(--accent-agent); display: grid; place-items: center; font-family: var(--font-data); font-size: 8px; }.cmd-user-name { max-width: 72px; overflow: hidden; text-overflow: ellipsis; font-size: 9px; }
.workspace-shell { flex: 1; min-height: 0; display: flex; position: relative; }
.context-sidebar-shell { width: var(--left-bar-w); height: 100%; flex: 0 0 var(--left-bar-w); min-width: 0; overflow: hidden; position: relative; border-right: 1px solid var(--border); background: var(--bg-surface); }
.context-sidebar-content { position: absolute; inset: 0 auto 0 0; width: var(--left-bar-w); min-width: var(--left-bar-w); display: flex; }
.context-sidebar-content :deep(.left-bar),.context-sidebar-content :deep(.module-sidebar) { width: 100%; height: 100%; flex: 1 1 auto; border-right: 0; }
.context-shell-enter-active,.context-shell-leave-active { transition: width 220ms var(--ease-out), flex-basis 220ms var(--ease-out), opacity 220ms var(--ease-out); }
.context-shell-enter-from,.context-shell-leave-to { width: 0; flex-basis: 0; opacity: 0; }
.context-content-enter-active,.context-content-leave-active { transition: opacity 140ms var(--ease-out), transform 140ms var(--ease-out); }
.context-content-enter-from { opacity: 0; transform: translateY(4px); }.context-content-leave-to { opacity: 0; transform: translateY(-3px); }
.page-stage { flex: 1 1 auto; min-width: 0; min-height: 0; position: relative; display: flex; overflow: hidden; }
.page-stage > :deep(*) { flex: 1 1 auto; min-width: 0; min-height: 0; }
.page-fade-enter-active,.page-fade-leave-active { transition: opacity 140ms var(--ease-out), transform 140ms var(--ease-out); }
.page-fade-leave-active { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.page-fade-enter-from { opacity: 0; transform: translateY(4px); }.page-fade-leave-to { opacity: 0; transform: translateY(-2px); }
.right-slide-enter-active,.right-slide-leave-active { transition: width var(--dur-med) var(--ease-out), opacity var(--dur-fast); overflow: hidden; }.right-slide-enter-from,.right-slide-leave-to { width: 0 !important; opacity: 0; }
.mobile-panel-backdrop { position: fixed; z-index: 15; inset: 48px 0 50px; border: 0; background: rgba(0, 0, 0, .62); }
.palette-backdrop { position: fixed; inset: 0; z-index: 60; padding-top: 12vh; background: rgba(0, 0, 0, .66); display: flex; justify-content: center; align-items: flex-start; }.command-palette { width: min(620px, calc(100vw - 32px)); max-height: 68vh; border: 1px solid var(--border-visible); border-radius: var(--radius-lg); background: var(--bg-elevated); overflow: hidden; }.palette-input { height: 48px; padding: 0 12px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 9px; }.palette-input > i { color: var(--accent-agent); }.palette-input input { flex: 1; border: 0; outline: 0; background: transparent; color: var(--text-primary); font-family: var(--font-body); font-size: 12px; }.palette-input kbd { color: var(--text-dim); font-size: 8px; }.palette-label { padding: 9px 12px 5px; color: var(--text-dim); font-size: 8px; letter-spacing: .1em; }.palette-results { max-height: calc(68vh - 80px); overflow-y: auto; padding: 4px 6px 7px; }.palette-results button { width: 100%; min-height: 46px; padding: 6px 9px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary); display: flex; align-items: center; gap: 10px; text-align: left; cursor: pointer; }.palette-results button:hover { background: var(--bg-hover); }.palette-results button > i:first-child { width: 26px; color: var(--accent-agent); }.palette-results button > span { flex: 1; display: flex; flex-direction: column; }.palette-results strong { font-size: 10px; }.palette-results small { margin-top: 2px; color: var(--text-dim); font-size: 8px; }.palette-results button > i:last-child { color: var(--text-dim); font-size: 12px; }.palette-empty { padding: 30px; color: var(--text-dim); text-align: center; font-size: 10px; }.spinning { animation: spin .8s linear infinite; }
@media (max-width: 1000px) { .cmd-stat { display: none; }.command-search { width: 180px; } }
@media (max-width: 1180px) { .context-sidebar-shell { width: 250px; flex-basis: 250px; }.context-sidebar-content { width: 250px; min-width: 250px; } }
@media (max-width: 760px) { .command-bar { padding: 0 7px; }.cmd-title,.brand-env,.cmd-user-name,.command-search > span,.command-search kbd { display: none; }.command-search { width: 30px; margin-left: 0; justify-content: center; }.workspace-shell { padding-bottom: 50px; }.cmd-btn:nth-last-child(2) { display: none; }.context-sidebar-shell { position: fixed; z-index: 16; left: 0; top: 48px; bottom: 50px; width: min(300px, 86vw); height: auto; flex-basis: auto; border-right-color: var(--border-visible); }.context-sidebar-content :deep(.left-bar),.context-sidebar-content :deep(.module-sidebar) { position: static; width: 100%; height: 100%; flex-basis: auto; }.context-shell-enter-active,.context-shell-leave-active { transition: transform 220ms var(--ease-out), opacity 180ms var(--ease-out); }.context-shell-enter-from,.context-shell-leave-to { width: min(300px, 86vw); transform: translateX(-100%); opacity: 0; } }
@media (max-width: 760px) { .context-sidebar-content { width: min(300px, 86vw); min-width: min(300px, 86vw); } }
@media (prefers-reduced-motion: reduce) { .context-shell-enter-active,.context-shell-leave-active,.context-content-enter-active,.context-content-leave-active,.page-fade-enter-active,.page-fade-leave-active,.right-slide-enter-active,.right-slide-leave-active { transition-duration: 1ms; transform: none; } }
</style>
