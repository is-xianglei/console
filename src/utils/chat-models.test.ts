import { describe, expect, it } from 'vitest'
import { chatEffortOptions, chatFastHint, normalizeChatEffort, resolveChatPolicy, shouldUpdateModelPreference } from './chat-models'
import type { ChatModelCapabilities, ReasoningPolicy } from '@/interfaces/settings/models/model'

const policy: ReasoningPolicy = {
  supports_reasoning_effort: true,
  reasoning_effort_levels: [{ key: 'high', value: 1024 }, { key: 'max', value: 8192 }],
  default_reasoning_effort: 'high',
  reasoning_effort_configured: true,
}

describe('聊天强度策略', () => {
  it('快速始终保留，不支持多档时思考回落 medium', () => {
    expect(normalizeChatEffort('fast', policy)).toBe('fast')
    expect(normalizeChatEffort('max', { ...policy, supports_reasoning_effort: false })).toBe('medium')
    expect(chatEffortOptions({ ...policy, supports_reasoning_effort: false })).toEqual([
      { value: 'fast', label: '关闭' }, { value: 'medium', label: '开启' },
    ])
  })

  it('仅列实际档位，失效选择依次回落默认、首档、medium', () => {
    expect(chatEffortOptions(policy).map((option) => option.value)).toEqual(['fast', 'high', 'max'])
    expect(normalizeChatEffort('low', policy)).toBe('high')
    expect(normalizeChatEffort('low', { ...policy, default_reasoning_effort: 'medium' })).toBe('high')
    expect(normalizeChatEffort('max', { ...policy, reasoning_effort_levels: [] })).toBe('medium')
  })

  it('快速采用上游默认行为时明确提示，不夸大关闭思考能力', () => {
    expect(chatFastHint({ ...policy, fast_behavior: 'model_default' }, 'fast')).toContain('遵循模型默认思考行为')
    expect(chatFastHint({ ...policy, fast_behavior: 'disabled' }, 'fast')).toBe('')
    expect(chatFastHint({ ...policy, fast_behavior: 'model_default' }, 'high')).toBe('')
  })

  it('默认能力按普通对话与工作流分别选择，显式选择优先且兼容旧响应', () => {
    const agent = { ...policy, provider_id: 'agent', display_name: '个人默认', model_name: 'a' }
    const workflow = { ...policy, provider_id: 'workflow', display_name: '工作流角色', model_name: 'w', supports_reasoning_effort: false }
    const caps: ChatModelCapabilities = { ...policy, main_provider_id: 'agent', workflow_provider_id: 'workflow', allow_model_switch: true, models: [agent, workflow] }
    expect(resolveChatPolicy(caps, null)).toBe(agent)
    expect(resolveChatPolicy(caps, null, true)).toBe(workflow)
    expect(resolveChatPolicy(caps, 'agent', true)).toBe(agent)
    expect(resolveChatPolicy({ ...caps, workflow_provider_id: undefined }, null, true)).toBe(agent)
    expect(resolveChatPolicy(null, null, true)).toBeNull()
  })

  it('工作流跟随角色不清空个人默认，显式模型与普通对话仍同步偏好', () => {
    expect(shouldUpdateModelPreference(null, true)).toBe(false)
    expect(shouldUpdateModelPreference('chosen', true)).toBe(true)
    expect(shouldUpdateModelPreference(null, false)).toBe(true)
    expect(shouldUpdateModelPreference('chosen', false)).toBe(true)
  })
})
