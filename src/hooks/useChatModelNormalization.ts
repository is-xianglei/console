import { watch } from 'vue'
import type { ChatModelCapabilities, ChatModelSelection, ThinkingEffort } from '@/interfaces/settings/models/model'
import { normalizeChatEffort, normalizeChatMode, resolveChatPolicy } from '@/utils/chat-models'

interface ChatModelNormalizationOptions {
  selection: () => ChatModelSelection
  capabilities: () => ChatModelCapabilities | null
  disabled: () => boolean
  workflowActive: () => boolean
  /** 不能用极速模式（Workflow 或 Team 会话）；缺省时只看 workflowActive。 */
  turboBlocked?: () => boolean
  sessionId: () => string
  revision: () => number
  error: () => string
  standardEffort: () => ThinkingEffort
  /** 调用方负责展示保存错误；失败时仍保留本轮去重指纹。 */
  save: (next: ChatModelSelection) => Promise<void>
}

/** 同一能力版本的失败不循环重试；成功重载能力或有效配置变化后才允许重试。 */
export function useChatModelNormalization(options: ChatModelNormalizationOptions): () => void {
  let attempt = ''
  const turboBlocked = () => options.turboBlocked?.() ?? options.workflowActive()
  watch([options.selection, options.capabilities, options.disabled, options.workflowActive, turboBlocked, options.revision], () => {
    const caps = options.capabilities()
    if (!caps || options.disabled() || options.error()) return
    const current = options.selection()
    const providerId = caps.allow_model_switch && caps.models.some((item) => item.provider_id === current.model_provider_id)
      ? current.model_provider_id : null
    const policy = resolveChatPolicy(caps, providerId, options.workflowActive())
    const mode = normalizeChatMode(current.mode_slug, policy, turboBlocked())
    const candidate = mode !== current.mode_slug ? options.standardEffort() : current.thinking_effort
    const effort = mode === 'turbo' ? 'fast' : policy ? normalizeChatEffort(candidate, policy) : candidate
    if (providerId === current.model_provider_id && effort === current.thinking_effort && mode === current.mode_slug) { attempt = ''; return }
    const fingerprint = JSON.stringify([options.sessionId(), current, providerId, effort, mode, caps, options.revision(), options.workflowActive(), turboBlocked()])
    if (attempt === fingerprint) return
    attempt = fingerprint
    void options.save({ ...current, model_provider_id: providerId, thinking_effort: effort, mode_slug: mode })
  })
  return () => { attempt = '' }
}
