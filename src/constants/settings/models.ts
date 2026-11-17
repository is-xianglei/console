import type {
  ModelProviderType,
  ProviderSchema,
  ReasoningKey,
  ReasoningLevel,
} from '@/interfaces/settings/models/model'

export const MODEL_TYPE_LABELS: Record<ModelProviderType, string> = {
  chat: '对话',
  embedding: '向量',
  reranker: '重排',
  audio: '语音模型',
}

export const MODEL_TYPE_OPTIONS = (Object.keys(MODEL_TYPE_LABELS) as ModelProviderType[])
  .map((value) => ({ value, label: MODEL_TYPE_LABELS[value] }))

export const REASONING_KEYS: ReasoningKey[] = ['low', 'medium', 'high', 'xhigh', 'max']

export const REASONING_LABELS: Record<ReasoningKey, string> = {
  low: '思考·低',
  medium: '思考·中',
  high: '思考·高',
  xhigh: '思考·超高',
  max: '思考·最高',
}

/** 开启「支持多档思考强度」时的初始档位。 */
export const DEFAULT_REASONING_LEVELS: ReasoningLevel[] = [
  { key: 'medium', value: 'medium' },
  { key: 'high', value: 'high' },
  { key: 'xhigh', value: 'xhigh' },
]

export const MODEL_DISPLAY_NAME_MAX = 100
export const REASONING_VALUE_MAX = 64

/** 厂商 / 协议列表，对应后端 core/models/providers/registry.py 的 PROVIDER_SPECS。 */
const PROVIDER_SCHEMAS: ProviderSchema[] = [
  { id: 'openai_compatible', label: 'OpenAI 兼容', engine: 'openai', supports_types: ['chat', 'embedding', 'reranker', 'audio'], base_url_template: 'https://api.openai.com/v1', autofill_base_url: false, api_key_required: true },
  { id: 'audio_compatible', label: '音频转写（OpenAI 兼容）', engine: 'openai', supports_types: ['audio'], base_url_template: 'http://<asr-host>:8000/v1', autofill_base_url: false, api_key_required: false },
  { id: 'openai', label: 'OpenAI / Codex', engine: 'openai', supports_types: ['chat', 'embedding', 'audio'], base_url_template: 'https://api.openai.com/v1', autofill_base_url: false, api_key_required: true },
  { id: 'deepseek', label: 'DeepSeek', engine: 'openai', supports_types: ['chat'], base_url_template: 'https://api.deepseek.com/v1', autofill_base_url: true, api_key_required: true },
  { id: 'zhipu', label: '智谱 GLM', engine: 'openai', supports_types: ['chat'], base_url_template: 'https://open.bigmodel.cn/api/paas/v4', autofill_base_url: true, api_key_required: true },
  { id: 'minimax', label: 'MiniMax', engine: 'openai', supports_types: ['chat'], base_url_template: 'https://api.minimaxi.com/v1', autofill_base_url: true, api_key_required: true },
  { id: 'siliconflow', label: '硅基流动', engine: 'openai', supports_types: ['chat', 'embedding', 'reranker'], base_url_template: 'https://api.siliconflow.cn/v1', autofill_base_url: true, api_key_required: true },
  { id: 'moonshot', label: 'Kimi / Moonshot', engine: 'openai', supports_types: ['chat'], base_url_template: 'https://api.moonshot.cn/v1', autofill_base_url: true, api_key_required: true },
  { id: 'qwen_compat', label: '通义千问（兼容模式）', engine: 'openai', supports_types: ['chat', 'embedding'], base_url_template: 'https://dashscope.aliyuncs.com/compatible-mode/v1', autofill_base_url: true, api_key_required: true },
  { id: 'azure_openai', label: 'Azure OpenAI', engine: 'openai', supports_types: ['chat'], base_url_template: 'https://<resource>.openai.azure.com', autofill_base_url: false, api_key_required: true },
  { id: 'anthropic', label: 'Anthropic 原生', engine: 'native', supports_types: ['chat'], base_url_template: 'https://api.anthropic.com', autofill_base_url: true, api_key_required: true },
  { id: 'gemini', label: 'Google Gemini', engine: 'native', supports_types: ['chat'], base_url_template: '', autofill_base_url: false, api_key_required: true },
  { id: 'dashscope', label: '阿里 DashScope 原生', engine: 'native', supports_types: ['chat'], base_url_template: '', autofill_base_url: false, api_key_required: true },
  { id: 'ollama', label: '本地 Ollama', engine: 'native', supports_types: ['chat'], base_url_template: 'http://localhost:11434', autofill_base_url: true, api_key_required: false },
  { id: 'bedrock', label: 'AWS Bedrock', engine: 'litellm', supports_types: ['chat'], base_url_template: '', autofill_base_url: false, api_key_required: false },
]

/** 仅供协议筛选与表单纯函数测试；页面实际协议以服务端接口为准。 */
export function getProviderSchemas(): ProviderSchema[] {
  return structuredClone(PROVIDER_SCHEMAS)
}
