import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { ChatModelCapabilities, ChatModelSelection } from '@/interfaces/settings/models/model'
import { useChatModelNormalization } from './useChatModelNormalization'

const capabilities: ChatModelCapabilities = {
  main_provider_id: 'agent', workflow_provider_id: 'workflow', allow_model_switch: true,
  supports_reasoning_effort: true, reasoning_effort_levels: [{ key: 'high', value: 'high' }],
  default_reasoning_effort: 'high', reasoning_effort_configured: true, modes: [],
  models: [
    { provider_id: 'agent', display_name: '个人默认', model_name: 'a', supports_reasoning_effort: true, reasoning_effort_levels: [{ key: 'high', value: 'high' }], default_reasoning_effort: 'high', reasoning_effort_configured: true, turbo_supported: false },
    { provider_id: 'workflow', display_name: '工作流角色', model_name: 'w', supports_reasoning_effort: false, reasoning_effort_levels: [], default_reasoning_effort: 'medium', reasoning_effort_configured: false, turbo_supported: true },
  ],
}
const scopes: Array<ReturnType<typeof effectScope>> = []
afterEach(() => { for (const scope of scopes.splice(0)) scope.stop() })

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function harness(initial: ChatModelSelection, workflow = false, team = false) {
  const selection = ref(initial)
  const teamActive = ref(team)
  const caps = ref<ChatModelCapabilities | null>(null)
  const disabled = ref(false)
  const revision = ref(0)
  const workflowActive = ref(workflow)
  const persist = vi.fn<(next: ChatModelSelection) => Promise<void>>().mockResolvedValue(undefined)
  const save = vi.fn(async (next: ChatModelSelection) => {
    disabled.value = true
    try { await persist(next); selection.value = next } catch { /* 组件展示错误，保留旧配置。 */ }
    finally { disabled.value = false }
  })
  const scope = effectScope()
  scopes.push(scope)
  scope.run(() => useChatModelNormalization({
    selection: () => selection.value, capabilities: () => caps.value,
    disabled: () => disabled.value, workflowActive: () => workflowActive.value,
    turboBlocked: () => workflowActive.value || teamActive.value,
    sessionId: () => '42', revision: () => revision.value, error: () => '',
    standardEffort: () => 'high', save,
  }))
  return { selection, caps, disabled, revision, workflowActive, teamActive, persist, save }
}

describe('聊天模型能力归一监听', () => {
  it('选了 Team 后极速模式切回标准模式，模型仍按个人默认解析', async () => {
    const turboCaps: ChatModelCapabilities = {
      ...capabilities,
      models: capabilities.models.map((model) => ({ ...model, turbo_supported: true })),
    }
    const state = harness({ model_provider_id: null, mode_slug: 'turbo', thinking_effort: 'fast' })
    state.caps.value = turboCaps
    await settle()
    expect(state.save).not.toHaveBeenCalled()

    state.teamActive.value = true
    await settle()
    expect(state.save).toHaveBeenCalledTimes(1)
    expect(state.selection.value).toEqual({ model_provider_id: null, mode_slug: 'standard', thinking_effort: 'high' })
  })

  it('归一失败不因 saving 恢复而循环，能力成功重载相同内容后可重试', async () => {
    const state = harness({ model_provider_id: null, mode_slug: 'turbo', thinking_effort: 'fast' })
    state.persist.mockRejectedValueOnce(new Error('暂时失败'))
    state.caps.value = capabilities
    await settle()
    expect(state.save).toHaveBeenCalledTimes(1)
    expect(state.selection.value.mode_slug).toBe('turbo')
    state.disabled.value = true
    await settle()
    state.disabled.value = false
    await settle()
    expect(state.save).toHaveBeenCalledTimes(1)
    state.revision.value += 1
    await settle()
    expect(state.save).toHaveBeenCalledTimes(2)
    expect(state.selection.value).toEqual({ model_provider_id: null, mode_slug: 'standard', thinking_effort: 'high' })
  })

  it('归一失败后有效配置改变可重新保存，不必重新挂载控件', async () => {
    const state = harness({ model_provider_id: null, mode_slug: 'standard', thinking_effort: 'max' })
    state.persist.mockRejectedValueOnce(new Error('失败'))
    state.caps.value = capabilities
    await settle()
    expect(state.save).toHaveBeenCalledTimes(1)
    state.selection.value = { ...state.selection.value, thinking_effort: 'low' }
    await settle()
    expect(state.save).toHaveBeenCalledTimes(2)
    expect(state.selection.value.thinking_effort).toBe('high')
  })

  it('工作流跟随专属角色能力，归一时保持 model_provider_id=null', async () => {
    const state = harness({ model_provider_id: null, mode_slug: 'standard', thinking_effort: 'high' }, true)
    state.caps.value = capabilities
    await settle()
    expect(state.save).toHaveBeenCalledWith({ model_provider_id: null, mode_slug: 'standard', thinking_effort: 'medium' })
  })

  it('失效显式模型回落时，同次保存退出极速并恢复标准强度', async () => {
    const state = harness({ model_provider_id: 'removed', mode_slug: 'turbo', thinking_effort: 'fast' })
    state.caps.value = capabilities
    await settle()
    expect(state.save).toHaveBeenCalledTimes(1)
    expect(state.save).toHaveBeenCalledWith({ model_provider_id: null, mode_slug: 'standard', thinking_effort: 'high' })
  })
})
