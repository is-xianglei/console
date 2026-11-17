import type { ServiceConfigGroup, ServiceConfigItem } from '@/interfaces/settings/services/model'

export interface SelectOption {
  label: string
  value: string
}

/** 互联网搜索引擎及其对应的 API Key 配置项。 */
export const INTERNET_SEARCH_ENGINES = [
  { value: 'tavily', label: 'Tavily', apiKeyConfigKey: 'internet_search.tavily_api_key' },
  { value: 'baidu', label: '百度千帆', apiKeyConfigKey: 'internet_search.baidu_api_key' },
  { value: 'langsearch', label: 'LangSearch', apiKeyConfigKey: 'internet_search.langsearch_api_key' },
  { value: 'deepseek', label: 'DeepSeek', apiKeyConfigKey: 'internet_search.deepseek_api_key' },
] as const

export const INTERNET_SEARCH_ENGINE_KEY = 'internet_search.engine'

/** 枚举型配置项 → 下拉选项；其余非布尔项为输入框。 */
export const SERVICE_CONFIG_ENUM_OPTIONS: Record<string, SelectOption[]> = {
  [INTERNET_SEARCH_ENGINE_KEY]: INTERNET_SEARCH_ENGINES.map(({ value, label }) => ({ value, label })),
  'file_parser.parse_method': ['auto', 'ocr', 'txt'].map((value) => ({ value, label: value })),
}

/** 已知布尔项（开关，按 'true' / 'false' 提交）；值为 'true' / 'false' 的项也按布尔处理。 */
export const SERVICE_CONFIG_BOOLEAN_KEYS = new Set([
  'file_parser.formula_enable',
  'file_parser.table_enable',
  'sandbox.code_capability_enable',
])

/** 脱敏密钥里的掩码片段；提交时带掩码的值不写回。 */
export const SECRET_MASK = '****'

/** 模拟接口延迟（毫秒）。 */
export const SERVICE_CONFIG_MOCK_DELAY = 300

type MockRow = Omit<ServiceConfigItem, 'group_key'>

function row(
  config_key: string,
  config_value: string | null,
  display_name: string,
  description: string,
  is_secret = false,
): MockRow {
  return { config_key, config_value, display_name, description, is_secret, updated_at: '2026-10-20T08:00:00Z', updated_by: null }
}

function group(group_key: string, label: string, testable: boolean, items: MockRow[]): ServiceConfigGroup {
  return { group_key, label, testable, items: items.map((item) => ({ ...item, group_key })) }
}

// mock 数据，文案取自后端 system_config_constants.py；密钥存明文，由 http 层脱敏后返回。
// 后端就绪后只替换 src/http/settings/services.ts，本数据随之废弃。
const MOCK_GROUPS: ServiceConfigGroup[] = [
  group('internet_search', '互联网搜索', true, [
    row(INTERNET_SEARCH_ENGINE_KEY, 'tavily', '搜索引擎', '互联网搜索引擎 (tavily / baidu / langsearch / deepseek)'),
    row('internet_search.tavily_api_key', 'tvly-dev-8f3a2c91b7e4', 'Tavily API Key', 'Tavily 互联网搜索服务密钥', true),
    row('internet_search.baidu_api_key', null, '百度搜索 API Key', '百度千帆 AppBuilder 搜索服务密钥', true),
    row('internet_search.langsearch_api_key', null, 'LangSearch API Key', 'LangSearch Web Search API 服务密钥', true),
    row('internet_search.deepseek_api_key', null, 'DeepSeek Search API Key', 'DeepSeek Search API 服务密钥（DeepSeek 开放平台 API Key）', true),
  ]),
  group('file_parser', '文件解析服务', true, [
    row('file_parser.api_url', null, '文件解析 API URL', 'PDF/文档解析服务地址'),
    row('file_parser.timeout', '60', '超时时间(秒)', '文件解析请求超时'),
    row('file_parser.lang_list', 'ch', '语言列表', 'OCR 语言列表'),
    row('file_parser.backend', 'pipeline', '解析后端', '解析后端引擎'),
    row('file_parser.parse_method', 'auto', '解析方法', 'auto / ocr / txt'),
    row('file_parser.formula_enable', 'true', '启用公式识别', '是否启用公式识别'),
    row('file_parser.table_enable', 'true', '启用表格识别', '是否启用表格识别'),
  ]),
  group('knowledge_base', '知识库服务', true, [
    row('knowledge_base.detail_max_chars', '50000', '详情最大字符数', '知识库文档详情最大字符数'),
  ]),
  group('sandbox', '沙箱 / 代码执行', false, [
    row(
      'sandbox.code_capability_enable',
      'true',
      '主智能体代码执行能力',
      '开启后主/计划/批量/子智能体默认具备文件工具+沙箱+我的空间访问；关闭则仅 Lab 入口可用。本开关为唯一控制源，保存后 ≤30s 生效、无需重启。',
    ),
  ]),
  group('context', '对话上下文压缩', false, [
    row(
      'chat.compress_in_turn_ratio',
      '0.90',
      '轮内压缩触发比例',
      '上下文占用超过「模型窗口 × 该值」时触发压缩（0.5~0.90）。计数优先用模型返回的真实 token 用量，拿不到时才退回字节估算，两者都不含模型输出长度——输出余量已由「窗口 95% 可用」统一预留。调大=更晚压缩（上下文更完整）；调小=更早压缩。该比例对轮内、轮前、轮末三个时机统一生效。',
    ),
  ]),
]

/** 统一取数入口：返回内存中的模拟分组（未脱敏，写操作直接修改它）。 */
export function getServiceConfigMockGroups(): ServiceConfigGroup[] {
  return MOCK_GROUPS
}
