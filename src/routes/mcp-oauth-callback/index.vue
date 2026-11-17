<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from '@nuxt/ui/composables'
import { useMcpStore } from '@/stores/mcp'
import { takeOAuthServer } from '@/utils/mcp-oauth'

/** OAuth 授权服务器回跳到这里：把 state、code、iss 交给后端换 token，成功后回到发起授权的页面（聊天会话或 server 详情）。 */
defineOptions({ name: 'McpOAuthCallback' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const mcpStore = useMcpStore()

const error = ref('')
const pending = takeOAuthServer()

function queryValue(key: string): string {
  const raw = route.query[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value : ''
}

function goBack() {
  if (pending?.returnTo) void router.replace(pending.returnTo)
  else if (pending) void router.replace({ name: 'mcp-detail', params: { id: String(pending.serverId) } })
  else void router.replace({ name: 'platform-resource', params: { module: 'build', resource: 'mcp' } })
}

onMounted(async () => {
  const denied = queryValue('error')
  if (denied) {
    error.value = queryValue('error_description') || `授权服务器拒绝了授权（${denied}）`
    return
  }
  const state = queryValue('state')
  const code = queryValue('code')
  if (!state || !code) {
    error.value = '回调地址缺少 state 或 code，请重新发起授权'
    return
  }
  const iss = queryValue('iss')
  const result = await mcpStore.completeAuthorization({ state, code, ...(iss ? { iss } : {}) })
  if (result.error || !result.item) {
    error.value = result.error ?? '授权失败'
    return
  }
  toast.add({ title: `${result.item.name} 已授权`, color: 'success' })
  if (pending?.returnTo) void router.replace(pending.returnTo)
  else void router.replace({ name: 'mcp-detail', params: { id: String(result.item.id) } })
})
</script>

<template>
  <main :class="$style.page">
    <UEmpty v-if="error" variant="naked" icon="i-lucide-key-round" title="授权失败" :description="error">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" label="返回" color="neutral" variant="outline" @click="goBack" />
      </template>
    </UEmpty>
    <div v-else :class="$style.pending" role="status">
      <UIcon name="i-lucide-loader-circle" :class="$style.spinner" />
      <span>正在完成授权</span>
    </div>
  </main>
</template>

<style module src="./index.module.css"></style>
