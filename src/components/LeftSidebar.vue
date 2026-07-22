<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConsoleStore } from '../stores/console'
import type { Session, SessionAppId } from '../types'
import { WORKBENCH_APPS } from '../data/appRegistry'
import WorkspaceSelector from './navigation/WorkspaceSelector.vue'

const emit = defineEmits<{ navigate: [] }>()
const router = useRouter()
const route = useRoute()
const { state, selectSession, newSession, openApp, renameSession, deleteSessions } = useConsoleStore()

const selectMode = ref(false)
const selected = ref<Set<string>>(new Set())
const confirmBatch = ref(false)
const editingId = ref<string | null>(null)
const editingText = ref('')
const pendingDeleteId = ref<string | null>(null)
const editInput = ref<HTMLInputElement | null>(null)
const collapsedApps = ref<Set<string>>(new Set(['quality', 'schedule', 'energy']))

const generalSessions = computed(() => state.sessions.filter((session) => !session.appId))
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

watch(activeAppGroupId, (id) => {
  if (!id) return
  const next = new Set(collapsedApps.value)
  next.delete(id)
  collapsedApps.value = next
}, { immediate: true })

watch(() => state.sessions.map((session) => session.id).join('|'), () => {
  selected.value = new Set()
  selectMode.value = false
  confirmBatch.value = false
  editingId.value = null
  pendingDeleteId.value = null
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
  confirmBatch.value = false
  editingId.value = null
  pendingDeleteId.value = null
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

async function confirmBatchDelete() {
  const removedActive = selected.value.has(state.activeSessionId)
  await deleteSessions([...selected.value])
  if (removedActive) replaceActiveChatRoute()
  selected.value = new Set()
  confirmBatch.value = false
  selectMode.value = false
}

async function startRename(session: Session) {
  pendingDeleteId.value = null
  editingId.value = session.id
  editingText.value = session.title
  await nextTick()
  editInput.value?.focus()
  editInput.value?.select()
}

async function commitRename() {
  if (!editingId.value) return
  await renameSession(editingId.value, editingText.value)
  editingId.value = null
}

function cancelRename() {
  editingId.value = null
}

async function confirmDelete(id: string) {
  const removedActive = state.activeSessionId === id
  await deleteSessions([id])
  if (removedActive) replaceActiveChatRoute()
  pendingDeleteId.value = null
}
</script>

<template>
  <aside class="left-bar">
    <WorkspaceSelector />

    <header class="sidebar-head">
      <h2>应用与会话</h2>
      <button class="head-action" :class="{ active: selectMode }" :title="selectMode ? '退出批量管理' : '批量管理'" @click="toggleSelectMode">
        <i class="icon icon-list-checks"></i>
      </button>
      <button class="head-action" title="新建会话" @click="onNewSession">
        <i class="icon icon-square-pen"></i>
      </button>
    </header>

    <div class="sidebar-content">
      <div v-if="selectMode" class="batch-bar">
        <button @click="toggleSelectAll"><i :class="`icon icon-${allSelected ? 'square-check-big' : 'square'}`"></i>全选</button>
        <span class="mono">{{ selected.size }}</span>
        <template v-if="confirmBatch">
          <button class="danger" :disabled="!selected.size" @click="confirmBatchDelete">确认删除</button>
          <button title="取消" @click="confirmBatch = false"><i class="icon icon-x"></i></button>
        </template>
        <button v-else class="danger" :disabled="!selected.size" @click="confirmBatch = true"><i class="icon icon-trash-2"></i></button>
      </div>

      <section class="nav-section">
        <div class="section-label">运行中的应用</div>
        <div v-for="app in appGroups" :key="app.id" class="app-group" :class="{ collapsed: collapsedApps.has(app.id) }">
          <div class="app-node-wrap">
            <button
              class="app-toggle"
              :title="collapsedApps.has(app.id) ? `展开${app.name}会话` : `收起${app.name}会话`"
              :aria-label="collapsedApps.has(app.id) ? `展开${app.name}会话` : `收起${app.name}会话`"
              :aria-expanded="!collapsedApps.has(app.id)"
              @click="toggleApp(app.id)"
            >
              <i class="icon icon-chevron-down twisty"></i>
            </button>
            <button
              class="app-node"
              :class="{ active: activeAppGroupId === app.id }"
              :disabled="!app.appId"
              :title="app.appId ? `打开${app.name}` : app.name"
              @click="app.appId && onOpenApp(app.appId)"
            >
              <span class="app-icon"><i :class="`icon icon-${app.icon}`"></i></span>
              <span class="item-text">{{ app.name }}</span>
              <span
                class="dot"
                :class="app.status"
                :title="app.status === 'warning' ? '存在告警' : '运行正常'"
                :aria-label="app.status === 'warning' ? '存在告警' : '运行正常'"
              ></span>
            </button>
            <button v-if="app.appId" class="app-new" :title="`在${app.name}中新建会话`" @click="onNewAppSession(app.appId)">
              <i class="icon icon-plus"></i>
            </button>
          </div>
          <div class="session-list">
            <div v-if="!app.sessions.length" class="empty-app mono">暂无会话</div>
            <div
              v-for="session in app.sessions"
              :key="session.id"
              class="session-item"
              :class="{ active: session.id === state.activeSessionId && !selectMode, selected: selectMode && selected.has(session.id) }"
              role="button"
              tabindex="0"
              :aria-label="selectMode ? `${selected.has(session.id) ? '取消选择' : '选择'}会话 ${session.title}` : `打开会话 ${session.title}`"
              :aria-pressed="selectMode ? selected.has(session.id) : undefined"
              @click="onItemClick(session)"
              @keydown.enter.self.prevent="onItemClick(session)"
              @keydown.space.self.prevent="onItemClick(session)"
            >
              <i v-if="selectMode" :class="`icon icon-${selected.has(session.id) ? 'square-check-big' : 'square'}`"></i>
              <input
                v-if="editingId === session.id"
                ref="editInput"
                v-model="editingText"
                class="session-edit"
                @click.stop
                @keydown.enter.prevent="commitRename"
                @keydown.esc.prevent="cancelRename"
                @blur="commitRename"
              />
              <span v-else class="item-text" :title="session.title">{{ session.title }}</span>
              <div v-if="!selectMode && editingId !== session.id" class="session-actions">
                <template v-if="pendingDeleteId === session.id">
                  <button title="确认删除" class="danger" @click.stop="confirmDelete(session.id)"><i class="icon icon-check"></i></button>
                  <button title="取消" @click.stop="pendingDeleteId = null"><i class="icon icon-x"></i></button>
                </template>
                <template v-else>
                  <button title="重命名" @click.stop="startRename(session)"><i class="icon icon-pencil"></i></button>
                  <button title="删除" @click.stop="pendingDeleteId = session.id"><i class="icon icon-trash-2"></i></button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="nav-section general-section">
        <div class="section-label section-label-row">
          <span>普通对话</span>
          <span class="count mono">{{ generalSessions.length }}</span>
        </div>
        <div v-if="!generalSessions.length" class="empty-general">暂无普通对话</div>
        <div
          v-for="session in generalSessions"
          :key="session.id"
          class="session-item general-session"
          :class="{ active: session.id === state.activeSessionId && !selectMode, selected: selectMode && selected.has(session.id) }"
          role="button"
          tabindex="0"
          :aria-label="selectMode ? `${selected.has(session.id) ? '取消选择' : '选择'}会话 ${session.title}` : `打开会话 ${session.title}`"
          :aria-pressed="selectMode ? selected.has(session.id) : undefined"
          @click="onItemClick(session)"
          @keydown.enter.self.prevent="onItemClick(session)"
          @keydown.space.self.prevent="onItemClick(session)"
        >
          <i v-if="selectMode" :class="`icon icon-${selected.has(session.id) ? 'square-check-big' : 'square'}`"></i>
          <i v-else class="icon icon-message-square"></i>
          <input
            v-if="editingId === session.id"
            ref="editInput"
            v-model="editingText"
            class="session-edit"
            @click.stop
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="cancelRename"
            @blur="commitRename"
          />
          <span v-else class="item-text" :title="session.title">{{ session.title }}</span>
          <div v-if="!selectMode && editingId !== session.id" class="session-actions">
            <template v-if="pendingDeleteId === session.id">
              <button title="确认删除" class="danger" @click.stop="confirmDelete(session.id)"><i class="icon icon-check"></i></button>
              <button title="取消" @click.stop="pendingDeleteId = null"><i class="icon icon-x"></i></button>
            </template>
            <template v-else>
              <button title="重命名" @click.stop="startRename(session)"><i class="icon icon-pencil"></i></button>
              <button title="删除" @click.stop="pendingDeleteId = session.id"><i class="icon icon-trash-2"></i></button>
            </template>
          </div>
        </div>
      </section>
    </div>

    <footer class="sidebar-foot">
      <div class="capacity">
        <div class="capacity-line mono"><span>本月 Agent 用量</span><span>68%</span></div>
        <div class="capacity-track"><div class="capacity-fill"></div></div>
      </div>
    </footer>
  </aside>
</template>

<style scoped>
.left-bar { width: var(--left-bar-w); flex: 0 0 var(--left-bar-w); min-width: 0; min-height: 0; overflow: hidden; border-right: 1px solid var(--border); background: var(--bg-surface); display: flex; flex-direction: column; }
.sidebar-head { padding: 12px 12px 8px; display: flex; align-items: center; gap: 8px; }
.sidebar-head h2 { flex: 1; color: var(--text-primary); font-family: var(--font-ui); font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
.head-action { width: 27px; height: 27px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-muted); display: grid; place-items: center; cursor: pointer; }
.head-action:hover,.head-action.active { background: var(--bg-elevated); color: var(--accent-agent); }.head-action i { font-size: 14px; }
.sidebar-content { flex: 1; min-height: 0; overflow-y: auto; padding: 0 7px 16px; }
.nav-section { margin-top: 12px; }
.section-label { padding: 0 8px 5px; color: var(--text-dim); font-family: var(--font-ui); font-size: 9px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; }
.section-label-row { display: flex; align-items: center; justify-content: space-between; }.section-label-row .count { letter-spacing: 0; }
.app-node,.session-item { width: 100%; min-width: 0; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary); display: flex; align-items: center; gap: 8px; text-align: left; cursor: pointer; transition: color var(--dur-fast), background var(--dur-fast); }
.app-node:hover,.session-item:hover { background: var(--bg-elevated); color: var(--text-primary); }
.app-node-wrap { position: relative; display: flex; align-items: center; }.app-toggle { width: 24px; height: 34px; flex: 0 0 24px; border: 0; background: transparent; color: var(--text-dim); display: grid; place-items: center; cursor: pointer; }.app-toggle:hover { color: var(--text-primary); }.app-node { height: 34px; min-width: 0; flex: 1; padding: 0 34px 0 0; font-family: var(--font-ui); }.app-node.active { background: var(--bg-elevated); color: var(--text-primary); }.app-node:disabled { cursor: default; }
.app-new { position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; border: 0; border-radius: var(--radius-control); background: var(--bg-elevated); color: var(--text-muted); display: grid; place-items: center; opacity: 0; pointer-events: none; cursor: pointer; transition: color var(--dur-fast), background var(--dur-fast), opacity var(--dur-fast); }.app-new:hover { background: var(--bg-hover); color: var(--accent-agent); }.app-new i { font-size: 12px; }.app-node-wrap:hover .app-new,.app-node-wrap:focus-within .app-new { opacity: 1; pointer-events: auto; }.app-node-wrap:hover .app-node .dot,.app-node-wrap:focus-within .app-node .dot { opacity: 0; }
.twisty { width: 14px; color: inherit; font-size: 11px; transition: transform var(--dur-fast) var(--ease-out); }.app-group.collapsed .twisty { transform: rotate(-90deg); }
.app-icon { width: 21px; height: 21px; flex: 0 0 21px; border: 1px solid var(--border); border-radius: 3px; background: var(--bg-card); color: var(--accent-agent); display: grid; place-items: center; }.app-icon i { font-size: 12px; }
.item-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-list { padding-left: 35px; }.app-group.collapsed .session-list { display: none; }
.session-item { height: 29px; padding: 0 5px 0 7px; position: relative; color: var(--text-muted); font-family: var(--font-body); font-size: 12px; }
.session-item::before { content: ''; position: absolute; left: -8px; width: 1px; height: 29px; background: var(--border); }.session-item.active,.session-item.selected { background: var(--bg-elevated); color: var(--text-primary); }.session-item.active::after { content: ''; position: absolute; left: 0; width: 2px; height: 12px; background: var(--accent-agent); }
.session-item > .icon { color: var(--accent-agent); font-size: 11px; }.empty-app { height: 26px; padding: 6px 8px; color: var(--text-dim); font-size: 8px; }
.general-session { height: 32px; padding: 0 5px 0 9px; }.general-session::before { display: none; }.general-session > .icon-message-square { color: var(--text-dim); }.general-session:hover > .icon-message-square,.general-session.active > .icon-message-square { color: var(--accent-agent); }.empty-general { height: 32px; padding: 7px 9px; color: var(--text-dim); font-size: 10px; }
.session-actions { display: flex; margin-left: auto; opacity: 0; pointer-events: none; }.session-item:hover .session-actions,.session-item:focus-within .session-actions { opacity: 1; pointer-events: auto; }
.session-actions button { width: 21px; height: 21px; border: 0; border-radius: 3px; background: transparent; color: var(--text-dim); display: grid; place-items: center; cursor: pointer; }.session-actions button:hover { background: var(--bg-hover); color: var(--text-primary); }.session-actions button.danger { color: var(--status-error); }.session-actions i { font-size: 11px; }
.session-edit { flex: 1; min-width: 0; height: 23px; padding: 0 5px; border: 1px solid var(--accent-agent); border-radius: var(--radius-control); outline: 0; background: var(--bg-panel); color: var(--text-primary); font-family: var(--font-body); font-size: 10px; }
.count { color: var(--text-dim); font-size: 9px; }
.batch-bar { min-height: 34px; margin: 2px 1px 8px; padding: 4px 6px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--bg-elevated); display: flex; align-items: center; gap: 5px; }.batch-bar > span { flex: 1; color: var(--text-dim); font-size: 9px; }.batch-bar button { min-height: 23px; padding: 0 5px; border: 0; border-radius: 3px; background: transparent; color: var(--text-muted); display: flex; align-items: center; gap: 4px; font-size: 9px; cursor: pointer; }.batch-bar button:hover { background: var(--bg-hover); color: var(--text-primary); }.batch-bar button.danger { color: var(--status-error); }.batch-bar button:disabled { opacity: .3; pointer-events: none; }
.sidebar-foot { padding: 8px; border-top: 1px solid var(--border); }.capacity { padding: 9px; border: 1px solid var(--border-subtle); border-radius: var(--radius-control); background: var(--bg-elevated); }.capacity-line { display: flex; justify-content: space-between; color: var(--text-muted); font-size: 9px; }.capacity-track { height: 3px; margin-top: 7px; background: var(--bg-hover); }.capacity-fill { width: 68%; height: 100%; background: var(--accent-agent); }
@media (max-width: 1180px) { .left-bar { width: 250px; flex-basis: 250px; } }
@media (hover: none) { .session-actions,.app-new { opacity: 1; pointer-events: auto; }.app-node .dot { opacity: 0; } }
@media (max-width: 760px) { .left-bar { position: fixed; z-index: 16; left: 0; top: 48px; bottom: 50px; width: min(300px, 86vw); flex-basis: auto; border-right-color: var(--border-visible); } }
</style>
