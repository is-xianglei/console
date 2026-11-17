import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServiceConfigGroup, ServiceConfigItem } from '@/interfaces/settings/services/model'
import {
  buildServiceConfigUpdates,
  getServiceConfigControl,
  getServiceConfigOptions,
  getVisibleServiceConfigItems,
  isServiceConfigEnabled,
  useSettingsServices,
} from './useSettingsServices'

const toastAdd = vi.fn()
vi.mock('@nuxt/ui/composables', () => ({
  useToast: () => ({ add: toastAdd }),
}))

const http = vi.hoisted(() => ({
  getServiceConfigs: vi.fn(),
  updateServiceConfigs: vi.fn(),
  testServiceConfig: vi.fn(),
}))
vi.mock('@/http/settings/services', () => http)

function item(config_key: string, config_value: string | null, extra: Partial<ServiceConfigItem> = {}): ServiceConfigItem {
  return {
    config_key,
    config_value,
    display_name: config_key,
    description: '',
    group_key: config_key.split('.')[0],
    is_secret: false,
    ...extra,
  }
}

function searchGroup(): ServiceConfigGroup {
  return {
    group_key: 'internet_search',
    label: '互联网搜索',
    testable: true,
    items: [
      item('internet_search.engine', 'tavily'),
      item('internet_search.tavily_api_key', 'tvly****cdef', { is_secret: true }),
      item('internet_search.baidu_api_key', null, { is_secret: true }),
      item('internet_search.langsearch_api_key', null, { is_secret: true }),
      item('internet_search.deepseek_api_key', null, { is_secret: true }),
    ],
  }
}

function parserGroup(): ServiceConfigGroup {
  return {
    group_key: 'file_parser',
    label: '文件解析服务',
    testable: true,
    items: [
      item('file_parser.api_url', null),
      item('file_parser.timeout', '60'),
      item('file_parser.parse_method', 'auto'),
      item('file_parser.formula_enable', 'true'),
    ],
  }
}

describe('getServiceConfigControl', () => {
  it('已知布尔 key 即使值为空也是开关', () => {
    expect(getServiceConfigControl(item('sandbox.code_capability_enable', null))).toBe('boolean')
  })

  it('值为 true / false 的未知 key 也按布尔处理，开关状态不区分大小写', () => {
    expect(getServiceConfigControl(item('x.flag', 'FALSE'))).toBe('boolean')
    expect(getServiceConfigOptions(item('x.flag', 'true'))).toEqual([])
    expect(isServiceConfigEnabled('TRUE')).toBe(true)
    expect(isServiceConfigEnabled(null)).toBe(false)
  })

  it('枚举项是下拉，引擎显示中文名', () => {
    expect(getServiceConfigControl(item('file_parser.parse_method', 'auto'))).toBe('enum')
    expect(getServiceConfigOptions(item('internet_search.engine', 'tavily')).map((option) => option.label))
      .toEqual(['Tavily', '百度千帆', 'LangSearch', 'DeepSeek'])
  })

  it('密钥是密码框，其余是输入框', () => {
    expect(getServiceConfigControl(item('internet_search.tavily_api_key', 'tvly****cdef', { is_secret: true }))).toBe('secret')
    expect(getServiceConfigControl(item('chat.compress_in_turn_ratio', '0.90'))).toBe('text')
    expect(getServiceConfigOptions(item('file_parser.api_url', null))).toEqual([])
  })
})

describe('getVisibleServiceConfigItems', () => {
  it('互联网搜索只显示所选引擎的 API Key', () => {
    const keys = (edited: Record<string, string>) => getVisibleServiceConfigItems(searchGroup(), edited).map((entry) => entry.config_key)
    expect(keys({})).toEqual(['internet_search.engine', 'internet_search.tavily_api_key'])
    expect(keys({ 'internet_search.engine': 'baidu' })).toEqual(['internet_search.engine', 'internet_search.baidu_api_key'])
  })

  it('其他分组全部显示', () => {
    expect(getVisibleServiceConfigItems(parserGroup(), {})).toHaveLength(4)
  })
})

describe('buildServiceConfigUpdates', () => {
  it('只提交改过且与原值不同的项', () => {
    expect(buildServiceConfigUpdates([parserGroup()], {
      'file_parser.api_url': 'http://parser:8000',
      'file_parser.timeout': '60',
      'file_parser.formula_enable': 'false',
    })).toEqual([
      { key: 'file_parser.api_url', value: 'http://parser:8000' },
      { key: 'file_parser.formula_enable', value: 'false' },
    ])
  })

  it('布尔项按开关状态比较，关了再开不算改动', () => {
    const group = { ...parserGroup(), items: [item('file_parser.formula_enable', 'TRUE')] }
    expect(buildServiceConfigUpdates([group], { 'file_parser.formula_enable': 'true' })).toEqual([])
  })

  it('切换引擎后，原引擎被隐藏的 API Key 改动不提交', () => {
    expect(buildServiceConfigUpdates([searchGroup()], {
      'internet_search.tavily_api_key': 'tvly-new-key',
      'internet_search.engine': 'baidu',
      'internet_search.baidu_api_key': 'bce-key',
    })).toEqual([
      { key: 'internet_search.engine', value: 'baidu' },
      { key: 'internet_search.baidu_api_key', value: 'bce-key' },
    ])
  })

  it('仍带掩码的密钥不提交，清空密钥要提交', () => {
    expect(buildServiceConfigUpdates([searchGroup()], { 'internet_search.tavily_api_key': 'tvly****cdefx' })).toEqual([])
    expect(buildServiceConfigUpdates([searchGroup()], { 'internet_search.tavily_api_key': '' }))
      .toEqual([{ key: 'internet_search.tavily_api_key', value: '' }])
  })

  it('多个分组的改动合并成一份', () => {
    expect(buildServiceConfigUpdates([searchGroup(), parserGroup()], {
      'internet_search.engine': 'deepseek',
      'file_parser.timeout': '120',
    })).toEqual([
      { key: 'internet_search.engine', value: 'deepseek' },
      { key: 'file_parser.timeout', value: '120' },
    ])
  })
})

describe('useSettingsServices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    http.getServiceConfigs.mockResolvedValue([searchGroup(), parserGroup()])
    http.updateServiceConfigs.mockResolvedValue({ updated: 2 })
  })

  it('无改动时不请求', async () => {
    const services = useSettingsServices()
    await services.load()
    services.setValue(services.groups.value[1].items[1], '60')
    expect(services.pendingUpdates.value).toEqual([])
    await services.save()
    expect(http.updateServiceConfigs).not.toHaveBeenCalled()
  })

  it('所有分组的改动一次提交，成功后清空改动并重新加载', async () => {
    const services = useSettingsServices()
    await services.load()
    const [search, parser] = services.groups.value
    services.setValue(search.items[1], 'tvly-hidden-after-switch')
    services.setValue(search.items[0], 'deepseek')
    services.setValue(parser.items[0], 'http://parser:8000')
    services.setValue(parser.items[1], '60')
    expect(services.pendingUpdates.value).toHaveLength(2)

    await services.save()

    expect(http.updateServiceConfigs).toHaveBeenCalledTimes(1)
    expect(http.updateServiceConfigs).toHaveBeenCalledWith({
      items: [
        { key: 'internet_search.engine', value: 'deepseek' },
        { key: 'file_parser.api_url', value: 'http://parser:8000' },
      ],
    })
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: '配置已保存（约 30 秒内生效）', color: 'success' }))
    expect(http.getServiceConfigs).toHaveBeenCalledTimes(2)
    expect(services.edited.value).toEqual({})
    expect(services.saving.value).toBe(false)
  })

  it('保存失败时保留改动', async () => {
    const services = useSettingsServices()
    await services.load()
    services.setValue(services.groups.value[1].items[1], '120')
    http.updateServiceConfigs.mockRejectedValueOnce(new Error('网络错误'))

    await services.save()

    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: '保存失败', description: '网络错误', color: 'error' }))
    expect(services.pendingUpdates.value).toEqual([{ key: 'file_parser.timeout', value: '120' }])
  })

  it('放弃后回到最近一次加载的值', async () => {
    const services = useSettingsServices()
    await services.load()
    const timeout = services.groups.value[1].items[1]
    services.setValue(timeout, '120')
    expect(services.valueOf(timeout)).toBe('120')

    services.discard()

    expect(services.valueOf(timeout)).toBe('60')
    expect(services.pendingUpdates.value).toEqual([])
  })

  it('测试结果按成功 / 失败提示', async () => {
    const services = useSettingsServices()
    await services.load()
    http.testServiceConfig.mockResolvedValueOnce({ success: true, latency_ms: 120, error: null })
    await services.test(services.groups.value[0])
    http.testServiceConfig.mockResolvedValueOnce({ success: false, latency_ms: 0, error: 'URL 未配置' })
    await services.test(services.groups.value[1])
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: '互联网搜索 连通性正常（120ms）' }))
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: '文件解析服务 连通性失败：URL 未配置' }))
  })
})
