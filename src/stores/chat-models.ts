import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getChatModelCapabilities } from '@/http/settings/models'
import type { ChatModelCapabilities } from '@/interfaces/settings/models/model'

/** 服务端策略与供应商能力集中缓存，失败时保留上一次成功结果。 */
export const useChatModelsStore = defineStore('chat-models', () => {
  const capabilities = ref<ChatModelCapabilities | null>(null)
  const loading = ref(false)
  const error = ref('')
  const revision = ref(0)
  const loaded = computed(() => capabilities.value != null)
  let generation = 0

  async function load(): Promise<void> {
    const current = ++generation
    loading.value = true
    error.value = ''
    try {
      const result = await getChatModelCapabilities()
      if (current === generation) {
        capabilities.value = result
        revision.value += 1
      }
    } catch (cause) {
      if (current === generation) error.value = cause instanceof Error ? cause.message : '加载模型配置失败'
    } finally {
      if (current === generation) loading.value = false
    }
  }

  function reset(): void {
    generation += 1
    capabilities.value = null
    loading.value = false
    error.value = ''
    revision.value = 0
  }

  return { capabilities, loading, error, loaded, revision, load, reset }
})
