<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useConsoleStore } from '../stores/console'
import type { Session } from '../types'

const { state, selectSession, newSession, setSearch, setView, renameSession, deleteSessions } =
  useConsoleStore()

const filtered = computed(() =>
  state.sessions.filter((s) =>
    s.title.toLowerCase().includes(state.search.toLowerCase()),
  ),
)

// ===== 多选管理态 =====
const selectMode = ref(false)
const selected = ref<Set<string>>(new Set())
const confirmBatch = ref(false)

// ===== 行内重命名态 =====
const editingId = ref<string | null>(null)
const editingText = ref('')

// ===== 单条删除确认态 =====
const pendingDeleteId = ref<string | null>(null)

const allSelected = computed(
  () => filtered.value.length > 0 && filtered.value.every((s) => selected.value.has(s.id)),
)

// PLACEHOLDER_SIDEBAR_METHODS

/** 点击会话项:多选模式下切换选中,否则切换会话 */
function onItemClick(s: Session) {
  if (editingId.value === s.id) return
  if (selectMode.value) toggleSelect(s.id)
  else selectSession(s.id)
}

// ===== 多选 =====
function toggleSelectMode() {
  selectMode.value = !selectMode.value
  selected.value = new Set()
  confirmBatch.value = false
  // 退出编辑/删除确认,避免态残留
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
  if (allSelected.value) selected.value = new Set()
  else selected.value = new Set(filtered.value.map((s) => s.id))
}
async function confirmBatchDelete() {
  await deleteSessions([...selected.value])
  selected.value = new Set()
  confirmBatch.value = false
  selectMode.value = false
}
// PLACEHOLDER_SIDEBAR_METHODS2

// ===== 行内重命名 =====
const editInput = ref<HTMLInputElement | null>(null)
async function startRename(s: Session) {
  pendingDeleteId.value = null
  editingId.value = s.id
  editingText.value = s.title
  await nextTick()
  editInput.value?.focus()
  editInput.value?.select()
}
async function commitRename() {
  const id = editingId.value
  if (!id) return
  await renameSession(id, editingText.value)
  editingId.value = null
}
function cancelRename() {
  editingId.value = null
}

// ===== 单条删除确认 =====
function askDelete(s: Session) {
  editingId.value = null
  pendingDeleteId.value = s.id
}
function cancelDelete() {
  pendingDeleteId.value = null
}
async function confirmDelete(id: string) {
  await deleteSessions([id])
  pendingDeleteId.value = null
}
</script>

<template>
  <aside class="left-bar">
    <div class="left-top">
      <div class="search-wrap">
        <i class="icon icon-search"></i>
        <input
          class="search-input"
          placeholder="搜索会话…"
          :value="state.search"
          @input="setSearch(($event.target as HTMLInputElement).value)"
        />
      </div>
      <nav class="left-nav">
        <button
          class="nav-item"
          :class="{ active: state.view === 'apps' }"
          @click="setView('apps')"
        >
          <i class="icon icon-layout-grid"></i>
          <span class="nav-label">应用中心</span>
        </button>
      </nav>
      <button class="new-btn" @click="newSession">
        <i class="icon icon-plus"></i> 新建会话
      </button>
    </div>

    <div class="left-scroll">
      <div class="list-label">
        <span class="sec-head">会话列表</span>
        <div class="label-right">
          <span class="sec-head mono">{{ filtered.length }}</span>
          <button
            class="manage-btn"
            :class="{ active: selectMode }"
            :title="selectMode ? '退出批量管理' : '批量管理'"
            @click="toggleSelectMode"
          >
            <i class="icon icon-list-checks"></i>
          </button>
        </div>
      </div>

      <!-- 多选操作条 -->
      <div v-if="selectMode" class="batch-bar">
        <button class="batch-check" @click="toggleSelectAll">
          <i class="icon" :class="allSelected ? 'icon-check-square' : 'icon-square'"></i>
          <span>全选</span>
        </button>
        <span class="batch-count mono">已选 {{ selected.size }}</span>
        <template v-if="confirmBatch">
          <button class="batch-del confirm" :disabled="!selected.size" @click="confirmBatchDelete">
            <i class="icon icon-check"></i> 确认删除
          </button>
          <button class="batch-cancel" @click="confirmBatch = false">
            <i class="icon icon-x"></i>
          </button>
        </template>
        <button
          v-else
          class="batch-del"
          :disabled="!selected.size"
          @click="confirmBatch = true"
        >
          <i class="icon icon-trash-2"></i> 删除
        </button>
      </div>

      <div
        v-for="s in filtered"
        :key="s.id"
        class="sess-item"
        :class="{
          active: s.id === state.activeSessionId && state.view === 'chat' && !selectMode,
          selected: selectMode && selected.has(s.id),
          editing: editingId === s.id,
        }"
        @click="onItemClick(s)"
      >
        <div class="sess-row">
          <i
            v-if="selectMode"
            class="icon sess-check"
            :class="selected.has(s.id) ? 'icon-check-square' : 'icon-square'"
          ></i>
          <i v-else class="icon icon-message-square sess-glyph"></i>

          <input
            v-if="editingId === s.id"
            ref="editInput"
            v-model="editingText"
            class="sess-edit"
            @click.stop
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="cancelRename"
            @blur="commitRename"
          />
          <span v-else class="sess-title">{{ s.title }}</span>

          <span v-if="s.badge && !selectMode && editingId !== s.id" class="sess-badge">{{ s.badge }}</span>

          <!-- 行内操作:重命名 / 删除(仅普通模式且非编辑态) -->
          <div v-if="!selectMode && editingId !== s.id" class="sess-actions">
            <template v-if="pendingDeleteId === s.id">
              <button class="act-btn danger" title="确认删除" @click.stop="confirmDelete(s.id)">
                <i class="icon icon-check"></i>
              </button>
              <button class="act-btn" title="取消" @click.stop="cancelDelete">
                <i class="icon icon-x"></i>
              </button>
            </template>
            <template v-else>
              <button class="act-btn" title="重命名" @click.stop="startRename(s)">
                <i class="icon icon-pencil"></i>
              </button>
              <button class="act-btn" title="删除" @click.stop="askDelete(s)">
                <i class="icon icon-trash-2"></i>
              </button>
            </template>
          </div>
        </div>
        <div v-if="editingId !== s.id" class="sess-meta">
          <span class="sess-time mono">{{ s.time }}</span>
          <span class="sess-count mono">{{ s.count }} 条</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<!-- PLACEHOLDER_STYLE_TOP -->
<style scoped>
.left-bar {
  width: var(--left-bar-w);
  flex-shrink: 0;
  background: var(--bg-panel);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.left-top {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid var(--border-subtle);
}
.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.search-wrap i {
  position: absolute;
  left: 10px;
  font-size: 13px;
  color: var(--text-dim);
  pointer-events: none;
}
.search-input {
  width: 100%;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  color: var(--text-primary);
  font-family: var(--font-data);
  font-size: 11px;
  padding: 7px 10px 7px 30px;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.search-input::placeholder {
  color: var(--text-dim);
}
.search-input:focus {
  outline: none;
  border-color: var(--accent-agent);
  box-shadow: 0 0 0 2px var(--accent-agent-dim);
}
/* PLACEHOLDER_STYLE2 */
.new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: var(--accent-agent-dim);
  color: var(--accent-agent);
  border: 1px solid rgba(45, 212, 191, 0.3);
  border-radius: var(--radius-control);
  padding: 8px 12px;
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background var(--dur-fast), box-shadow var(--dur-fast);
}
.new-btn:hover {
  background: rgba(45, 212, 191, 0.18);
  box-shadow: 0 0 16px var(--accent-agent-glow);
}
.new-btn i {
  font-size: 14px;
}
.left-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.list-label {
  padding: 6px 8px 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sess-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  border: 1px solid transparent;
  position: relative;
  transition: background var(--dur-fast), border-color var(--dur-fast);
}
.sess-item:hover {
  background: var(--bg-surface);
}
.sess-item.active {
  background: var(--bg-surface);
  border-color: var(--border);
}
.sess-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 18px;
  background: var(--accent-agent);
  border-radius: 0 2px 2px 0;
}
.sess-row {
  display: flex;
  align-items: center;
  gap: 7px;
}
.sess-glyph {
  font-size: 13px;
  color: var(--text-dim);
}
.sess-title {
  flex: 1;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sess-item.active .sess-title {
  color: var(--text-primary);
}
.sess-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 20px;
}
.sess-time {
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 0.04em;
}
.sess-count {
  font-size: 9px;
  color: var(--text-muted);
}
.sess-badge {
  margin-left: auto;
  font-family: var(--font-data);
  font-size: 9px;
  font-weight: 700;
  background: var(--accent-agent-dim);
  color: var(--accent-agent);
  padding: 1px 6px;
  border-radius: var(--radius-pill);
}
/* PLACEHOLDER_STYLE3 */
/* ===== 列表头:批量管理入口 ===== */
.label-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.manage-btn {
  width: 22px;
  height: 22px;
  border-radius: var(--radius-control);
  background: transparent;
  border: none;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.manage-btn:hover {
  background: var(--bg-surface);
  color: var(--text-secondary);
}
.manage-btn.active {
  color: var(--accent-agent);
  background: var(--accent-agent-dim);
}
.manage-btn i {
  font-size: 14px;
}
/* PLACEHOLDER_STYLE_BATCH */
/* ===== 多选操作条 ===== */
.batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.batch-check {
  display: flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.batch-check:hover {
  color: var(--text-primary);
}
.batch-check i {
  font-size: 14px;
  color: var(--accent-agent);
}
.batch-count {
  flex: 1;
  font-size: 10px;
  color: var(--text-dim);
}
.batch-del,
.batch-cancel {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  padding: 4px 8px;
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
}
/* PLACEHOLDER_STYLE_BATCH2 */
.batch-del {
  background: rgba(248, 113, 113, 0.12);
  color: #f87171;
}
.batch-del:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.2);
}
.batch-del.confirm {
  background: #f87171;
  color: #fff;
}
.batch-del:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.batch-cancel {
  background: var(--bg-surface);
  color: var(--text-dim);
}
.batch-cancel:hover {
  color: var(--text-secondary);
}
.batch-del i,
.batch-cancel i {
  font-size: 12px;
}
/* ===== 列表项:多选/编辑/操作 ===== */
.sess-check {
  font-size: 14px;
  color: var(--accent-agent);
}
.sess-item.selected {
  background: var(--accent-agent-dim);
  border-color: rgba(45, 212, 191, 0.3);
}
.sess-item.editing {
  background: var(--bg-surface);
  border-color: var(--border);
}
.sess-edit {
  flex: 1;
  min-width: 0;
  background: var(--bg-base, var(--bg-panel));
  border: 1px solid var(--accent-agent);
  border-radius: var(--radius-control);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 13px;
  padding: 3px 6px;
  outline: none;
}
/* PLACEHOLDER_STYLE_ACTIONS */
.sess-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  opacity: 0;
  transition: opacity var(--dur-fast);
}
.sess-item:hover .sess-actions {
  opacity: 1;
}
.act-btn {
  width: 22px;
  height: 22px;
  border-radius: var(--radius-control);
  background: transparent;
  border: none;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.act-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}
.act-btn.danger {
  color: #f87171;
}
.act-btn.danger:hover {
  background: rgba(248, 113, 113, 0.16);
}
.act-btn i {
  font-size: 13px;
}
.left-nav {
  display: flex;
}
.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  padding: 8px 12px;
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
}
.nav-item:hover {
  background: var(--border);
  color: var(--text-primary);
}
.nav-item.active {
  background: var(--border);
  border-color: var(--border-strong);
  color: var(--text-primary);
}
.nav-item > .icon:first-child {
  font-size: 14px;
}
.nav-label {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
</style>