<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConsoleStore } from '../../stores/console'
import { APPS, FEATURED_APP } from '../../data/seed'

const router = useRouter()
const { state, launchApp } = useConsoleStore()
const launchFeedback = ref('')

async function handleLaunchApp(prompt?: string) {
  if (state.busy) {
    launchFeedback.value = '当前任务仍在执行，请等待完成后再派发新应用。'
    return
  }
  if (prompt && launchApp(prompt)) {
    launchFeedback.value = ''
    await router.push({
      name: 'chat',
      params: state.activeSessionId ? { sessionId: state.activeSessionId } : {},
    })
  }
}

const search = ref('')
const activeCat = ref('全部')

const categories = computed(() => {
  const set = new Set<string>(APPS.map((a) => a.category))
  return ['全部', ...Array.from(set)]
})

const filtered = computed(() =>
  APPS.filter((a) => {
    const matchCat = activeCat.value === '全部' || a.category === activeCat.value
    const q = search.value.toLowerCase()
    const matchQ =
      !q || a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q)
    return matchCat && matchQ
  }),
)

</script>

<template>
  <main class="app-center grid-bg">
    <div class="ac-scroll">
      <div class="ac-inner">
        <!-- 标题栏 -->
        <header class="ac-head">
          <div class="ac-head-text">
            <h1 class="ac-title">应用中心</h1>
            <p class="ac-sub">在 Hyperreal 中调用你的工业智能体应用</p>
          </div>
          <div class="ac-search">
            <i class="icon icon-search"></i>
            <input
              v-model="search"
              class="ac-search-input"
              aria-label="搜索应用"
              placeholder="搜索应用…"
            />
          </div>
        </header>

        <p v-if="state.busy || launchFeedback" class="launch-status" role="status" aria-live="polite">
          {{ launchFeedback || '当前任务正在执行，应用派发暂不可用。' }}
        </p>

        <!-- 推荐卡 -->
        <section
          class="hero"
          :class="{ disabled: state.busy }"
          role="button"
          :tabindex="state.busy ? -1 : 0"
          :aria-disabled="state.busy"
          @click="handleLaunchApp(FEATURED_APP.prompt)"
          @keydown.enter.self.prevent="handleLaunchApp(FEATURED_APP.prompt)"
          @keydown.space.self.prevent="handleLaunchApp(FEATURED_APP.prompt)"
        >
          <div class="hero-left">
            <div class="hero-app">
              <span class="hero-ic"><i :class="`icon icon-${FEATURED_APP.icon}`"></i></span>
              <span class="hero-tag mono">@{{ FEATURED_APP.name }}</span>
            </div>
            <h2 class="hero-title">{{ FEATURED_APP.title }}</h2>
            <p class="hero-desc">{{ FEATURED_APP.desc }}</p>
            <span class="hero-btn" aria-hidden="true">
              立即派发 <i class="icon icon-arrow-right"></i>
            </span>
          </div>
          <div class="hero-right">
            <span class="hero-prompt mono">{{ FEATURED_APP.prompt }}</span>
          </div>
        </section>

        <!-- 分类标签 -->
        <nav class="cat-tabs">
          <button
            v-for="c in categories"
            :key="c"
            class="cat-tab"
            :class="{ active: c === activeCat }"
            :aria-pressed="c === activeCat"
            @click="activeCat = c"
          >
            {{ c }}
          </button>
        </nav>

        <!-- 应用列表(双列) -->
        <section class="app-list">
          <button
            v-for="a in filtered"
            :key="a.tag"
            class="app-row"
            :disabled="state.busy"
            @click="handleLaunchApp(`@${a.name} `)"
          >
            <span class="app-row-ic">
              <i :class="`icon icon-${a.icon}`"></i>
            </span>
            <span class="app-row-text">
              <span class="app-row-name">{{ a.name }}</span>
              <span class="app-row-desc">{{ a.desc }}</span>
            </span>
            <i class="icon icon-chevron-right app-row-arrow"></i>
          </button>
          <div v-if="!filtered.length" class="app-empty mono">未找到匹配的应用</div>
        </section>
      </div>
    </div>
  </main>
</template>

<!-- PLACEHOLDER_AC_STYLE -->
<style scoped>
.app-center {
  flex: 1;
  min-width: 0;
  background: var(--bg-deep);
  overflow: hidden;
  display: flex;
}
.ac-scroll {
  flex: 1;
  overflow-y: auto;
}
.ac-inner {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: 32px 32px 48px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.ac-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.ac-title {
  font-family: var(--font-ui);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-primary);
}
.ac-sub {
  margin-top: 4px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--text-muted);
}
.ac-search {
  position: relative;
  display: flex;
  align-items: center;
  width: 240px;
  flex-shrink: 0;
}
.ac-search i {
  position: absolute;
  left: 11px;
  font-size: 14px;
  color: var(--text-dim);
  pointer-events: none;
}
.ac-search-input {
  width: 100%;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  color: var(--text-primary);
  font-family: var(--font-data);
  font-size: 12px;
  padding: 9px 12px 9px 32px;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.ac-search-input::placeholder {
  color: var(--text-dim);
}
.ac-search-input:focus {
  outline: none;
  border-color: var(--accent-agent);
  box-shadow: 0 0 0 2px var(--accent-agent-dim);
}
.launch-status {
  margin: -12px 0 0;
  padding: 9px 12px;
  border: 1px solid var(--border-visible);
  border-radius: var(--radius-control);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: 12px;
}
/* PLACEHOLDER_AC_STYLE2 */
.hero {
  display: flex;
  align-items: stretch;
  gap: 20px;
  padding: 24px;
  border: 1px solid var(--border);
  border-left: 2px solid var(--accent-agent);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  cursor: pointer;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.hero:hover {
  border-color: var(--accent-agent);
  box-shadow: 0 0 24px var(--accent-agent-glow);
}
.hero:focus-visible {
  outline: 2px solid var(--accent-agent);
  outline-offset: 2px;
}
.hero.disabled {
  cursor: not-allowed;
  opacity: 0.58;
}
.hero.disabled:hover {
  border-color: var(--border);
  box-shadow: none;
}
.hero-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hero-app {
  display: flex;
  align-items: center;
  gap: 9px;
}
.hero-ic {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-control);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-agent-dim);
  color: var(--accent-agent);
}
.hero-ic i {
  font-size: 18px;
}
.hero-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-agent);
}
.hero-title {
  font-family: var(--font-ui);
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.01em;
}
.hero-desc {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.55;
  max-width: 360px;
}
.hero-btn {
  align-self: flex-start;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--accent-agent);
  color: var(--bg-deep);
  border: none;
  border-radius: var(--radius-control);
  padding: 8px 16px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background var(--dur-fast), box-shadow var(--dur-fast);
}
.hero:hover:not(.disabled) .hero-btn {
  background: var(--accent-agent-hover);
  box-shadow: 0 0 18px var(--accent-agent-glow);
}
.app-row:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}
.hero-btn i {
  font-size: 14px;
}
.hero-right {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border-visible);
  border-radius: var(--radius-md);
  background: var(--bg-deep);
  padding: 16px;
}
.hero-prompt {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.6;
  text-align: center;
}
/* PLACEHOLDER_AC_STYLE3 */
.cat-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 2px;
}
.cat-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 8px 12px;
  cursor: pointer;
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.cat-tab:hover {
  color: var(--text-secondary);
}
.cat-tab.active {
  color: var(--accent-agent);
  border-bottom-color: var(--accent-agent);
}
.app-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.app-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  cursor: pointer;
  text-align: left;
  transition: background var(--dur-fast), border-color var(--dur-fast);
}
.app-row:hover:not(:disabled) {
  background: var(--bg-surface);
  border-color: var(--border-visible);
}
.app-row-ic {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: var(--radius-control);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-agent-dim);
  color: var(--accent-agent);
}
.app-row-ic i {
  font-size: 19px;
}
.app-row-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.app-row-name {
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.app-row-desc {
  font-family: var(--font-body);
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-row-arrow {
  font-size: 15px;
  color: var(--text-dim);
  flex-shrink: 0;
}
.app-empty {
  grid-column: 1 / -1;
  padding: 32px;
  text-align: center;
  font-size: 12px;
  color: var(--text-dim);
}
@media (max-width: 880px) {
  .app-list {
    grid-template-columns: 1fr;
  }
  .hero-right {
    display: none;
  }
}
</style>
