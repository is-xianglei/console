import type { ChannelGroupListenMode, ChannelTransport, ChannelType } from './model'

/** 绑定机器人请求（POST /v1/channels/bots）。 */
export interface ChannelBotCreateRequest {
  channel_type: ChannelType
  app_id: string
  app_secret: string
  display_name?: string
  transport: ChannelTransport
  /** 附加凭据：企业微信 agent_id / token / aes_key，飞书 webhook 的 encrypt_key / verification_token。 */
  extra?: Record<string, string>
  group_listen_mode?: ChannelGroupListenMode
}

/** 更新机器人请求（PATCH /v1/channels/bots/{id}）。 */
export interface ChannelBotUpdateRequest {
  display_name?: string
  enabled?: boolean
  group_listen_mode?: ChannelGroupListenMode
}
