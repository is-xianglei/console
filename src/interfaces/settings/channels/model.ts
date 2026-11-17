/** 渠道类型：飞书 / 钉钉 / 企业微信。 */
export type ChannelType = 'lark' | 'dingtalk' | 'wecom'

/** 接入方式：长连接（免公网回调）或 Webhook（需公网回调）。 */
export type ChannelTransport = 'long_conn' | 'webhook'

export type ChannelBotStatus = 'disconnected' | 'pending' | 'connected' | 'error'

/** 群聊旁听：mention_only 仅处理 @ 机器人的消息；observe_all 旁观群内其他消息作为上下文（不回复）。 */
export type ChannelGroupListenMode = 'mention_only' | 'observe_all'

/** 凭据字段名；app_id / app_secret 为核心字段，其余放进请求体 extra。 */
export type ChannelCredentialField = 'app_id' | 'app_secret' | 'agent_id' | 'token' | 'aes_key'

/** 渠道能力（GET /v1/channels/adapters）。 */
export interface ChannelAdapterInfo {
  channel_type: ChannelType
  supports_long_conn: boolean
  /** 该渠道是否可能投递「未 @ 机器人」的群消息，即群聊旁听是否有意义。 */
  supports_group_observe: boolean
  /** 表单按此顺序渲染凭据输入。 */
  credential_fields: ChannelCredentialField[]
}

/** 渠道机器人（GET /v1/channels/bots）。 */
export interface ChannelBot {
  channel_id: string
  channel_type: ChannelType
  display_name: string
  transport: ChannelTransport
  app_id: string
  status: ChannelBotStatus
  enabled: boolean
  group_listen_mode: ChannelGroupListenMode
  last_error: string | null
  created_at: string | null
  /** 仅 webhook 模式创建时回吐，需填回渠道后台。 */
  webhook_path?: string
}

/** 测试凭据结果（POST /v1/channels/bots/{id}/test）。 */
export interface ChannelBotTestResult {
  ok: boolean
}
