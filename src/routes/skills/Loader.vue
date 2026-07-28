<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { ErrorBoundary, RouterLoading } from '@/components'

defineOptions({ name: 'SkillsLoader' })

const Page = defineAsyncComponent(() => import('@/routes/skills/Page.vue'))
</script>

<template>
  <ErrorBoundary>
    <Suspense>
      <Page />
      <template #fallback><RouterLoading /></template>
    </Suspense>
  </ErrorBoundary>
</template>
