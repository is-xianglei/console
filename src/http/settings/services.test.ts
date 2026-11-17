import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getServiceConfigs, testServiceConfig, updateServiceConfigs } from './services'

async function run<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return promise
}

function findValue(groups: Awaited<ReturnType<typeof getServiceConfigs>>, key: string) {
  return groups.flatMap((group) => group.items).find((item) => item.config_key === key)?.config_value
}

describe('services http（模拟）', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('密钥脱敏返回，带掩码的值写回时跳过', async () => {
    const masked = findValue(await run(getServiceConfigs()), 'internet_search.tavily_api_key')
    expect(masked).toContain('****')

    await run(updateServiceConfigs({ items: [{ key: 'internet_search.tavily_api_key', value: masked ?? null }] }))
    expect(findValue(await run(getServiceConfigs()), 'internet_search.tavily_api_key')).toBe(masked)
  })

  it('文件解析 api_url 为空时测试失败，填写后成功', async () => {
    await run(updateServiceConfigs({ items: [{ key: 'file_parser.api_url', value: '' }] }))
    expect(await run(testServiceConfig('file_parser'))).toMatchObject({ success: false, error: 'URL 未配置' })

    await run(updateServiceConfigs({ items: [{ key: 'file_parser.api_url', value: 'http://parser:8000' }] }))
    expect(await run(testServiceConfig('file_parser'))).toMatchObject({ success: true, error: null })
  })

  it('不在白名单的 key 拒绝写入', async () => {
    const pending = updateServiceConfigs({ items: [{ key: 'auth.secret', value: 'x' }] })
    const assertion = expect(pending).rejects.toThrow('不在个人可配置范围内')
    await vi.runAllTimersAsync()
    await assertion
  })
})
