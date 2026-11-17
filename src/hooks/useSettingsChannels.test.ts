import { describe, expect, it, vi } from 'vitest'
import { CHANNEL_ADAPTERS } from '@/constants/settings/channels'
import type { ChannelType } from '@/interfaces/settings/channels/model'
import {
  bindFormToPayload,
  emptyBindForm,
  getCredentialFields,
  resolveTransport,
  switchBindFormChannel,
  validateBindForm,
} from './useSettingsChannels'

vi.mock('@nuxt/ui/composables', () => ({
  useToast: () => ({ add: vi.fn() }),
}))

function adapter(channelType: ChannelType) {
  return CHANNEL_ADAPTERS.find((item) => item.channel_type === channelType)!
}

describe('useSettingsChannels 表单', () => {
  it('按渠道 credential_fields 生成凭据字段，缺省回落 app_id / app_secret', () => {
    expect(getCredentialFields(adapter('lark'))).toEqual(['app_id', 'app_secret'])
    expect(getCredentialFields(adapter('wecom'))).toEqual(['app_id', 'app_secret', 'agent_id', 'token', 'aes_key'])
    expect(getCredentialFields(undefined)).toEqual(['app_id', 'app_secret'])
  })

  it('接入方式：飞书可选，钉钉固定长连接，企业微信固定 webhook', () => {
    const lark = { ...emptyBindForm(adapter('lark')), transport: 'webhook' as const }
    expect(resolveTransport(lark, adapter('lark'))).toBe('webhook')
    const dingtalk = { ...emptyBindForm(adapter('dingtalk')), transport: 'webhook' as const }
    expect(resolveTransport(dingtalk, adapter('dingtalk'))).toBe('long_conn')
    expect(emptyBindForm(adapter('wecom')).transport).toBe('webhook')
  })

  it('切换渠道清空凭据、保留名称', () => {
    const form = emptyBindForm(adapter('lark'))
    form.displayName = '客服机器人'
    form.credentials.app_id = 'cli_x'
    form.encryptKey = 'k'
    const next = switchBindFormChannel(form, adapter('wecom'))
    expect(next).toMatchObject({ channelType: 'wecom', displayName: '客服机器人', transport: 'webhook', encryptKey: '' })
    expect(next.credentials.app_id).toBe('')
  })

  it('校验 App ID / App Secret 必填、名称 ≤100', () => {
    const form = emptyBindForm(adapter('lark'))
    form.displayName = 'a'.repeat(101)
    expect(validateBindForm(form).map((issue) => issue.name)).toEqual(['displayName', 'app_id', 'app_secret'])
  })

  it('企业微信：附加凭据放进 extra，空值忽略，丢弃不属于该渠道的字段', () => {
    const form = emptyBindForm(adapter('wecom'))
    form.credentials = { app_id: ' ww1 ', app_secret: 's', agent_id: '1000002', token: '', aes_key: 'aes' }
    form.encryptKey = 'ignored'
    expect(bindFormToPayload(form, adapter('wecom'))).toEqual({
      channel_type: 'wecom',
      app_id: 'ww1',
      app_secret: 's',
      transport: 'webhook',
      extra: { agent_id: '1000002', aes_key: 'aes' },
    })
  })

  it('飞书 webhook 带 encrypt_key / verification_token；长连接不带 extra', () => {
    const form = emptyBindForm(adapter('lark'))
    form.displayName = ' 客服 '
    form.credentials.app_id = 'cli_a'
    form.credentials.app_secret = 'sec'
    form.credentials.agent_id = 'stale'
    form.encryptKey = 'ek'
    form.verificationToken = 'vt'
    expect(bindFormToPayload(form, adapter('lark'))).toEqual({
      channel_type: 'lark', app_id: 'cli_a', app_secret: 'sec', transport: 'long_conn', display_name: '客服',
    })
    form.transport = 'webhook'
    expect(bindFormToPayload(form, adapter('lark')).extra).toEqual({ encrypt_key: 'ek', verification_token: 'vt' })
  })
})
