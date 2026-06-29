<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConsoleStore } from '../../stores/console'
import { APPS, FEATURED_APP } from '../../data/seed'

const { launchApp } = useConsoleStore()

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

function tint(color: string, pct = 14) {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}
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
            <input v-model="search" class="ac-search-input" placeholder="搜索应用…" />
          </div>
        </header>

        <!-- 推荐卡 -->
        <section
          class="hero"
          :style="{ '--hero-accent': '#a78bfa' }"
          @click="launchApp(FEATURED_APP.prompt)"
        >
          <div class="hero-left">
            <div class="hero-app">
              <span class="hero-ic"><i :class="`icon icon-${FEATURED_APP.icon}`"></i></span>
              <span class="hero-tag mono">@{{ FEATURED_APP.name }}</span>
            </div>
            <h2 class="hero-title">{{ FEATURED_APP.title }}</h2>
            <p class="hero-desc">{{ FEATURED_APP.desc }}</p>
            <button class="hero-btn" @click.stop="launchApp(FEATURED_APP.prompt)">
              立即派发 <i class="icon icon-arrow-right"></i>
            </button>
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
            @click="launchApp(`@${a.name} `)"
          >
            <span class="app-row-ic" :style="{ background: tint(a.color), color: a.color }">
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
/* PLACEHOLDER_AC_STYLE2 */
.hero {
  display: flex;
  align-items: stretch;
  gap: 20px;
  padding: 24px;
  border: 1px solid var(--border);
  border-left: 2px solid var(--hero-accent);
  border-radius: var(--radius-lg);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--hero-accent) 12%, var(--bg-panel)),
    var(--bg-panel) 60%
  );
  cursor: pointer;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.hero:hover {
  border-color: var(--hero-accent);
  box-shadow: 0 0 24px color-mix(in srgb, var(--hero-accent) 22%, transparent);
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
  background: color-mix(in srgb, var(--hero-accent) 18%, transparent);
  color: var(--hero-accent);
}
.hero-ic i {
  font-size: 18px;
}
.hero-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--hero-accent);
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
.hero-btn:hover {
  background: var(--accent-agent-hover);
  box-shadow: 0 0 18px var(--accent-agent-glow);
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
.app-row:hover {
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