<script setup lang="ts">
import { computed, ref, useCssModule } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useConsoleStore } from '@/stores/console'
import { useWorkspacesStore } from '@/stores/workspaces'

defineOptions({ name: 'WorkspaceSelector' })

interface WorkspaceMenuItem extends DropdownMenuItem {
  workspaceCode?: string
  current?: boolean
  count?: number
}

const styles = useCssModule()
const router = useRouter()
const authStore = useAuthStore()
const consoleStore = useConsoleStore()
const workspacesStore = useWorkspacesStore()
const switchingId = ref<number | null>(null)
const errorMessage = ref('')
const workspaceBusy = computed(() => (
  authStore.state.workspaceSwitching || workspacesStore.state.mutating
))

const activeWorkspaceId = computed(() => authStore.currentWorkspaceId)
const currentWorkspace = computed(() =>
  authStore.state.workspaces.find((workspace) => workspace.id === activeWorkspaceId.value)
  ?? authStore.state.workspaces[0]
  ?? null,
)
const workspaceCode = computed(() => currentWorkspace.value?.slug.slice(0, 3).toUpperCase() || 'WS')
const workspaceMeta = computed(() => {
  const workspace = currentWorkspace.value
  if (!workspace) return '暂无工作区'
  return `${workspaceTypeLabel(workspace.workspace_type)} · ${workspacePlanLabel(workspace.plan)}`
})

function workspaceTypeLabel(value: string): string {
  return {
    personal: '个人空间',
    team: '团队空间',
    enterprise: '企业空间',
  }[value] ?? value
}

function workspacePlanLabel(value: string): string {
  return {
    free: '免费版',
    pro: '专业版',
    enterprise: '企业版',
  }[value] ?? value
}

async function switchWorkspace(workspaceId: number) {
  if (workspaceBusy.value || switchingId.value !== null || workspaceId === currentWorkspace.value?.id) {
    return
  }
  switchingId.value = workspaceId
  errorMessage.value = ''
  try {
    await authStore.switchWorkspace(workspaceId)
    const [userLoaded, workspacesLoaded] = await Promise.all([
      authStore.loadUser(),
      authStore.loadWorkspaces(),
    ])
    if (!userLoaded) throw new Error('登录状态已失效，请重新登录')
    if (!workspacesLoaded) throw new Error('工作区列表刷新失败')
    await consoleStore.reloadConsole()
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

const workspaceItems = computed<WorkspaceMenuItem[][]>(() => {
  const options: WorkspaceMenuItem[] = authStore.state.workspaces.map((workspace) => {
    const current = workspace.id === currentWorkspace.value?.id
    return {
      label: workspace.display_name,
      description: `${workspaceTypeLabel(workspace.workspace_type)} · ${workspacePlanLabel(workspace.plan)}`,
      slot: 'workspace',
      workspaceCode: workspace.slug.slice(0, 3).toUpperCase(),
      current,
      loading: switchingId.value === workspace.id,
      class: current ? styles['workspace-option-current'] : undefined,
      disabled: workspaceBusy.value || switchingId.value !== null,
      onSelect: () => { void switchWorkspace(workspace.id) },
    }
  })

  if (!options.length) {
    options.push({ label: '暂无可用工作区', icon: 'i-lucide-building-2', disabled: true })
  }
  if (errorMessage.value) {
    options.push({
      label: '切换失败',
      description: errorMessage.value,
      icon: 'i-lucide-circle-alert',
      color: 'error',
      disabled: workspaceBusy.value || switchingId.value !== null,
    })
  }

  return [
    [{
      type: 'label',
      label: '切换工作区',
      slot: 'workspace-header',
      count: authStore.state.workspaces.length,
    }],
    options,
    [{
      label: '管理工作区',
      description: '成员、邀请与工作区设置',
      icon: 'i-lucide-settings-2',
      onSelect: () => {
        void router.push('/settings/workspaces')
      },
    }],
  ]
})
</script>

<template>
  <div :class="$style['workspace-select']">
    <div :class="$style['workspace-label']">Workspace</div>
    <UDropdownMenu
      :items="workspaceItems"
      :disabled="workspaceBusy"
      :content="{ align: 'start', sideOffset: 6, collisionPadding: 8 }"
      :ui="{
        content: $style['workspace-options'],
        viewport: $style['workspace-viewport'],
        group: $style['workspace-group'],
        label: $style['workspace-menu-label'],
        item: $style['workspace-option'],
        itemLabel: $style['workspace-option-label'],
        itemDescription: $style['workspace-option-description'],
        itemLeadingIcon: $style['workspace-option-icon'],
      }"
    >
      <template #default="{ open: menuOpen }">
        <UButton
          color="neutral"
          variant="outline"
          :class="[$style['workspace-button'], { [$style.active]: menuOpen }]"
          block
          :disabled="workspaceBusy"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
        >
          <span :class="[$style['workspace-symbol'], 'mono']">{{ workspaceCode }}</span>
          <span :class="$style['workspace-copy']">
            <span :class="$style['workspace-name']">{{ currentWorkspace?.display_name || '制造协同工作区' }}</span>
            <span :class="[$style['workspace-meta'], 'mono']">{{ workspaceMeta }}</span>
          </span>
          <i class="icon icon-chevrons-up-down"></i>
        </UButton>
      </template>

      <template #workspace-header-label>
        <span :class="$style['workspace-menu-heading']">工作区</span>
      </template>
      <template #workspace-header-trailing>
        <span :class="[$style['workspace-menu-count'], 'mono']">{{ authStore.state.workspaces.length }}</span>
      </template>
      <template #workspace-leading="{ item }">
        <span :class="[$style['workspace-item-symbol'], 'mono']">{{ (item as WorkspaceMenuItem).workspaceCode }}</span>
      </template>
      <template #workspace-trailing="{ item }">
        <UIcon v-if="(item as WorkspaceMenuItem).loading" name="i-lucide-loader-circle" :class="[$style['workspace-spinner'], 'animate-spin']" />
        <span v-else-if="(item as WorkspaceMenuItem).current" :class="$style['workspace-current']">
          <UIcon name="i-lucide-check" />
          当前
        </span>
      </template>
    </UDropdownMenu>
  </div>
</template>

<style module src="./index.module.css"></style>
