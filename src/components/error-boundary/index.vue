<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'

defineOptions({ name: 'ErrorBoundary' })

const error = ref<Error | null>(null)

onErrorCaptured((cause) => {
  error.value = cause instanceof Error ? cause : new Error(String(cause))
  return false
})

function onRetry() {
  window.location.reload()
}
</script>

<template>
  <slot v-if="!error" />
  <main v-else :class="$style.errorBoundary">
    <UAlert
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="页面加载失败"
      :description="error.message || '请重试，若问题持续存在请联系管理员。'"
    />
    <UButton icon="i-lucide-refresh-cw" label="重新加载" @click="onRetry" />
  </main>
</template>

<style module src="./index.module.css"></style>
