<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useConsoleStore } from '@/stores/console'

defineOptions({ name: 'WorkspaceSelector' })

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

const workspaceItems = computed<DropdownMenuItem[][]>(() => {
  const options: DropdownMenuItem[] = authStore.state.workspaces.map((workspace) => ({
    label: `${workspace.display_name} · ${workspace.workspace_type} · ${workspace.plan}`,
    icon: workspace.id === currentWorkspace.value?.id
      ? 'i-lucide-check'
      : switchingId.value === workspace.id
        ? 'i-lucide-loader-circle'
        : 'i-lucide-building-2',
    disabled: switchingId.value !== null,
    onSelect: () => { void switchWorkspace(workspace.id) },
  }))

  if (!options.length) options.push({ label: '暂无可用工作区', disabled: true })
  if (errorMessage.value) options.push({ label: errorMessage.value, disabled: true })

  return [
    [{ label: `WORKSPACES · ${authStore.state.workspaces.length}`, disabled: true }],
    options,
    [{
      label: '管理工作区',
      icon: 'i-lucide-settings-2',
      onSelect: () => {
        open.value = false
        void router.push('/profile')
      },
    }],
  ]
})
</script>

<template>
  <div :class="$style['workspace-select']">
    <div :class="$style['workspace-label']">Workspace</div>
    <UDropdownMenu
      v-model:open="open"
      :items="workspaceItems"
      :ui="{ content: 'workspace-options', item: 'workspace-option' }"
    >
      <UButton
        color="neutral"
        variant="outline"
        :class="[$style['workspace-button'], { [$style.active]: open }]"
        block
        aria-haspopup="menu"
        :aria-expanded="open"
      >
        <span :class="[$style['workspace-symbol'], 'mono']">{{ workspaceCode }}</span>
        <span :class="$style['workspace-copy']">
          <span :class="$style['workspace-name']">{{ currentWorkspace?.display_name || '制造协同工作区' }}</span>
          <span :class="[$style['workspace-meta'], 'mono']">{{ workspaceMeta }}</span>
        </span>
        <i class="icon icon-chevrons-up-down"></i>
      </UButton>
    </UDropdownMenu>
  </div>
</template>

<style module src="./index.module.css"></style>
