<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PLATFORM_MODULES, type PlatformModuleKey } from '../../data/platformCatalog'
import WorkspaceSelector from './WorkspaceSelector.vue'

const props = defineProps<{ module: PlatformModuleKey }>()
const route = useRoute()
const router = useRouter()
const config = computed(() => PLATFORM_MODULES[props.module])
const activeResource = computed(() => route.name === 'skills' ? 'skills' : String(route.params.resource ?? ''))

function openItem(key: string, routePath?: string) {
  router.push(routePath ?? `/platform/${props.module}/${key}`)
}
</script>

<template>
  <aside class="module-sidebar">
    <WorkspaceSelector />
    <header class="module-head">
      <div class="module-kicker mono">{{ config.caption }}</div>
      <h2>{{ config.title }}</h2>
    </header>
    <div class="module-scroll">
      <section v-for="section in config.sections" :key="section.label" class="nav-section">
        <div class="nav-label">{{ section.label }}</div>
        <button
          v-for="item in section.items"
          :key="item.key"
          class="module-item"
          :class="{ active: activeResource === item.key }"
          @click="openItem(item.key, item.route)"
        >
          <i :class="`icon icon-${item.icon}`"></i>
          <span>{{ item.label }}</span>
          <span v-if="item.count" class="item-count mono">{{ item.count }}</span>
        </button>
      </section>
    </div>
    <footer class="module-foot">
      <span class="dot nominal"></span>
      <span>配置目录已同步</span>
      <span class="mono">14:32</span>
    </footer>
  </aside>
</template>

<style scoped>
.module-sidebar {
  width: var(--left-bar-w);
  flex: 0 0 var(--left-bar-w);
  min-width: 0;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}
.module-head {
  padding: 12px 14px 8px;
}
.module-kicker {
  color: var(--text-dim);
  font-size: 9px;
  letter-spacing: 0.1em;
}
.module-head h2 {
  margin-top: 3px;
  font-family: var(--font-ui);
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0;
}
.module-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 8px;
}
.nav-section + .nav-section {
  margin-top: 18px;
}
.nav-label {
  padding: 0 8px 6px;
  color: var(--text-dim);
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.module-item {
  width: 100%;
  height: 34px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 9px;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.module-item:hover {
  background: var(--bg-surface);
  color: var(--text-secondary);
}
.module-item.active {
  background: var(--accent-agent-dim);
  color: var(--accent-agent);
}
.module-item i {
  width: 15px;
  font-size: 14px;
}
.module-item span:nth-child(2) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 550;
}
.item-count {
  margin-left: auto;
  font-size: 9px;
  color: var(--text-dim);
}
.module-empty {
  padding: 20px 8px;
  color: var(--text-dim);
  font-size: 10px;
}
.module-foot {
  height: 38px;
  padding: 0 14px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-dim);
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 9px;
}
.module-foot .mono {
  margin-left: auto;
}
@media (max-width: 1180px) {
  .module-sidebar {
    width: 250px;
    flex-basis: 250px;
  }
}
@media (max-width: 760px) {
  .module-sidebar {
    position: fixed;
    z-index: 16;
    left: 0;
    top: 48px;
    bottom: 50px;
    width: min(300px, 86vw);
    flex-basis: auto;
    display: flex;
    border-right-color: var(--border-visible);
  }
}
</style>
