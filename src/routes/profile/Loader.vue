<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { ErrorBoundary, RouterLoading } from '@/components'

defineOptions({ name: 'ProfileLoader' })

const Page = defineAsyncComponent(() => import('@/routes/profile/Page.vue'))
</script>

<template>
  <ErrorBoundary>
    <Suspense>
      <Page />
      <template #fallback><RouterLoading /></template>
    </Suspense>
  </ErrorBoundary>
</template>
