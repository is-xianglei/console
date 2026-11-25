/** 供应商用途：对话 / 向量 / 重排 / 语音模型。 */
export type ModelProviderType = 'chat' | 'embedding' | 'reranker' | 'audio'

/** 最近一次连通性测试结果；null 表示未测试。 */
export type ModelTestStatus = 'success' | 'failed'

/** 思考档位 key。 */
export type ReasoningKey = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** 单个思考档位：key 对应上游参数值（字符串或正整数）。 */
export interface ReasoningLevel {
  key: ReasoningKey
  value: string | number
}

/** 模型供应商（GET /api/models/providers）。api_key 为掩码。 */
export interface ModelProviderItem {
  provider_id: string
  display_name: string
  provider_type: ModelProviderType
  /** 厂商 / 协议 id，见 provider-schemas。 */
  provider: string
  base_url: string
  api_key: string
  model_name: string
  /** context_length、supports_reasoning_effort、reasoning_effort_levels、default_reasoning_effort、supports_vision 等。 */
  extra_config: Record<string, unknown>
  is_active: boolean
  last_tested_at?: string | null
  last_test_status?: ModelTestStatus | string | null
}

/** 系统角色指派（GET /api/models/roles）。 */
export interface ModelRoleAssignment {
  role_key: string
  label: string
  required_type: ModelProviderType
  provider_id: string | null
  provider_name?: string | null
}

/** 厂商 / 协议说明（GET /api/models/provider-schemas）。 */
export interface ProviderSchema {
  id: string
  label: string
  engine: 'openai' | 'native' | 'litellm'
  supports_types: ModelProviderType[]
  base_url_template: string
  autofill_base_url: boolean
  api_key_required: boolean
}

/** 连通性测试结果（POST /api/models/providers/{id}/test）。 */
export interface ModelProviderTestResult {
  success: boolean
  latency_ms: number
  error?: string | null
}

/** 上下文窗口探测结果（POST /api/models/providers/detect-context）。 */
export interface ContextProbeResult {
  /** 0 表示没探到，需人工填写。 */
  context_length: number
  source: string
  source_label: string
  confidence: 'high' | 'medium' | 'low' | 'none'
  notes: string[]
}

/** 思考档位探测结果（POST /api/models/providers/detect-reasoning）。 */
export interface ReasoningProbeResult {
  levels: ReasoningLevel[]
  default: ReasoningKey | null
  source: 'model_metadata' | 'validation_error' | 'accepted_probe' | 'unknown'
  complete: boolean
  numeric_range?: [number, number] | null
}

/** 用户当前的默认模型（/api/models/preferences）。 */
export interface ModelPreferences {
  default_model_provider_id: string | null
}

/** 思考强度；fast 表示关闭思考。 */
export type ThinkingEffort = 'fast' | ReasoningKey

export interface ReasoningPolicy {
  fast_behavior?: 'disabled' | 'model_default'
  supports_reasoning_effort: boolean
  reasoning_effort_levels: ReasoningLevel[]
  default_reasoning_effort: ReasoningKey
  reasoning_effort_configured: boolean
}

export interface ChatModelOption extends ReasoningPolicy {
  provider_id: string
  display_name: string
  model_name: string
}

export interface ChatModelCapabilities extends ReasoningPolicy {
  main_provider_id: string | null
  /** 未显式选模型时使用的工作流角色模型；旧后端可能不返回。 */
  workflow_provider_id?: string | null
  allow_model_switch: boolean
  models: ChatModelOption[]
}

/** 与后端会话持久化和消息发送字段保持一致。 */
export interface ChatModelSelection {
  model_provider_id: string | null
  thinking_effort: ThinkingEffort
}
