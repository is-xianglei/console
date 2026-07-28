<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { ErrorBoundary, RouterLoading } from '@/components'

defineOptions({ name: 'PlatformResourceLoader' })

const Page = defineAsyncComponent(() => import('./Page.vue'))
</script>

<template>
  <ErrorBoundary>
    <Suspense>
      <Page />
      <template #fallback><RouterLoading /></template>
    </Suspense>
  </ErrorBoundary>
</template>
