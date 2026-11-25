import type { ChatModelCapabilities, ReasoningPolicy, ThinkingEffort } from '@/interfaces/settings/models/model'

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

/** 聊天输入框里的档位短名；设置页沿用 REASONING_LABELS 的完整说法。 */
const CHAT_EFFORT_LABELS: Record<ThinkingEffort, string> = {
  fast: '关闭',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '超高',
  max: '最高',
}

export function chatEffortOptions(policy: ReasoningPolicy) {
  const levels = policy.supports_reasoning_effort
    ? policy.reasoning_effort_levels.map(({ key }) => ({ value: key, label: CHAT_EFFORT_LABELS[key] }))
    : [{ value: 'medium' as const, label: '开启' }]
  return [{ value: 'fast' as const, label: CHAT_EFFORT_LABELS.fast }, ...levels]
}

/** 快速仅在明确关闭协议下禁用思考，否则须向用户说明上游默认行为。 */
export function chatFastHint(policy: ReasoningPolicy | null | undefined, effort: ThinkingEffort): string {
  return effort === 'fast' && policy?.fast_behavior === 'model_default'
    ? '当前模型无法显式关闭思考，「关闭」档遵循模型默认思考行为'
    : ''
}
