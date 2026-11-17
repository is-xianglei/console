import { describe, expect, it, vi } from 'vitest'
import { getProviderSchemas } from '@/constants/settings/models'
import { detectModelContextLength, detectModelReasoning } from '@/http/settings/models'
import type { ModelProviderItem } from '@/interfaces/settings/models/model'
import {
  applyReasoningKeys,
  buildProviderPayload,
  emptyProviderForm,
  providerForType,
  providerOptionsForType,
  providerToForm,
  validateProviderForm,
  useModelProviderEditor,
  usesOpenAIFastMapping,
} from './useModelProviderEditor'

vi.mock('@nuxt/ui/composables', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('@/http/settings/models', () => ({ detectModelContextLength: vi.fn(), detectModelReasoning: vi.fn(), createModelProvider: vi.fn(), updateModelProvider: vi.fn() }))

function provider(overrides: Partial<ModelProviderItem> = {}): ModelProviderItem {
  return {
    provider_id: 'mp-1',
    display_name: '主对话模型',
    provider_type: 'chat',
    provider: 'deepseek',
    base_url: 'https://api.deepseek.com/v1',
    api_key: 'sk-****abcd',
    model_name: 'deepseek-chat',
    extra_config: {
      context_length: 131072,
      context_length_source: 'models_endpoint',
      supports_vision: true,
      supports_reasoning_effort: true,
      reasoning_effort_levels: [{ key: 'high', value: 'high' }, { key: 'max', value: 'max' }],
      default_reasoning_effort: 'high',
      custom_flag: 'keep-me',
    },
    is_active: true,
    last_tested_at: null,
    last_test_status: null,
    ...overrides,
  }
}

describe('buildProviderPayload', () => {
  it('编辑时 API Key 留空不提交 api_key，并保留 extra_config 里的其他键', () => {
    const original = provider()
    const payload = buildProviderPayload(providerToForm(original), original)
    expect(payload).not.toHaveProperty('api_key')
    expect(payload.extra_config).toEqual({
      context_length: 131072,
      supports_vision: true,
      supports_reasoning_effort: true,
      reasoning_effort_levels: [{ key: 'high', value: 'high' }, { key: 'max', value: 'max' }],
      default_reasoning_effort: 'high',
      custom_flag: 'keep-me',
    })
  })

  it('新增时只带非空 API Key，空白视为未填', () => {
    const form = { ...emptyProviderForm(), displayName: ' A ', modelName: ' m ', apiKey: '   ' }
    expect(buildProviderPayload(form)).not.toHaveProperty('api_key')
    expect(buildProviderPayload({ ...form, apiKey: ' sk-new ' }).api_key).toBe('sk-new')
    expect(buildProviderPayload(form)).toMatchObject({ display_name: 'A', model_name: 'm' })
  })

  it('合并上下文窗口、读图、思考档位；纯数字参数按整数发送', () => {
    const form = { ...emptyProviderForm(), displayName: 'A', modelName: 'qwen-plus', contextLength: 32768, supportsVision: true, supportsReasoningEffort: true }
    applyReasoningKeys(form, ['high', 'medium'])
    form.reasoningValues.high = ' 8192 '
    form.defaultReasoningEffort = 'high'
    expect(buildProviderPayload(form).extra_config).toEqual({
      context_length: 32768,
      supports_vision: true,
      supports_reasoning_effort: true,
      reasoning_effort_levels: [{ key: 'medium', value: 'medium' }, { key: 'high', value: 8192 }],
      default_reasoning_effort: 'high',
    })
  })

  it('改为非对话用途或清空上下文窗口时删除相关键', () => {
    const original = provider()
    const form = { ...providerToForm(original), providerType: 'embedding' as const, contextLength: null }
    expect(buildProviderPayload(form, original).extra_config).toEqual({ custom_flag: 'keep-me' })
  })

  it('仅有效 OpenAI 协议提交 none，关闭映射后删除旧值', () => {
    const original = provider({ provider: 'openai', extra_config: { fast_reasoning_effort: 'none', custom_flag: 'keep' } })
    const form = providerToForm(original)
    expect(form.fastReasoningEffort).toBe('none')
    expect(buildProviderPayload(form, original).extra_config).toEqual({ fast_reasoning_effort: 'none', custom_flag: 'keep' })
    form.fastReasoningEffort = undefined
    expect(buildProviderPayload(form, original).extra_config).toEqual({ custom_flag: 'keep' })
    form.fastReasoningEffort = 'none'
    form.provider = 'deepseek'
    expect(buildProviderPayload(form, original).extra_config).toEqual({ custom_flag: 'keep' })
    form.provider = 'openai'
    form.providerType = 'embedding'
    expect(buildProviderPayload(form, original).extra_config).toEqual({ custom_flag: 'keep' })
  })

  it('协议覆盖决定快速映射，不按模型名猜测', () => {
    expect(usesOpenAIFastMapping({ ...emptyProviderForm(), provider: 'openai' })).toBe(true)
    expect(usesOpenAIFastMapping({ ...emptyProviderForm(), modelName: 'gpt-5' })).toBe(false)
    expect(usesOpenAIFastMapping({ ...emptyProviderForm(), provider: 'openai', thinkingProtocol: 'chat_template' })).toBe(false)
    const original = provider({ provider: 'openai_compatible', extra_config: { thinking_protocol: 'openai', fast_reasoning_effort: 'none' } })
    expect(usesOpenAIFastMapping(providerToForm(original))).toBe(true)
    expect(buildProviderPayload(providerToForm(original), original).extra_config).toEqual(original.extra_config)
    expect(usesOpenAIFastMapping({ ...providerToForm(original), provider: 'anthropic' })).toBe(false)
  })

  it('旧数据只有思考开关、未改动时不写入显式档位', () => {
    const original = provider({ extra_config: { supports_reasoning_effort: true } })
    expect(buildProviderPayload(providerToForm(original), original).extra_config).toEqual({ supports_reasoning_effort: true })
  })
})

describe('validateProviderForm', () => {
  it('必填、长度与思考档位规则', () => {
    const form = { ...emptyProviderForm(), displayName: 'x'.repeat(101), supportsReasoningEffort: true, contextLength: 1.5 }
    form.reasoningKeys = ['high']
    form.reasoningValues = { high: ' ' }
    form.defaultReasoningEffort = 'medium'
    expect(validateProviderForm(form).map((issue) => issue.field)).toEqual([
      'displayName', 'modelName', 'contextLength', 'reasoningValues.high', 'defaultReasoningEffort',
    ])
    form.reasoningKeys = []
    expect(validateProviderForm(form).map((issue) => issue.field)).toContain('reasoningKeys')
  })

  it('音频转写服务地址必填，不能把空地址当作连通服务', () => {
    const form = { ...emptyProviderForm(), displayName: '语音服务', modelName: 'asr', providerType: 'audio' as const, baseUrl: ' ' }
    expect(validateProviderForm(form)).toEqual([{ field: 'baseUrl', message: '请输入音频转写服务地址' }])
    form.baseUrl = 'http://localhost:8000/v1'
    expect(validateProviderForm(form)).toEqual([])
  })

  it('非对话用途不校验思考档位', () => {
    const form = { ...emptyProviderForm(), displayName: 'A', modelName: 'bge', providerType: 'embedding' as const, supportsReasoningEffort: true, reasoningKeys: [] }
    expect(validateProviderForm(form)).toEqual([])
  })
})

describe('用途联动', () => {
  const schemas = getProviderSchemas()

  it('厂商选项按 supports_types 过滤', () => {
    expect(providerOptionsForType(schemas, 'reranker').map((item) => item.value)).toEqual(['openai_compatible', 'siliconflow'])
    expect(schemas).toHaveLength(15)
  })

  it('语音固定为音频转写，不支持新用途时回落到 OpenAI 兼容', () => {
    expect(providerForType(schemas, 'deepseek', 'audio')).toBe('audio_compatible')
    expect(providerForType(schemas, 'deepseek', 'embedding')).toBe('openai_compatible')
    expect(providerForType(schemas, 'siliconflow', 'embedding')).toBe('siliconflow')
  })

  it('勾选档位按固定顺序排列，默认档位跟随', () => {
    const form = emptyProviderForm()
    applyReasoningKeys(form, ['max', 'low'])
    expect(form.reasoningKeys).toEqual(['low', 'max'])
    expect(form.reasoningValues.low).toBe('low')
    expect(form.defaultReasoningEffort).toBe('low')
  })
})

describe('探测异步状态保护', () => {
  it('上下文探测期间手工更改窗口时不覆盖输入', async () => {
    const editor = useModelProviderEditor()
    editor.open(provider())
    let finish!: (result: Awaited<ReturnType<typeof detectModelContextLength>>) => void
    vi.mocked(detectModelContextLength).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const pending = editor.detectContext()
    editor.draft.value.contextLength = 4096
    finish({ context_length: 32768, source: 'models_endpoint', source_label: '模型接口', confidence: 'high', notes: [] })
    await pending
    expect(editor.draft.value.contextLength).toBe(4096)
  })

  it('思考探测期间切换用途时不覆盖新表单', async () => {
    const editor = useModelProviderEditor()
    editor.open(provider())
    let finish!: (result: Awaited<ReturnType<typeof detectModelReasoning>>) => void
    vi.mocked(detectModelReasoning).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const pending = editor.detectReasoning()
    editor.draft.value.providerType = 'embedding'
    finish({ levels: [{ key: 'low', value: 1024 }], default: 'low', source: 'model_metadata', complete: true })
    await pending
    expect(editor.draft.value.reasoningKeys).toEqual(['high', 'max'])
    expect(editor.draft.value.reasoningDetected).toBe(false)
  })

  it('不完整探测结果保留现有档位，accepted_probe说明不夸大支持', async () => {
    const editor = useModelProviderEditor()
    editor.open(provider())
    vi.mocked(detectModelReasoning).mockResolvedValueOnce({ levels: [], default: null, source: 'unknown', complete: false })
    await editor.detectReasoning()
    expect(editor.draft.value.reasoningKeys).toEqual(['high', 'max'])
    expect(editor.reasoningHint.value).toContain('现有配置未改变')
    vi.mocked(detectModelReasoning).mockResolvedValueOnce({ levels: [{ key: 'low', value: 1024 }], default: 'low', source: 'accepted_probe', complete: true })
    await editor.detectReasoning()
    expect(editor.draft.value.reasoningKeys).toEqual(['low'])
    expect(editor.reasoningHint.value).toContain('可能忽略思考参数')
  })
})
