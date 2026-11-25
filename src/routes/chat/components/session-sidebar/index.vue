<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { DropdownMenuItem, FormError } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import { useRoute, useRouter } from 'vue-router'
import WorkspaceSelector from '@/components/workspace-selector/index.vue'
import { WORKBENCH_APPS } from '@/constants'
import type { Session, SessionAppId } from '@/interfaces'
import { useConsoleStore } from '@/stores/console'
import { useTeamsStore } from '@/stores/teams'
import { parseShareIdList } from '@/utils/session-share'

defineOptions({ name: 'SessionSidebar' })

const emit = defineEmits<{ navigate: [] }>()
const router = useRouter()
const route = useRoute()
const toast = useToast()
const consoleStore = useConsoleStore()
const teamsStore = useTeamsStore()
const { state, selectSession, newSession, openApp, renameSession, deleteSessions } = consoleStore

const selectMode = ref(false)
const selected = ref<Set<string>>(new Set())
const editingId = ref<string | null>(null)
const editingText = ref('')
const editInput = ref<{ inputRef?: HTMLInputElement } | null>(null)
const collapsedApps = ref<Set<string>>(new Set(['quality', 'schedule', 'energy']))
const deleteConfirmOpen = ref(false)
const pendingDeleteIds = ref<string[]>([])
const deleting = ref(false)
const sharingSession = ref<Session | null>(null)
const sharing = ref(false)
const shareForm = reactive({
  visibility: 'private' as 'private' | 'workspace' | 'public',
  users: '',
  departments: '',
  groups: '',
})
const visibilityItems = [
  { value: 'private', label: '仅自己' },
  { value: 'workspace', label: '当前工作区' },
  { value: 'public', label: '公开' },
]

const generalSessions = computed(() => state.sessions.filter((session) => !session.appId))

/** Team 会话的标识名：取不到列表时单独查详情，后端没有了显示「Team 已删除」。 */
watch(() => [...new Set(state.sessions.map((session) => session.teamDefinitionId).filter((id): id is number => id != null))], (ids) => {
  for (const id of ids) void teamsStore.resolveTeamName(id)
}, { immediate: true })

function teamLabel(teamId: number) {
  const name = teamsStore.teamName(teamId)
  return name === null ? 'Team 已删除' : `Team · ${name ?? teamId}`
}
const knownAppIds = new Set<string>(WORKBENCH_APPS.map((app) => app.id))
const appGroups = computed(() => {
  const groups: Array<{
    id: string
    name: string
    icon: string
    status: 'nominal' | 'warning'
    sessions: Session[]
    appId?: SessionAppId
  }> = WORKBENCH_APPS.map((app) => ({
    ...app,
    appId: app.id,
    sessions: state.sessions.filter((session) => session.appId === app.id),
  }))
  const unavailableSessions = state.sessions.filter((session) => session.appId && !knownAppIds.has(session.appId))
  if (unavailableSessions.length) {
    groups.push({ id: 'other', name: '其他应用会话', icon: 'blocks', status: 'nominal', sessions: unavailableSessions })
  }
  return groups
})
const activeAppId = computed<SessionAppId | null>(() => state.activeAppId)
const activeAppGroupId = computed(() => activeAppId.value && knownAppIds.has(activeAppId.value) ? activeAppId.value : activeAppId.value ? 'other' : null)
const allSelected = computed(() => state.sessions.length > 0 && state.sessions.every((session) => selected.value.has(session.id)))
const selectedReadOnly = computed(() => [...selected.value].some((id) => state.sessions.find((session) => session.id === id)?.readOnly))

watch(activeAppGroupId, (id) => {
  if (!id) return
  const next = new Set(collapsedApps.value)
  next.delete(id)
  collapsedApps.value = next
}, { immediate: true })

watch(() => state.sessions.map((session) => session.id).join('|'), () => {
  selected.value = new Set()
  selectMode.value = false
  editingId.value = null
})

function toggleApp(id: string) {
  const next = new Set(collapsedApps.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedApps.value = next
}

function onItemClick(session: Session) {
  if (editingId.value === session.id) return
  if (selectMode.value) toggleSelect(session.id)
  else {
    selectSession(session.id)
    void router.push({ name: 'chat', params: { sessionId: session.id } })
    emit('navigate')
  }
}

function onOpenApp(appId: SessionAppId) {
  openApp(appId)
  const sessionId = state.activeSessionId || undefined
  void router.push({ name: 'chat', params: sessionId ? { sessionId } : {} })
  emit('navigate')
}

function onNewSession() {
  newSession()
  void router.push({ name: 'chat', params: state.activeSessionId ? { sessionId: state.activeSessionId } : {} })
  emit('navigate')
}

function onNewAppSession(appId: SessionAppId) {
  newSession(appId)
  const next = new Set(collapsedApps.value)
  next.delete(appId)
  collapsedApps.value = next
  void router.push({ name: 'chat', params: state.activeSessionId ? { sessionId: state.activeSessionId } : {} })
  emit('navigate')
}

function replaceActiveChatRoute() {
  if (route.name !== 'chat') return
  void router.replace({ name: 'chat', params: state.activeSessionId ? { sessionId: state.activeSessionId } : {} })
}

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  selected.value = new Set()
  editingId.value = null
}

function toggleSelect(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function toggleSelectAll() {
  selected.value = allSelected.value ? new Set() : new Set(state.sessions.map((session) => session.id))
}

function requestDelete(ids: string[]) {
  if (!ids.length || ids.some((id) => state.sessions.find((session) => session.id === id)?.readOnly)) return
  pendingDeleteIds.value = ids
  deleteConfirmOpen.value = true
}

function openShare(session: Session) {
  if (session.readOnly) return
  sharingSession.value = session
  shareForm.visibility = session.visibility ?? 'private'
  shareForm.users = (session.sharedWith ?? []).join(', ')
  shareForm.departments = (session.sharedWithDepartments ?? []).join(', ')
  shareForm.groups = (session.sharedWithGroups ?? []).join(', ')
}

function validateShare(values: Partial<typeof shareForm>): FormError[] {
  const fields = [
    ['users', '用户 ID'],
    ['departments', '部门 ID'],
    ['groups', '群组 ID'],
  ] as const
  return fields.flatMap(([name, label]) => (
    parseShareIdList(values[name] ?? '') === null
      ? [{ name, message: `${label}必须是用逗号分隔的正整数` }]
      : []
  ))
}

async function confirmShare() {
  const session = sharingSession.value
  if (!session || sharing.value) return
  const users = parseShareIdList(shareForm.users)
  const departments = parseShareIdList(shareForm.departments)
  const groups = parseShareIdList(shareForm.groups)
  if (!users || !departments || !groups) return
  sharing.value = true
  const ok = await consoleStore.shareSession(session.id, {
    visibility: shareForm.visibility,
    share_with: {
      users,
      departments,
      groups,
    },
  })
  sharing.value = false
  if (ok) {
    sharingSession.value = null
    toast.add({ title: '会话共享范围已更新', color: 'success', icon: 'i-lucide-share-2' })
  } else {
    toast.add({ title: '共享设置失败', color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

async function confirmArchive(session: Session) {
  const wasActive = session.id === state.activeSessionId
  const ok = await consoleStore.archiveSession(session.id)
  if (!ok) {
    toast.add({ title: '归档失败', color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  if (wasActive) replaceActiveChatRoute()
  toast.add({ title: '会话已归档', color: 'success', icon: 'i-lucide-archive' })
}

function sessionMenuItems(session: Session): DropdownMenuItem[] {
  const backendSession = /^\d+$/.test(session.id)
  return [
    {
      label: '共享设置',
      icon: 'i-lucide-share-2',
      disabled: !backendSession || session.readOnly,
      onSelect: () => openShare(session),
    },
    {
      label: '归档会话',
      icon: 'i-lucide-archive',
      disabled: !backendSession || session.readOnly,
      onSelect: () => { void confirmArchive(session) },
    },
  ]
}

async function startRename(session: Session) {
  if (session.readOnly) return
  editingId.value = session.id
  editingText.value = session.title
  await nextTick()
  editInput.value?.inputRef?.focus()
  editInput.value?.inputRef?.select()
}

async function commitRename() {
  if (!editingId.value) return
  await renameSession(editingId.value, editingText.value)
  editingId.value = null
}

function cancelRename() {
  editingId.value = null
}

async function confirmDelete() {
  if (!pendingDeleteIds.value.length || deleting.value) return
  deleting.value = true
  const ids = [...pendingDeleteIds.value]
  const removedActive = ids.includes(state.activeSessionId)
  await deleteSessions(ids)
  if (removedActive) replaceActiveChatRoute()
  deleting.value = false
  deleteConfirmOpen.value = false
  pendingDeleteIds.value = []
  if (selectMode.value) {
    selected.value = new Set()
    selectMode.value = false
  }
}
</script>

<template>
  <aside :class="[$style['left-bar'], 'left-bar']">
    <WorkspaceSelector />

    <header :class="$style['sidebar-head']">
      <h2>应用与会话</h2>
      <UButton
        color="neutral"
        variant="ghost"
        square
        :class="[$style['head-action'], { [$style.active]: selectMode }]"
        :title="selectMode ? '退出批量管理' : '批量管理'"
        @click="toggleSelectMode"
      >
        <i class="icon icon-list-checks"></i>
      </UButton>
      <UButton color="neutral" variant="ghost" square :class="$style['head-action']" title="新建会话" @click="onNewSession">
        <i class="icon icon-square-pen"></i>
      </UButton>
    </header>

    <div :class="$style['sidebar-content']">
      <div v-if="selectMode" :class="$style['batch-bar']">
        <UButton color="neutral" variant="ghost" @click="toggleSelectAll"><i :class="`icon icon-${allSelected ? 'square-check-big' : 'square'}`"></i>全选</UButton>
        <span class="mono">{{ selected.size }}</span>
        <UButton color="error" variant="ghost" square :disabled="!selected.size || selectedReadOnly" aria-label="删除选中的会话" @click="requestDelete([...selected])"><i class="icon icon-trash-2"></i></UButton>
      </div>

      <section :class="$style['nav-section']">
        <div :class="$style['section-label']">运行中的应用</div>
        <div
          v-for="app in appGroups"
          :key="app.id"
          :class="[$style['app-group'], { [$style.collapsed]: collapsedApps.has(app.id) }]"
        >
          <div :class="$style['app-node-wrap']">
            <UButton
              color="neutral"
              variant="ghost"
              :class="$style['app-toggle']"
              :title="collapsedApps.has(app.id) ? `展开${app.name}会话` : `收起${app.name}会话`"
              :aria-label="collapsedApps.has(app.id) ? `展开${app.name}会话` : `收起${app.name}会话`"
              :aria-expanded="!collapsedApps.has(app.id)"
              @click="toggleApp(app.id)"
            >
              <i :class="[$style['twisty'], 'icon icon-chevron-down']"></i>
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              :class="[$style['app-node'], { [$style.active]: activeAppGroupId === app.id }]"
              :disabled="!app.appId"
              :title="app.appId ? `打开${app.name}` : app.name"
              @click="app.appId && onOpenApp(app.appId)"
            >
              <span :class="$style['app-icon']"><i :class="`icon icon-${app.icon}`"></i></span>
              <span :class="$style['item-text']">{{ app.name }}</span>
              <UChip as="span" standalone size="xs" :ui="{ base: `dot ${app.status}` }" :title="app.status === 'warning' ? '存在告警' : '运行正常'" :aria-label="app.status === 'warning' ? '存在告警' : '运行正常'" />
            </UButton>
            <UButton v-if="app.appId" color="neutral" variant="ghost" square :class="$style['app-new']" :title="`在${app.name}中新建会话`" @click="onNewAppSession(app.appId)">
              <i class="icon icon-plus"></i>
            </UButton>
          </div>
          <UCollapsible :open="!collapsedApps.has(app.id)" :unmount-on-hide="false">
            <template #content>
              <div :class="$style['session-list']">
                <div v-if="!app.sessions.length" :class="[$style['empty-app'], 'mono']">暂无会话</div>
                <div
                  v-for="session in app.sessions"
                  :key="session.id"
                  :class="[
                    $style['session-item'],
                    {
                      [$style.active]: session.id === state.activeSessionId && !selectMode,
                      [$style.selected]: selectMode && selected.has(session.id),
                    },
                  ]"
                >
                  <UInput
                    v-if="editingId === session.id"
                    ref="editInput"
                    v-model="editingText"
                    :class="$style['session-edit']"
                    @click.stop
                    @keydown.enter="commitRename"
                    @keydown.esc.prevent="cancelRename"
                    @blur="commitRename"
                  />
                  <UButton
                    v-else
                    color="neutral"
                    variant="ghost"
                    block
                    :class="$style['session-main']"
                    :aria-label="selectMode ? `${selected.has(session.id) ? '取消选择' : '选择'}会话 ${session.title}` : `打开会话 ${session.title}`"
                    :aria-pressed="selectMode ? selected.has(session.id) : undefined"
                    @click="onItemClick(session)"
                  >
                    <i v-if="selectMode" :class="`icon icon-${selected.has(session.id) ? 'square-check-big' : 'square'}`"></i>
                    <span :class="$style['item-text']" :title="session.title">{{ session.title }}</span>
                  </UButton>
                  <div v-if="!selectMode && editingId !== session.id" :class="$style['session-actions']">
                    <UDropdownMenu :items="sessionMenuItems(session)">
                      <UButton color="neutral" variant="ghost" square title="更多操作" @click.stop><i class="icon icon-ellipsis"></i></UButton>
                    </UDropdownMenu>
                    <UButton color="neutral" variant="ghost" square title="重命名" :disabled="session.readOnly" @click.stop="startRename(session)"><i class="icon icon-pencil"></i></UButton>
                    <UButton color="error" variant="ghost" square title="删除" :disabled="session.readOnly" @click.stop="requestDelete([session.id])"><i class="icon icon-trash-2"></i></UButton>
                  </div>
                </div>
              </div>
            </template>
          </UCollapsible>
        </div>
      </section>

      <section :class="$style['nav-section']">
        <div :class="[$style['section-label'], $style['section-label-row']]">
          <span>普通对话</span>
          <span :class="[$style['count'], 'mono']">{{ generalSessions.length }}</span>
        </div>
        <div v-if="!generalSessions.length" :class="$style['empty-general']">暂无普通对话</div>
        <div
          v-for="session in generalSessions"
          :key="session.id"
          :class="[
            $style['session-item'],
            $style['general-session'],
            {
              [$style.active]: session.id === state.activeSessionId && !selectMode,
              [$style.selected]: selectMode && selected.has(session.id),
            },
          ]"
        >
          <UInput
            v-if="editingId === session.id"
            ref="editInput"
            v-model="editingText"
            :class="$style['session-edit']"
            @click.stop
            @keydown.enter="commitRename"
            @keydown.esc.prevent="cancelRename"
            @blur="commitRename"
          />
          <UButton
            v-else
            color="neutral"
            variant="ghost"
            block
            :class="$style['session-main']"
            :aria-label="selectMode ? `${selected.has(session.id) ? '取消选择' : '选择'}会话 ${session.title}` : `打开会话 ${session.title}`"
            :aria-pressed="selectMode ? selected.has(session.id) : undefined"
            @click="onItemClick(session)"
          >
            <i v-if="selectMode" :class="`icon icon-${selected.has(session.id) ? 'square-check-big' : 'square'}`"></i>
            <UTooltip v-else-if="session.teamDefinitionId != null" :text="teamLabel(session.teamDefinitionId)">
              <i class="icon icon-users-round" :aria-label="teamLabel(session.teamDefinitionId)"></i>
            </UTooltip>
            <i v-else class="icon icon-message-square"></i>
            <span :class="$style['item-text']" :title="session.title">{{ session.title }}</span>
          </UButton>
          <div v-if="!selectMode && editingId !== session.id" :class="$style['session-actions']">
            <UDropdownMenu :items="sessionMenuItems(session)">
              <UButton color="neutral" variant="ghost" square title="更多操作" @click.stop><i class="icon icon-ellipsis"></i></UButton>
            </UDropdownMenu>
            <UButton color="neutral" variant="ghost" square title="重命名" :disabled="session.readOnly" @click.stop="startRename(session)"><i class="icon icon-pencil"></i></UButton>
            <UButton color="error" variant="ghost" square title="删除" :disabled="session.readOnly" @click.stop="requestDelete([session.id])"><i class="icon icon-trash-2"></i></UButton>
          </div>
        </div>
      </section>
    </div>

    <footer :class="$style['sidebar-foot']">
      <div :class="$style['capacity']">
        <div :class="[$style['capacity-line'], 'mono']"><span>本月 Agent 用量</span><span>68%</span></div>
        <div :class="$style['capacity-track']"><div :class="$style['capacity-fill']"></div></div>
      </div>
    </footer>

    <UModal
      v-model:open="deleteConfirmOpen"
      :title="pendingDeleteIds.length > 1 ? '删除选中的会话' : '删除会话'"
      description="删除后无法恢复。"
    >
      <template #footer>
        <UButton color="neutral" variant="outline" @click="deleteConfirmOpen = false">取消</UButton>
        <UButton color="error" :loading="deleting" @click="confirmDelete">确认删除</UButton>
      </template>
    </UModal>

    <UModal
      :open="Boolean(sharingSession)"
      title="共享会话"
      :description="sharingSession ? `设置「${sharingSession.title}」的可见范围。` : ''"
      @update:open="(open) => { if (!open) sharingSession = null }"
    >
      <template #body>
        <UForm id="session-share-form" :state="shareForm" :validate="validateShare" :class="$style['share-form']" @submit="confirmShare">
          <UFormField label="可见性" name="visibility">
            <USelect v-model="shareForm.visibility" :items="visibilityItems" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="用户 ID" name="users" hint="多个 ID 用逗号分隔">
            <UInput v-model="shareForm.users" class="w-full" placeholder="12, 18" />
          </UFormField>
          <UFormField label="部门 ID" name="departments" hint="多个 ID 用逗号分隔">
            <UInput v-model="shareForm.departments" class="w-full" placeholder="3, 7" />
          </UFormField>
          <UFormField label="群组 ID" name="groups" hint="多个 ID 用逗号分隔">
            <UInput v-model="shareForm.groups" class="w-full" placeholder="5, 9" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" @click="sharingSession = null" />
        <UButton type="submit" form="session-share-form" label="保存共享" icon="i-lucide-share-2" :loading="sharing" />
      </template>
    </UModal>
  </aside>
</template>

<style module src="./index.module.css"></style>
