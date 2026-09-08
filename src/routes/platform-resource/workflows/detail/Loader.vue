<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { ErrorBoundary, RouterLoading } from '@/components'

defineOptions({ name: 'WorkflowDetailLoader' })

const Page = defineAsyncComponent(() => import('./index.vue'))
</script>

<template>
  <ErrorBoundary>
    <Suspense>
      <Page />
      <template #fallback><RouterLoading /></template>
    </Suspense>
  </ErrorBoundary>
</template>
