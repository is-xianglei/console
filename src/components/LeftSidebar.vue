<script setup lang="ts">
import { computed } from 'vue'
import { useConsoleStore } from '../stores/console'

const { state, selectSession, newSession, setSearch, setView } = useConsoleStore()

const filtered = computed(() =>
  state.sessions.filter((s) =>
    s.title.toLowerCase().includes(state.search.toLowerCase()),
  ),
)
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
      <button class="new-btn" @click="newSession">
        <i class="icon icon-plus"></i> 新建会话
      </button>
    </div>

    <div class="left-scroll">
      <div class="list-label">
        <span class="sec-head">会话列表</span>
        <span class="sec-head mono">{{ filtered.length }}</span>
      </div>
      <div
        v-for="s in filtered"
        :key="s.id"
        class="sess-item"
        :class="{ active: s.id === state.activeSessionId && state.view === 'chat' }"
        @click="selectSession(s.id)"
      >
        <div class="sess-row">
          <i class="icon icon-message-square sess-glyph"></i>
          <span class="sess-title">{{ s.title }}</span>
          <span v-if="s.badge" class="sess-badge">{{ s.badge }}</span>
        </div>
        <div class="sess-meta">
          <span class="sess-time mono">{{ s.time }}</span>
          <span class="sess-count mono">{{ s.count }} 条</span>
        </div>
      </div>
    </div>

    <nav class="left-nav">
      <button
        class="nav-item"
        :class="{ active: state.view === 'apps' }"
        @click="setView('apps')"
      >
        <i class="icon icon-layout-grid"></i>
        <span class="nav-label">应用中心</span>
        <i class="icon icon-chevron-right nav-arrow"></i>
      </button>
    </nav>
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
.left-nav {
  border-top: 1px solid var(--border-subtle);
  padding: 8px;
}
.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  position: relative;
  transition: background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
}
.nav-item:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}
.nav-item.active {
  background: var(--bg-surface);
  border-color: var(--border);
  color: var(--accent-agent);
}
.nav-item.active::before {
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
.nav-item > .icon:first-child {
  font-size: 16px;
}
.nav-label {
  flex: 1;
  text-align: left;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.nav-arrow {
  font-size: 14px;
  color: var(--text-dim);
}
</style>