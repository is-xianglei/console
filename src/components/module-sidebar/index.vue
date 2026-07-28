<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PLATFORM_MODULES } from '@/constants/platform-catalog'
import type { PlatformModuleKey } from '@/interfaces/platform/model'
import WorkspaceSelector from '../workspace-selector/index.vue'

defineOptions({ name: 'ModuleSidebar' })

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
  <aside :class="['module-sidebar', $style['module-sidebar']]">
    <WorkspaceSelector />
    <header :class="$style['module-head']">
      <div :class="[$style['module-kicker'], 'mono']">{{ config.caption }}</div>
      <h2>{{ config.title }}</h2>
    </header>
    <div :class="$style['module-scroll']">
      <section v-for="section in config.sections" :key="section.label" :class="$style['nav-section']">
        <div :class="$style['nav-label']">{{ section.label }}</div>
        <UButton
          v-for="item in section.items"
          :key="item.key"
          color="neutral"
          variant="ghost"
          block
          :class="[$style['module-item'], { [$style.active]: activeResource === item.key }]"
          @click="openItem(item.key, item.route)"
        >
          <i :class="`icon icon-${item.icon}`"></i>
          <span>{{ item.label }}</span>
          <span v-if="item.count" :class="[$style['item-count'], 'mono']">{{ item.count }}</span>
        </UButton>
      </section>
    </div>
    <footer :class="$style['module-foot']">
      <span class="dot nominal"></span>
      <span>配置目录已同步</span>
      <span class="mono">14:32</span>
    </footer>
  </aside>
</template>

<style module src="./index.module.css"></style>
