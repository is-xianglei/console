import type { ChatModeSlug, ChatModelCapabilities, ReasoningPolicy, ThinkingEffort } from '@/interfaces/settings/models/model'
import { REASONING_LABELS } from '@/constants/settings/models'

/** 未显式选模型时跟随当前场景，工作流不使用个人 agent 默认模型。 */
export function resolveChatPolicy(capabilities: ChatModelCapabilities | null, providerId: string | null, workflowActive = false): ReasoningPolicy | null {
  if (!capabilities) return null
  const defaultId = workflowActive ? capabilities.workflow_provider_id ?? capabilities.main_provider_id : capabilities.main_provider_id
  return capabilities.models.find((item) => item.provider_id === providerId)
    ?? capabilities.models.find((item) => item.provider_id === defaultId) ?? capabilities
}

/** 工作流跟随角色不清空个人默认，显式选模型仍同步默认。 */
export function shouldUpdateModelPreference(providerId: string | null, workflowActive: boolean): boolean {
  return !workflowActive || providerId !== null
}

/** 模型切换后归一强度，避免界面显示上游不支持的档位。 */
export function normalizeChatEffort(effort: ThinkingEffort, policy: ReasoningPolicy): ThinkingEffort {
  if (effort === 'fast') return 'fast'
  if (!policy.supports_reasoning_effort) return 'medium'
  if (policy.reasoning_effort_levels.some((level) => level.key === effort)) return effort
  return policy.reasoning_effort_levels.find((level) => level.key === policy.default_reasoning_effort)?.key
    ?? policy.reasoning_effort_levels[0]?.key ?? 'medium'
}

export function chatEffortOptions(policy: ReasoningPolicy) {
  const levels = policy.supports_reasoning_effort
    ? policy.reasoning_effort_levels.map(({ key }) => ({ value: key, label: REASONING_LABELS[key] }))
    : [{ value: 'medium' as const, label: '思考模式' }]
  return [{ value: 'fast' as const, label: '快速' }, ...levels]
}

/** 极速必须由当前模型明确声明支持；工作流始终按标准编排执行。 */
export function canUseTurbo(policy: ReasoningPolicy | null | undefined, workflowActive = false): boolean {
  return !workflowActive && policy?.turbo_supported === true
}

export function normalizeChatMode(mode: ChatModeSlug, policy: ReasoningPolicy | null | undefined, workflowActive = false): ChatModeSlug {
  return mode === 'turbo' && !canUseTurbo(policy, workflowActive) ? 'standard' : mode
}

/** 快速仅在明确关闭协议下禁用思考，否则须向用户说明上游默认行为。 */
export function chatFastHint(policy: ReasoningPolicy | null | undefined, effort: ThinkingEffort): string {
  return effort === 'fast' && policy?.fast_behavior === 'model_default'
    ? '当前模型的快速档位遵循模型默认思考行为，未显式关闭思考'
    : ''
}

/** 仅保存非敏感的标准强度；按身份、工作区和会话隔离，退出极速后恢复。 */
function standardEffortKey(userId: number | null, workspaceId: number | null, sessionId: string): string {
  return 'agentos:standard-effort:' + JSON.stringify([userId, workspaceId, sessionId])
}

export function readStandardEffort(userId: number | null, workspaceId: number | null, sessionId: string): ThinkingEffort {
  try {
    const value = localStorage.getItem(standardEffortKey(userId, workspaceId, sessionId))
    if (value && ['fast', 'low', 'medium', 'high', 'xhigh', 'max'].includes(value)) return value as ThinkingEffort
  } catch { /* 本地存储不可用时保持服务端标准默认值。 */ }
  return 'fast'
}

export function rememberStandardEffort(userId: number | null, workspaceId: number | null, sessionId: string, effort: ThinkingEffort): void {
  try {
    localStorage.setItem(standardEffortKey(userId, workspaceId, sessionId), effort)
  } catch { /* 不因浏览器存储受限阻止聊天。 */ }
}
