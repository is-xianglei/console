import { computed, ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import {
  DEFAULT_REASONING_LEVELS,
  MODEL_DISPLAY_NAME_MAX,
  REASONING_KEYS,
  REASONING_LABELS,
  REASONING_VALUE_MAX,
} from '@/constants/settings/models'
import {
  createModelProvider,
  detectModelContextLength,
  detectModelReasoning,
  updateModelProvider,
} from '@/http/settings/models'
import type { ModelProbeRequest, ModelProviderInput } from '@/interfaces/settings/models/api'
import type {
  ContextProbeResult,
  ModelProviderItem,
  ModelProviderType,
  ProviderSchema,
  ReasoningKey,
  ReasoningLevel,
  ReasoningProbeResult,
} from '@/interfaces/settings/models/model'

/** 供应商表单模型；contextLength 为 null 表示不填。 */
export interface ModelProviderFormModel {
  displayName: string
  provider: string
  providerType: ModelProviderType
  baseUrl: string
  apiKey: string
  modelName: string
  contextLength: number | null
  isActive: boolean
  supportsReasoningEffort: boolean
  /** 保留已有协议覆盖，仅用于判定快速映射是否适用。 */
  thinkingProtocol: string
  fastReasoningEffort: 'none' | undefined
  reasoningKeys: ReasoningKey[]
  reasoningValues: Partial<Record<ReasoningKey, string>>
  defaultReasoningEffort: ReasoningKey | undefined
  /** 档位是否来自本次「自动探测思考档位」；只影响旧数据是否迁移。 */
  reasoningDetected: boolean
  supportsVision: boolean
}

export interface ModelProviderIssue {
  /** UFormField 的 name；思考参数为 reasoningValues.<key>。 */
  field: string
  message: string
}

function pickDefault(value: ReasoningKey | undefined, keys: ReasoningKey[]): ReasoningKey | undefined {
  const preferred = value ?? 'medium'
  return keys.includes(preferred) ? preferred : keys[0]
}

function reasoningFields(extra: Record<string, unknown> = {}) {
  const levels = (extra.reasoning_effort_levels as ReasoningLevel[] | undefined) ?? DEFAULT_REASONING_LEVELS
  const keys = REASONING_KEYS.filter((key) => levels.some((level) => level.key === key))
  return {
    reasoningKeys: keys,
    reasoningValues: Object.fromEntries(levels.map((level) => [level.key, String(level.value)])) as Partial<Record<ReasoningKey, string>>,
    defaultReasoningEffort: pickDefault(extra.default_reasoning_effort as ReasoningKey | undefined, keys),
    reasoningDetected: false,
  }
}

export function emptyProviderForm(): ModelProviderFormModel {
  return {
    displayName: '',
    provider: 'openai_compatible',
    providerType: 'chat',
    baseUrl: '',
    apiKey: '',
    modelName: '',
    contextLength: null,
    isActive: true,
    supportsReasoningEffort: false,
    thinkingProtocol: '',
    fastReasoningEffort: undefined,
    ...reasoningFields(),
    supportsVision: false,
  }
}

/** 编辑时回填；API Key 永远留空（掩码不回填），留空即不修改。 */
export function providerToForm(item: ModelProviderItem): ModelProviderFormModel {
  const extra = item.extra_config ?? {}
  const contextLength = Number(extra.context_length)
  return {
    displayName: item.display_name,
    provider: item.provider,
    providerType: item.provider_type,
    baseUrl: item.base_url,
    apiKey: '',
    modelName: item.model_name,
    contextLength: Number.isFinite(contextLength) && contextLength > 0 ? contextLength : null,
    isActive: item.is_active,
    supportsReasoningEffort: Boolean(extra.supports_reasoning_effort),
    thinkingProtocol: typeof extra.thinking_protocol === 'string' ? extra.thinking_protocol : '',
    fastReasoningEffort: extra.fast_reasoning_effort === 'none' ? 'none' : undefined,
    ...reasoningFields(extra),
    supportsVision: Boolean(extra.supports_vision),
  }
}

/** 跟随后端协议判定；Anthropic 独立协议不使用 OpenAI 参数。 */
export function usesOpenAIFastMapping(form: ModelProviderFormModel): boolean {
  if (form.providerType !== 'chat' || form.provider === 'anthropic') return false
  const protocol = form.thinkingProtocol || (form.provider === 'deepseek' ? 'deepseek' : form.provider === 'openai' ? 'openai' : 'chat_template')
  return protocol === 'openai'
}

export function validateProviderForm(form: ModelProviderFormModel): ModelProviderIssue[] {
  const issues: ModelProviderIssue[] = []
  const name = form.displayName.trim()
  if (!name) issues.push({ field: 'displayName', message: '请输入显示名称' })
  else if (name.length > MODEL_DISPLAY_NAME_MAX) issues.push({ field: 'displayName', message: `显示名称不能超过 ${MODEL_DISPLAY_NAME_MAX} 个字符` })
  if (!form.provider) issues.push({ field: 'provider', message: '请选择厂商 / 协议' })
  if (!form.modelName.trim()) issues.push({ field: 'modelName', message: '请输入模型名' })
  if (form.providerType === 'audio' && !form.baseUrl.trim()) issues.push({ field: 'baseUrl', message: '请输入音频转写服务地址' })
  if (form.contextLength != null && (!Number.isInteger(form.contextLength) || form.contextLength <= 0)) {
    issues.push({ field: 'contextLength', message: '上下文窗口须为正整数' })
  }
  if (form.providerType !== 'chat' || !form.supportsReasoningEffort) return issues
  if (!form.reasoningKeys.length) issues.push({ field: 'reasoningKeys', message: '请至少选择一个思考档位' })
  for (const key of form.reasoningKeys) {
    const value = (form.reasoningValues[key] ?? '').trim()
    if (!value) issues.push({ field: `reasoningValues.${key}`, message: '请填写上游支持的参数值' })
    else if (value.length > REASONING_VALUE_MAX) issues.push({ field: `reasoningValues.${key}`, message: `参数值不能超过 ${REASONING_VALUE_MAX} 个字符` })
  }
  if (!form.defaultReasoningEffort || !form.reasoningKeys.includes(form.defaultReasoningEffort)) {
    issues.push({ field: 'defaultReasoningEffort', message: '默认档位必须属于已启用的档位' })
  }
  return issues
}

/** 档位参数：纯数字按整数发送，其余按字符串。 */
function toLevelValue(raw: string): string | number {
  const value = raw.trim()
  return /^\d+$/.test(value) ? Number(value) : value
}

/**
 * 表单 → 请求体：在原 extra_config 上合并上下文窗口、思考强度与读图，非 chat 时清掉这些键；
 * API Key 留空时不带该字段（编辑 = 不修改，新增 = 不填）。
 */
export function buildProviderPayload(form: ModelProviderFormModel, original?: ModelProviderItem | null): ModelProviderInput {
  const originalExtra = original?.extra_config ?? {}
  // JSON 往返得到纯对象：original 可能来自响应式列表，代理对象不能直接 structuredClone。
  const extra = JSON.parse(JSON.stringify(originalExtra)) as Record<string, unknown>
  // 保存即视为人工确认上下文窗口，探测来源标记不再保留。
  delete extra.context_length_source
  if (form.contextLength) extra.context_length = form.contextLength
  else delete extra.context_length
  const isChat = form.providerType === 'chat'
  if (isChat && form.supportsVision) extra.supports_vision = true
  else delete extra.supports_vision
  applyReasoning(form, extra, originalExtra)
  if (usesOpenAIFastMapping(form) && form.fastReasoningEffort === 'none') extra.fast_reasoning_effort = 'none'
  else delete extra.fast_reasoning_effort
  const payload: ModelProviderInput = {
    display_name: form.displayName.trim(),
    provider: form.provider,
    provider_type: form.providerType,
    base_url: form.baseUrl.trim(),
    model_name: form.modelName.trim(),
    is_active: form.isActive,
    extra_config: extra,
  }
  const apiKey = form.apiKey.trim()
  if (apiKey) payload.api_key = apiKey
  return payload
}

function applyReasoning(form: ModelProviderFormModel, extra: Record<string, unknown>, originalExtra: Record<string, unknown>) {
  delete extra.reasoning_effort_levels
  delete extra.default_reasoning_effort
  if (form.providerType !== 'chat' || !form.supportsReasoningEffort) {
    delete extra.supports_reasoning_effort
    return
  }
  extra.supports_reasoning_effort = true
  // 旧数据只有开关、没有显式档位：未探测且未改动时保持原样，不顺手迁移成显式档位。
  if (originalExtra.supports_reasoning_effort && !originalExtra.reasoning_effort_levels && !form.reasoningDetected) {
    const initial = reasoningFields(originalExtra)
    const unchanged = JSON.stringify(form.reasoningKeys) === JSON.stringify(initial.reasoningKeys)
      && form.reasoningKeys.every((key) => (form.reasoningValues[key] ?? '') === (initial.reasoningValues[key] ?? ''))
      && form.defaultReasoningEffort === initial.defaultReasoningEffort
    if (unchanged) return
  }
  extra.reasoning_effort_levels = form.reasoningKeys.map((key) => ({ key, value: toLevelValue(form.reasoningValues[key] ?? '') }))
  extra.default_reasoning_effort = form.defaultReasoningEffort
}

/** 按用途过滤厂商 / 协议选项。 */
export function providerOptionsForType(schemas: ProviderSchema[], type: ModelProviderType) {
  return schemas.filter((schema) => schema.supports_types.includes(type)).map((schema) => ({ value: schema.id, label: schema.label || schema.id }))
}

/** 切换用途时联动厂商：语音模型固定为音频转写，当前厂商不支持新用途时回落到 OpenAI 兼容。 */
export function providerForType(schemas: ProviderSchema[], current: string, type: ModelProviderType): string {
  if (type === 'audio') return 'audio_compatible'
  const schema = schemas.find((item) => item.id === current)
  return schema?.supports_types.includes(type) ? current : 'openai_compatible'
}

/** 勾选档位变化：按固定顺序排列，新档位参数默认取 key，默认档位不在其中时改为第一个。 */
export function applyReasoningKeys(form: ModelProviderFormModel, next: ReasoningKey[]): void {
  const keys = REASONING_KEYS.filter((key) => next.includes(key))
  for (const key of keys) if (form.reasoningValues[key] == null) form.reasoningValues[key] = key
  form.reasoningKeys = keys
  if (!form.defaultReasoningEffort || !keys.includes(form.defaultReasoningEffort)) form.defaultReasoningEffort = keys[0]
}

export function describeContextProbe(result: ContextProbeResult): string {
  if (!result.context_length) {
    const notes = result.notes.join('；')
    return notes ? `未探测到上下文窗口，请手工填写。探测过程：${notes}` : '未探测到上下文窗口，请手工填写。'
  }
  const base = `已探测到 ${result.context_length} token（来源：${result.source_label}）`
  if (result.confidence === 'low') return `${base}｜该值按模型名推断，并非上游自报，建议核对后再保存。`
  if (result.confidence === 'medium') return `${base}｜该值来自上游报错信息，建议核对后再保存。`
  return base
}

export function describeReasoningProbe(result: ReasoningProbeResult): string {
  const range = result.numeric_range ? ` 上游声明的整数范围：${result.numeric_range[0]}–${result.numeric_range[1]}` : ''
  if (!result.levels.length || !result.complete) return `未能确认思考档位，请检查连接或手动填写；现有配置未改变。${range}`
  const evidence = result.source === 'accepted_probe' ? '测试请求已被接受，但上游可能忽略思考参数。' : '档位来自上游明确声明。'
  return `${evidence}${range} 请核对后保存；探测不会自动修改模型配置。`
}

export function reasoningLabel(key: ReasoningKey): string {
  return REASONING_LABELS[key]
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** 供应商新增 / 编辑弹窗的表单状态、探测与保存；保存成功后由弹窗关闭并通知列表刷新。 */
export function useModelProviderEditor() {
  const toast = useToast()
  const draft = ref<ModelProviderFormModel>(emptyProviderForm())
  const original = ref<ModelProviderItem | null>(null)
  const saving = ref(false)
  const error = ref('')
  const detectingContext = ref(false)
  const contextHint = ref('')
  const detectingReasoning = ref(false)
  const reasoningHint = ref('')
  const issues = computed(() => validateProviderForm(draft.value))

  function open(item: ModelProviderItem | null): void {
    original.value = item
    draft.value = item ? providerToForm(item) : emptyProviderForm()
    error.value = ''
    reasoningHint.value = ''
    contextHint.value = item?.extra_config?.context_length_source
      ? '当前值由系统自动探测填入，尚未人工确认；保存即视为确认。'
      : ''
  }

  function changeType(schemas: ProviderSchema[], type: ModelProviderType): void {
    draft.value.provider = providerForType(schemas, draft.value.provider, type)
    draft.value.providerType = type
  }

  function probeBody(): ModelProbeRequest {
    const form = draft.value
    return {
      provider: form.provider || 'openai_compatible',
      provider_type: form.providerType,
      base_url: form.baseUrl.trim(),
      api_key: form.apiKey.trim(),
      model_name: form.modelName.trim(),
      provider_id: original.value?.provider_id,
    }
  }

  /** 探测上下文窗口：只回填表单，由管理员核对后保存。 */
  async function detectContext(): Promise<void> {
    if (!draft.value.modelName.trim()) {
      toast.add({ title: '请先填写模型名', color: 'warning' })
      return
    }
    const fingerprint = contextFingerprint()
    detectingContext.value = true
    try {
      const result = await detectModelContextLength(probeBody())
      if (contextFingerprint() !== fingerprint) return
      contextHint.value = describeContextProbe(result)
      if (result.context_length > 0) {
        draft.value.contextLength = result.context_length
        toast.add({ title: `已探测到上下文窗口 ${result.context_length} token`, color: 'success' })
      } else {
        toast.add({ title: '未能自动探测到上下文窗口，请手工填写', color: 'warning' })
      }
    } catch (err) {
      toast.add({ title: `探测失败：${errorMessage(err, '请稍后重试')}`, color: 'error' })
    } finally {
      detectingContext.value = false
    }
  }

  function contextFingerprint(): string {
    const form = draft.value
    return JSON.stringify([original.value?.provider_id, form.provider, form.providerType, form.modelName, form.baseUrl, form.apiKey, form.contextLength])
  }

  function reasoningFingerprint(): string {
    const form = draft.value
    return JSON.stringify([original.value?.provider_id, form.provider, form.providerType, form.modelName, form.baseUrl, form.apiKey, form.supportsReasoningEffort, form.reasoningKeys, form.reasoningValues, form.defaultReasoningEffort])
  }

  /** 探测思考档位：探测期间表单被改动则丢弃结果，避免覆盖手工输入。 */
  async function detectReasoning(): Promise<void> {
    if (!draft.value.modelName.trim()) {
      toast.add({ title: '请先填写模型名', color: 'warning' })
      return
    }
    const fingerprint = reasoningFingerprint()
    detectingReasoning.value = true
    reasoningHint.value = ''
    try {
      const result = await detectModelReasoning(probeBody())
      if (reasoningFingerprint() !== fingerprint) return
      reasoningHint.value = describeReasoningProbe(result)
      if (!result.levels.length || !result.complete) return
      const detected = reasoningFields({ reasoning_effort_levels: result.levels, default_reasoning_effort: result.default ?? undefined })
      Object.assign(draft.value, detected, { reasoningDetected: true })
    } catch (err) {
      toast.add({ title: errorMessage(err, '思考档位探测失败'), color: 'error' })
    } finally {
      detectingReasoning.value = false
    }
  }

  /** 校验通过后新增或更新；成功返回保存后的供应商，失败写入 error。 */
  async function save(): Promise<ModelProviderItem | null> {
    if (saving.value || validateProviderForm(draft.value).length) return null
    saving.value = true
    error.value = ''
    try {
      const payload = buildProviderPayload(draft.value, original.value)
      if (original.value) {
        const saved = await updateModelProvider(original.value.provider_id, payload)
        toast.add({ title: '模型供应商已更新', color: 'success' })
        return saved
      }
      const saved = await createModelProvider(payload)
      const deferred = payload.provider_type === 'audio' && !payload.base_url
      toast.add({ title: deferred ? '音频模型已保存；服务地址待配置' : '模型供应商已添加并通过连通性校验', color: 'success' })
      return saved
    } catch (err) {
      error.value = errorMessage(err, '保存失败，请稍后重试')
      return null
    } finally {
      saving.value = false
    }
  }

  return {
    draft,
    original,
    issues,
    saving,
    error,
    detectingContext,
    contextHint,
    detectingReasoning,
    reasoningHint,
    open,
    changeType,
    detectContext,
    detectReasoning,
    save,
  }
}
