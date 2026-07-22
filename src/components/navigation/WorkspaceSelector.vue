<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useConsoleStore } from '../../stores/console'

const router = useRouter()
const authStore = useAuthStore()
const consoleStore = useConsoleStore()
const open = ref(false)
const switchingId = ref<number | null>(null)
const errorMessage = ref('')

function workspaceIdFromToken(token: string | null): number | null {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const claims = JSON.parse(atob(normalized)) as Record<string, unknown>
    const id = Number(claims.workspace_id ?? claims.workspaceId)
    return Number.isFinite(id) ? id : null
  } catch {
    return null
  }
}

const activeWorkspaceId = computed(() => workspaceIdFromToken(authStore.state.accessToken))
const currentWorkspace = computed(() =>
  authStore.state.workspaces.find((workspace) => workspace.id === activeWorkspaceId.value)
  ?? authStore.state.workspaces[0]
  ?? null,
)
const workspaceCode = computed(() => currentWorkspace.value?.slug.slice(0, 3).toUpperCase() || 'WS')
const workspaceMeta = computed(() => {
  const workspace = currentWorkspace.value
  if (!workspace) return 'NO WORKSPACE'
  const environment = workspace.workspace_type || 'WORKSPACE'
  return `${environment} · ${workspace.plan}`.toUpperCase()
})

async function switchWorkspace(workspaceId: number) {
  if (switchingId.value !== null || workspaceId === currentWorkspace.value?.id) {
    open.value = false
    return
  }
  switchingId.value = workspaceId
  errorMessage.value = ''
  try {
    await authStore.switchWorkspace(workspaceId)
    const [userLoaded] = await Promise.all([authStore.loadUser(), authStore.loadWorkspaces()])
    if (!userLoaded) throw new Error('登录状态已失效，请重新登录')
    await consoleStore.reloadConsole()
    open.value = false
    await router.push({
      name: 'chat',
      params: consoleStore.state.activeSessionId
        ? { sessionId: consoleStore.state.activeSessionId }
        : {},
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '切换工作区失败'
  } finally {
    switchingId.value = null
  }
}
</script>

<template>
  <div class="workspace-select">
    <div class="workspace-label">Workspace</div>
    <button
      type="button"
      class="workspace-button"
      :class="{ active: open }"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="workspace-symbol mono">{{ workspaceCode }}</span>
      <span class="workspace-copy">
        <span class="workspace-name">{{ currentWorkspace?.display_name || '制造协同工作区' }}</span>
        <span class="workspace-meta mono">{{ workspaceMeta }}</span>
      </span>
      <i class="icon icon-chevrons-up-down"></i>
    </button>

    <div v-if="open" class="workspace-options" role="menu">
      <div class="options-title mono">WORKSPACES · {{ authStore.state.workspaces.length }}</div>
      <button
        v-for="workspace in authStore.state.workspaces"
        :key="workspace.id"
        :class="{ current: workspace.id === currentWorkspace?.id }"
        :disabled="switchingId !== null"
        @click="switchWorkspace(workspace.id)"
      >
        <span class="workspace-symbol mono">{{ workspace.slug.slice(0, 3).toUpperCase() }}</span>
        <span class="workspace-copy">
          <span class="workspace-name">{{ workspace.display_name }}</span>
          <span class="workspace-meta mono">{{ workspace.workspace_type }} · {{ workspace.plan }}</span>
        </span>
        <i v-if="workspace.id === currentWorkspace?.id" class="icon icon-check"></i>
        <i v-else-if="switchingId === workspace.id" class="icon icon-loader-circle spinning"></i>
      </button>
      <div v-if="!authStore.state.workspaces.length" class="workspace-empty">暂无可用工作区</div>
      <div v-if="errorMessage" class="workspace-error">{{ errorMessage }}</div>
      <button class="workspace-manage" @click="open = false; router.push('/profile')">
        <i class="icon icon-settings-2"></i>管理工作区
      </button>
    </div>
  </div>
</template>

<style scoped>
.workspace-select { position: relative; padding: 12px; border-bottom: 1px solid var(--border); }
.workspace-label { color: var(--text-dim); font-family: var(--font-ui); font-size: 9px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; }
.workspace-button { margin-top: 6px; width: 100%; min-width: 0; height: 38px; padding: 0 9px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--bg-elevated); color: var(--text-secondary); display: flex; align-items: center; gap: 9px; text-align: left; cursor: pointer; }
.workspace-button:hover,.workspace-button.active { border-color: var(--border-strong); background: var(--bg-card); }
.workspace-symbol { width: 22px; height: 22px; flex: 0 0 22px; border-radius: 3px; background: var(--accent-agent-dim); color: var(--accent-agent); display: grid; place-items: center; font-size: 9px; font-weight: 600; }
.workspace-copy { flex: 1; min-width: 0; display: block; }
.workspace-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); font-family: var(--font-ui); font-size: 12px; font-weight: 600; }
.workspace-meta { display: block; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-dim); font-size: 9px; text-transform: uppercase; }
.workspace-button > i { color: var(--text-dim); font-size: 11px; }
.workspace-options { position: absolute; z-index: 40; top: 68px; left: 12px; right: 12px; max-height: min(420px, calc(100vh - 136px)); overflow-y: auto; padding: 6px; border: 1px solid var(--border-visible); border-radius: var(--radius-md); background: var(--bg-elevated); animation: entry-appear 180ms var(--ease-out); }
.options-title { padding: 5px 7px 7px; color: var(--text-dim); font-size: 8px; letter-spacing: .08em; }
.workspace-options > button:not(.workspace-manage) { width: 100%; min-height: 44px; padding: 5px 7px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary); display: flex; align-items: center; gap: 8px; text-align: left; cursor: pointer; }
.workspace-options > button:hover,.workspace-options > button.current { background: var(--bg-hover); }
.workspace-options > button > i { color: var(--accent-agent); font-size: 12px; }
.workspace-manage { width: 100%; height: 32px; margin-top: 5px; padding: 0 7px; border: 0; border-top: 1px solid var(--border); background: transparent; color: var(--text-muted); display: flex; align-items: center; gap: 7px; font-size: 9px; cursor: pointer; }
.workspace-empty,.workspace-error { padding: 9px 7px; color: var(--text-dim); font-size: 9px; }.workspace-error { color: var(--status-error); }
.spinning { animation: spin .8s linear infinite; }
@media (max-width: 760px) { .workspace-options { max-height: calc(100dvh - 166px); } }
</style>
