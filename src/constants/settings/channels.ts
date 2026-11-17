import type {
  ChannelAdapterInfo,
  ChannelBot,
  ChannelBotStatus,
  ChannelCredentialField,
  ChannelTransport,
  ChannelType,
} from '@/interfaces/settings/channels/model'

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  lark: '飞书',
  dingtalk: '钉钉',
  wecom: '企业微信',
}

export const CHANNEL_TRANSPORT_LABELS: Record<ChannelTransport, string> = {
  long_conn: '长连接',
  webhook: 'Webhook',
}

/** 飞书可选的接入方式；其他渠道由能力固定。 */
export const LARK_TRANSPORT_OPTIONS: { value: ChannelTransport; label: string }[] = [
  { value: 'long_conn', label: '长连接（推荐，免公网回调）' },
  { value: 'webhook', label: 'Webhook（需公网回调）' },
]

/** 连接状态：名称前的状态图标，label 用于 tooltip 与读屏文字。tone 对应设置页 .status[data-tone]。 */
export const CHANNEL_STATUS_META: Record<ChannelBotStatus, { label: string; icon: string; tone: 'success' | 'warning' | 'error' | 'muted' }> = {
  connected: { label: '已连接', icon: 'i-lucide-circle-check', tone: 'success' },
  pending: { label: '连接中', icon: 'i-lucide-loader-circle', tone: 'warning' },
  error: { label: '异常', icon: 'i-lucide-circle-alert', tone: 'error' },
  disconnected: { label: '已停用', icon: 'i-lucide-circle-minus', tone: 'muted' },
}

export const CHANNEL_CREDENTIAL_FIELD_META: Record<ChannelCredentialField, { label: string; password?: boolean }> = {
  app_id: { label: 'App ID / CorpID' },
  app_secret: { label: 'App Secret', password: true },
  agent_id: { label: '应用 AgentId' },
  token: { label: '回调 Token' },
  aes_key: { label: '回调 EncodingAESKey', password: true },
}

// mock 数据，待 /v1/channels/* 接口就绪后由 src/http/settings/channels.ts 改为真实请求。

/** 渠道能力，对应后端 adapters 的 ChannelCaps。 */
export const CHANNEL_ADAPTERS: ChannelAdapterInfo[] = [
  { channel_type: 'lark', supports_long_conn: true, supports_group_observe: true, credential_fields: ['app_id', 'app_secret'] },
  { channel_type: 'dingtalk', supports_long_conn: true, supports_group_observe: true, credential_fields: ['app_id', 'app_secret'] },
  { channel_type: 'wecom', supports_long_conn: false, supports_group_observe: false, credential_fields: ['app_id', 'app_secret', 'agent_id', 'token', 'aes_key'] },
]

/** 模拟库里的机器人：多存一份 app_secret，供「测试」判断凭据是否有效（以 invalid 开头视为无效）。 */
export type MockChannelBot = ChannelBot & { app_secret: string }

export const CHANNEL_BOTS: MockChannelBot[] = [
  {
    channel_id: 'ch-lark-01',
    channel_type: 'lark',
    display_name: '客服机器人',
    transport: 'long_conn',
    app_id: 'cli_a1b2c3',
    app_secret: 'lark-secret',
    status: 'connected',
    enabled: true,
    group_listen_mode: 'mention_only',
    last_error: null,
    created_at: '2026-10-12T09:20:00Z',
  },
  {
    channel_id: 'ch-dingtalk-01',
    channel_type: 'dingtalk',
    display_name: '研发助手',
    transport: 'long_conn',
    app_id: 'dingx7k2m9',
    app_secret: 'dingtalk-secret',
    status: 'pending',
    enabled: true,
    group_listen_mode: 'observe_all',
    last_error: null,
    created_at: '2026-10-18T03:05:00Z',
  },
  {
    channel_id: 'ch-wecom-01',
    channel_type: 'wecom',
    display_name: '运维通知',
    transport: 'webhook',
    app_id: 'ww123456',
    app_secret: 'invalid-secret',
    status: 'error',
    enabled: true,
    group_listen_mode: 'mention_only',
    last_error: 'invalid app_secret',
    created_at: '2026-10-20T07:40:00Z',
  },
  {
    channel_id: 'ch-lark-02',
    channel_type: 'lark',
    display_name: '周报助手',
    transport: 'webhook',
    app_id: 'cli_f9e8d7',
    app_secret: 'lark-secret-2',
    status: 'disconnected',
    enabled: false,
    group_listen_mode: 'mention_only',
    last_error: null,
    created_at: '2026-10-21T11:00:00Z',
  },
]

/** 统一取数入口：当前返回 mock 数据。 */
export function getChannelAdapters(): ChannelAdapterInfo[] {
  return CHANNEL_ADAPTERS
}

export function getChannelBots(): MockChannelBot[] {
  return CHANNEL_BOTS
}
