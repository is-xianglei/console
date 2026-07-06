<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useConsoleStore } from './stores/console'
import LeftSidebar from './components/LeftSidebar.vue'
import ChatArea from './components/chat/ChatArea.vue'
import AppCenter from './components/apps/AppCenter.vue'
import SettingsView from './components/settings/SettingsView.vue'
import RightSidebar from './components/right/RightSidebar.vue'

const {
  state,
  toggleTheme,
  toggleLeft,
  toggleRight,
  loadHealth,
  loadSessions,
  seedConversation,
  setView,
} = useConsoleStore()

const agentCount = computed(() => state.agents.length)
/** 右侧子代理栏是否“本应可用”(对话视图且已派发子代理) */
const rightAvailable = computed(() => state.view === 'chat' && state.agents.length > 0)
/** 右侧栏实际是否显示:可用 且 未被收缩 */
const showRight = computed(() => rightAvailable.value && !state.rightCollapsed)

/** 命令栏健康指示:映射后端 health 到状态点样式与文案 */
const healthDot = computed(() =>
  state.health === 'ok' ? 'nominal' : state.health === 'unknown' ? 'idle' : 'error',
)
const healthText = computed(() =>
  state.health === 'ok'
    ? 'SYSTEM NOMINAL'
    : state.health === 'unknown'
      ? 'CONNECTING…'
      : 'BACKEND OFFLINE',
)

onMounted(async () => {
  loadHealth()
  const ok = await loadSessions()
  // 后端会话加载失败(离线)时,用种子对话兜底,保证界面非空
  if (!ok) seedConversation()
})
</script>

<template>
  <div class="shell">
    <header class="command-bar">
      <button
        class="cmd-btn"
        :class="{ active: !state.leftCollapsed }"
        :title="state.leftCollapsed ? '展开会话栏' : '收起会话栏'"
        @click="toggleLeft"
      >
        <i class="icon icon-panel-left"></i>
      </button>
      <div class="cmd-brand">
        <svg class="cmd-hex" viewBox="0 0 20 22" fill="none">
          <path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" />
        </svg>
        <span class="cmd-title">Hyperreal</span>
        <span class="cmd-sub mono">// agent console</span>
      </div>
      <div class="cmd-spacer"></div>
      <div class="cmd-stat mono"><span class="dot" :class="healthDot"></span>{{ healthText }}</div>
      <div class="cmd-stat mono">◇ {{ agentCount }} AGENTS</div>
      <button class="cmd-btn" :title="state.theme === 'dark' ? '切到亮色' : '切到暗色'" @click="toggleTheme">
        <i :class="`icon icon-${state.theme === 'dark' ? 'sun' : 'moon'}`"></i>
      </button>
      <button
        v-if="rightAvailable"
        class="cmd-btn"
        :class="{ active: !state.rightCollapsed }"
        :title="state.rightCollapsed ? '展开子代理栏' : '收起子代理栏'"
        @click="toggleRight"
      >
        <i class="icon icon-panel-right"></i>
      </button>
      <button
        class="cmd-btn"
        :class="{ active: state.view === 'settings' }"
        title="设置"
        @click="setView(state.view === 'settings' ? 'chat' : 'settings')"
      >
        <i class="icon icon-settings"></i>
      </button>
    </header>

    <div class="workspace">
      <Transition name="left-slide">
        <LeftSidebar v-show="!state.leftCollapsed" />
      </Transition>
      <ChatArea v-show="state.view === 'chat'" />
      <AppCenter v-if="state.view === 'apps'" />
      <SettingsView v-if="state.view === 'settings'" />
      <Transition name="right-slide">
        <RightSidebar v-if="showRight" />
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  /* 仅适配桌面 ≥1024px:更窄时整体横向滚动,避免三栏被挤压破版 */
  min-width: 1024px;
  overflow-x: auto;
}
.command-bar {
  height: 48px;
  flex-shrink: 0;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
}
.cmd-brand {
  display: flex;
  align-items: center;
  gap: 9px;
}
.cmd-hex {
  width: 18px;
  height: 18px;
  color: var(--accent-agent);
}
.cmd-title {
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.cmd-sub {
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.06em;
}
.cmd-spacer {
  flex: 1;
}
.cmd-stat {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.06em;
}
.cmd-btn {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-control);
  background: transparent;
  border: none;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.cmd-btn:hover {
  background: var(--bg-surface);
  color: var(--text-secondary);
}
.cmd-btn.active {
  color: var(--accent-agent);
}
.cmd-btn i {
  font-size: 15px;
}
.workspace {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* 侧栏机械式收缩/展开(快速启动,精确停止,无弹跳) */
.left-slide-enter-active,
.left-slide-leave-active,
.right-slide-enter-active,
.right-slide-leave-active {
  transition: width var(--dur-slow) var(--ease-out),
    opacity var(--dur-med) var(--ease-out);
  overflow: hidden;
  min-width: 0;
}
.left-slide-enter-from,
.left-slide-leave-to,
.right-slide-enter-from,
.right-slide-leave-to {
  width: 0 !important;
  opacity: 0;
}
.left-slide-enter-to,
.left-slide-leave-from {
  width: var(--left-bar-w);
  opacity: 1;
}
.right-slide-enter-to,
.right-slide-leave-from {
  width: var(--right-bar-w);
  opacity: 1;
}
</style>
