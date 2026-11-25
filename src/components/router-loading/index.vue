<script setup lang="ts">
defineOptions({ name: 'RouterLoading' })
</script>

<template>
  <div :class="$style.routerLoading" role="status" aria-label="页面加载中">
    <UIcon name="i-lucide-loader-circle" :class="[$style.loadingIcon, 'animate-spin']" />
  </div>
</template>

<style module src="./index.module.css"></style>
