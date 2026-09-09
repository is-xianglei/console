<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type {
  WorkspaceCreateRequest,
  WorkspaceUpdateRequest,
} from '@/interfaces/workspace/api'
import type { WorkspaceResponse } from '@/interfaces/workspace/model'
import WorkspaceAcceptModal from '@/routes/profile/components/workspace-accept-modal/index.vue'
import WorkspaceDeleteModal from '@/routes/profile/components/workspace-delete-modal/index.vue'
import WorkspaceEditorModal from '@/routes/profile/components/workspace-editor-modal/index.vue'
import WorkspaceMemberPanel from '@/routes/profile/components/workspace-member-panel/index.vue'
import { useAuthStore } from '@/stores/auth'
import { useConsoleStore } from '@/stores/console'
import { useWorkspacesStore } from '@/stores/workspaces'

defineOptions({ name: 'WorkspacePanel' })

const router = useRouter()
const authStore = useAuthStore()
const consoleStore = useConsoleStore()
const workspacesStore = useWorkspacesStore()
const toast = useToast()
const workspaces = computed(() => authStore.state.workspaces)
const currentWorkspaceId = computed(() => authStore.currentWorkspaceId)
const currentWorkspace = computed(() => (
  workspacesStore.state.detail ?? authStore.currentWorkspace ?? null
))
const currentUserId = computed(() => authStore.state.user?.id ?? null)
const currentMembership = computed(() => workspacesStore.state.members.find(
  (member) => member.user_id === currentUserId.value,
))
const listedCurrentWorkspace = computed(() => workspaces.value.find(
  (workspace) => workspace.id === currentWorkspaceId.value,
))
const currentRole = computed(() => (
  currentMembership.value?.role ?? listedCurrentWorkspace.value?.membership_role ?? 'member'
))
const canEditCurrent = computed(() => ['owner', 'admin'].includes(currentRole.value))
const switchingId = ref<number | null>(null)
const editorMode = ref<'create' | 'edit'>('create')
const editorOpen = ref(false)
const editorSaving = ref(false)
const acceptOpen = ref(false)
const accepting = ref(false)
const pendingDelete = ref<WorkspaceResponse | null>(null)
const deleting = ref(false)
const error = ref('')
const workspaceBusy = computed(() => (
  authStore.state.workspaceSwitching
  || workspacesStore.state.mutating
  || switchingId.value !== null
  || editorSaving.value
  || accepting.value
  || deleting.value
))

const workspaceTypeLabel: Record<string, string> = {
  personal: '个人',
  team: '团队',
  enterprise: '企业',
}

function showBlockingError(message: string) {
  toast.add({ title: message, color: 'error', icon: 'i-lucide-circle-alert' })
}

function showFormError(message: string) {
  error.value = message
}

async function loadCurrentWorkspace(workspaceId: number | null) {
  if (!workspaceId) {
    workspacesStore.resetWorkspaces()
    return
  }
  const message = await workspacesStore.loadWorkspace(workspaceId)
  if (message) error.value = message
}

async function onWorkspaceSwitch(workspaceId: number) {
  if (workspaceBusy.value || workspaceId === currentWorkspaceId.value) return
  switchingId.value = workspaceId
  error.value = ''
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
  } catch (cause) {
    showBlockingError(cause instanceof Error ? cause.message : '切换工作区失败，请稍后重试')
  } finally {
    switchingId.value = null
  }
}

function openEditor(mode: 'create' | 'edit') {
  if (workspaceBusy.value || (mode === 'edit' && !canEditCurrent.value)) return
  editorMode.value = mode
  editorOpen.value = true
  error.value = ''
}

async function onSaveWorkspace(payload: WorkspaceCreateRequest | WorkspaceUpdateRequest) {
  if (workspaceBusy.value) return
  const mode = editorMode.value
  editorSaving.value = true
  error.value = ''
  let message = mode === 'create'
    ? await workspacesStore.createWorkspace(payload as WorkspaceCreateRequest)
    : await workspacesStore.updateWorkspace(payload as WorkspaceUpdateRequest)
  if (!message && !await authStore.loadWorkspaces()) message = '工作区列表刷新失败'
  editorSaving.value = false
  if (message) {
    showFormError(message)
    return
  }
  editorOpen.value = false
  toast.add({
    title: mode === 'create' ? '工作区已创建' : '工作区信息已更新',
    color: 'success',
    icon: 'i-lucide-circle-check',
  })
}

async function onAcceptInvite(workspaceId: number) {
  if (workspaceBusy.value) return
  accepting.value = true
  error.value = ''
  let message = await workspacesStore.acceptInvite(workspaceId)
  if (!message && !await authStore.loadWorkspaces()) message = '工作区列表刷新失败'
  accepting.value = false
  if (message) {
    showFormError(message)
    return
  }
  acceptOpen.value = false
  toast.add({ title: '邀请已接受', color: 'success', icon: 'i-lucide-mail-check' })
}

async function restoreWorkspace(workspaceId: number) {
  await authStore.switchWorkspace(workspaceId)
  const [userLoaded, workspacesLoaded, workspaceMessage] = await Promise.all([
    authStore.loadUser(),
    authStore.loadWorkspaces(),
    workspacesStore.loadWorkspace(workspaceId),
  ])
  if (!userLoaded) throw new Error('登录状态已失效，请重新登录')
  if (!workspacesLoaded) throw new Error('原工作区列表恢复失败')
  if (workspaceMessage) throw new Error(workspaceMessage)
}

function canDeleteWorkspace(workspace: WorkspaceResponse) {
  return workspace.id !== currentWorkspaceId.value && workspace.membership_role === 'owner'
}

function openDelete(workspace: WorkspaceResponse) {
  if (workspaceBusy.value || !canDeleteWorkspace(workspace)) return
  pendingDelete.value = workspace
}

async function onDeleteWorkspace() {
  const workspace = pendingDelete.value
  const originalWorkspaceId = currentWorkspaceId.value
  if (!workspace || !originalWorkspaceId || workspaceBusy.value) return
  if (workspace.membership_role !== 'owner') {
    showBlockingError('只有工作区所有者可以删除工作区')
    return
  }
  if (workspace.id === originalWorkspaceId) {
    showBlockingError('当前工作区不能删除，请先切换到其他工作区')
    return
  }

  deleting.value = true
  error.value = ''
  let message: string | null = null
  let switched = false
  try {
    await authStore.switchWorkspace(workspace.id)
    switched = true
    message = await workspacesStore.removeWorkspace(workspace.id)
  } catch (cause) {
    message = cause instanceof Error ? cause.message : '工作区删除失败'
  } finally {
    if (switched) {
      try {
        await restoreWorkspace(originalWorkspaceId)
      } catch (cause) {
        const restoreMessage = cause instanceof Error
          ? cause.message
          : '恢复原工作区失败，请重新登录'
        message = message ? `${message}；${restoreMessage}` : restoreMessage
      }
    }
    deleting.value = false
  }

  if (message) {
    showBlockingError(message)
    return
  }
  pendingDelete.value = null
  toast.add({ title: '工作区已删除', color: 'success', icon: 'i-lucide-trash-2' })
}

watch(currentWorkspaceId, (workspaceId) => {
  void loadCurrentWorkspace(workspaceId)
})

onMounted(() => {
  void loadCurrentWorkspace(currentWorkspaceId.value)
})
</script>

<template>
  <div :class="$style.formPanel">
    <UAlert v-if="error" :class="$style.feedback" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />
    <section :class="$style.section" aria-labelledby="current-workspace-title">
      <header :class="$style.sectionHeader">
        <div>
          <h2 id="current-workspace-title">当前工作区</h2>
          <p>当前登录令牌所使用的资源空间</p>
        </div>
        <UButton
          v-if="currentWorkspace && canEditCurrent"
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-pencil"
          label="编辑"
          :disabled="workspaceBusy"
          @click="openEditor('edit')"
        />
      </header>

      <div v-if="workspacesStore.state.loading && !currentWorkspace" :class="$style.loading">
        <USkeleton class="h-18 w-full" />
      </div>
      <UEmpty
        v-else-if="!currentWorkspace"
        :class="$style.empty"
        variant="naked"
        icon="i-lucide-building-2"
        title="暂无当前工作区"
      />
      <div v-else :class="$style.currentSummary">
        <div :class="$style.workspaceMark">
          <img v-if="currentWorkspace.logo_url" :src="currentWorkspace.logo_url" alt="" />
          <span v-else>{{ currentWorkspace.display_name.slice(0, 1).toUpperCase() }}</span>
        </div>
        <div :class="$style.currentIdentity">
          <strong>{{ currentWorkspace.display_name }}</strong>
          <span class="mono">{{ currentWorkspace.slug }}</span>
        </div>
        <div :class="$style.currentMeta">
          <UBadge
            :label="workspaceTypeLabel[currentWorkspace.workspace_type] ?? currentWorkspace.workspace_type"
            color="neutral"
            variant="subtle"
          />
          <UBadge :label="currentWorkspace.plan" color="primary" variant="subtle" />
        </div>
      </div>
    </section>

    <WorkspaceMemberPanel v-if="currentWorkspaceId" :disabled="workspaceBusy" />

    <section :class="$style.section" aria-labelledby="workspace-list-title">
      <header :class="$style.sectionHeader">
        <div>
          <h2 id="workspace-list-title">我的工作区</h2>
          <p>创建新空间、接受邀请或切换工作区</p>
        </div>
        <div :class="$style.headerActions">
          <UTooltip text="接受邀请">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              square
              icon="i-lucide-mail-check"
              aria-label="接受工作区邀请"
              :disabled="workspaceBusy"
              @click="acceptOpen = true"
            />
          </UTooltip>
          <UButton
            size="sm"
            icon="i-lucide-plus"
            label="创建"
            :disabled="workspaceBusy"
            @click="openEditor('create')"
          />
        </div>
      </header>

      <UEmpty
        v-if="!workspaces.length"
        :class="$style.empty"
        variant="naked"
        icon="i-lucide-building-2"
        title="暂无工作区"
      />
      <ul v-else :class="$style.workspaceList">
        <li v-for="workspace in workspaces" :key="workspace.id" :class="$style.workspaceItem">
          <div :class="$style.workspaceInfo">
            <div :class="$style.workspaceNameLine">
              <strong>{{ workspace.display_name }}</strong>
              <UBadge
                v-if="workspace.id === currentWorkspaceId"
                label="当前"
                color="success"
                variant="subtle"
              />
            </div>
            <span class="mono" :class="$style.workspaceMeta">{{ workspace.slug }}</span>
          </div>
          <div :class="$style.workspaceActions">
            <UButton
              v-if="workspace.id !== currentWorkspaceId"
              color="neutral"
              variant="outline"
              size="sm"
              label="切换"
              :disabled="workspaceBusy"
              :loading="switchingId === workspace.id"
              @click="onWorkspaceSwitch(workspace.id)"
            />
            <UTooltip v-if="canDeleteWorkspace(workspace)" text="删除工作区">
              <UButton
                color="error"
                variant="ghost"
                size="sm"
                square
                icon="i-lucide-trash-2"
                :disabled="workspaceBusy"
                :aria-label="`删除 ${workspace.display_name}`"
                @click="openDelete(workspace)"
              />
            </UTooltip>
          </div>
        </li>
      </ul>
    </section>

    <WorkspaceEditorModal
      v-model:open="editorOpen"
      :mode="editorMode"
      :workspace="currentWorkspace"
      :loading="editorSaving"
      @save="onSaveWorkspace"
    />
    <WorkspaceAcceptModal
      v-model:open="acceptOpen"
      :loading="accepting"
      @accept="onAcceptInvite"
    />
    <WorkspaceDeleteModal
      :open="Boolean(pendingDelete)"
      :workspace="pendingDelete"
      :loading="deleting"
      @update:open="(open) => { if (!open) pendingDelete = null }"
      @confirm="onDeleteWorkspace"
    />
  </div>
</template>

<style module src="./index.module.css"></style>
