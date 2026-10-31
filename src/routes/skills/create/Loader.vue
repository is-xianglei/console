<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { ErrorBoundary, RouterLoading } from '@/components'

defineOptions({ name: 'SkillCreateLoader' })

// 新建与编辑共用 edit/index.vue，模式由路由名 skill-create / skill-edit 决定。
const Page = defineAsyncComponent(() => import('../edit/index.vue'))
</script>

<template>
  <ErrorBoundary>
    <Suspense>
      <Page />
      <template #fallback><RouterLoading /></template>
    </Suspense>
  </ErrorBoundary>
</template>
