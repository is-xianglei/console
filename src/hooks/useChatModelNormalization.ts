import { watch } from 'vue'
import type { ChatModelCapabilities, ChatModelSelection } from '@/interfaces/settings/models/model'
import { normalizeChatEffort, resolveChatPolicy } from '@/utils/chat-models'

interface ChatModelNormalizationOptions {
  selection: () => ChatModelSelection
  capabilities: () => ChatModelCapabilities | null
  disabled: () => boolean
  workflowActive: () => boolean
  sessionId: () => string
  revision: () => number
  error: () => string
  /** 调用方负责展示保存错误；失败时仍保留本轮去重指纹。 */
  save: (next: ChatModelSelection) => Promise<void>
}

/** 同一能力版本的失败不循环重试；成功重载能力或有效配置变化后才允许重试。 */
export function useChatModelNormalization(options: ChatModelNormalizationOptions): () => void {
  let attempt = ''
  watch([options.selection, options.capabilities, options.disabled, options.workflowActive, options.revision], () => {
    const caps = options.capabilities()
    if (!caps || options.disabled() || options.error()) return
    const current = options.selection()
    const providerId = caps.allow_model_switch && caps.models.some((item) => item.provider_id === current.model_provider_id)
      ? current.model_provider_id : null
    const policy = resolveChatPolicy(caps, providerId, options.workflowActive())
    const effort = policy ? normalizeChatEffort(current.thinking_effort, policy) : current.thinking_effort
    if (providerId === current.model_provider_id && effort === current.thinking_effort) { attempt = ''; return }
    const fingerprint = JSON.stringify([options.sessionId(), current, providerId, effort, caps, options.revision(), options.workflowActive()])
    if (attempt === fingerprint) return
    attempt = fingerprint
    void options.save({ ...current, model_provider_id: providerId, thinking_effort: effort })
  })
  return () => { attempt = '' }
}
