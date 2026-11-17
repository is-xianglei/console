import { getChannelAdapters, getChannelBots, type MockChannelBot } from '@/constants/settings/channels'
import type { ChannelBotCreateRequest, ChannelBotUpdateRequest } from '@/interfaces/settings/channels/api'
import type { ChannelAdapterInfo, ChannelBot, ChannelBotTestResult } from '@/interfaces/settings/channels/model'
import { ApiError } from '../index'

// 当前为 mock 实现：读写内存里的模拟数据并模拟网络延迟。
// 后端就绪后各函数改为 request<T>('/v1/channels/...')，签名与返回值不变。

const MOCK_DELAY = 300

/** 模拟库：从 seed 深拷贝一份，写操作只改这里。 */
const store: MockChannelBot[] = structuredClone(getChannelBots())
let seq = 0

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_DELAY))
}

/** 去掉模拟库里的 app_secret，等价于后端返回的 ChannelBot。 */
function toBot(mock: MockChannelBot): ChannelBot {
  const bot: Partial<MockChannelBot> = structuredClone(mock)
  delete bot.app_secret
  return bot as ChannelBot
}

function find(channelId: string): MockChannelBot {
  const bot = store.find((item) => item.channel_id === channelId)
  if (!bot) throw new ApiError('机器人不存在或已删除', 'NOT_FOUND', 404)
  return bot
}

function credentialsValid(bot: MockChannelBot): boolean {
  return !bot.app_secret.startsWith('invalid')
}

/** 渠道能力列表（GET /v1/channels/adapters）。 */
export async function getChannelAdapterList(): Promise<ChannelAdapterInfo[]> {
  return delay(structuredClone(getChannelAdapters()))
}

/** 我的机器人列表（GET /v1/channels/bots）。 */
export async function getChannelBotList(): Promise<ChannelBot[]> {
  return delay(store.map(toBot))
}

/** 绑定机器人（POST /v1/channels/bots）；webhook 模式回吐 webhook_path。 */
export async function createChannelBot(payload: ChannelBotCreateRequest): Promise<ChannelBot> {
  await delay(null)
  if (!payload.app_id.trim() || !payload.app_secret.trim()) {
    throw new ApiError('App ID / App Secret 不能为空', 'BAD_REQUEST', 400)
  }
  if (store.some((bot) => bot.channel_type === payload.channel_type && bot.app_id === payload.app_id)) {
    throw new ApiError('该应用已被绑定，不能重复绑定', 'CONFLICT', 409)
  }
  seq += 1
  const bot: MockChannelBot = {
    channel_id: `ch-${payload.channel_type}-new-${seq}`,
    channel_type: payload.channel_type,
    display_name: (payload.display_name || '我的机器人').trim().slice(0, 100),
    transport: payload.transport,
    app_id: payload.app_id,
    app_secret: payload.app_secret,
    status: 'pending',
    enabled: true,
    group_listen_mode: payload.group_listen_mode ?? 'mention_only',
    last_error: null,
    created_at: new Date().toISOString(),
  }
  store.push(bot)
  const result = toBot(bot)
  if (bot.transport === 'webhook') result.webhook_path = `/v1/channels/${bot.channel_id}/webhook`
  return result
}

/** 更新机器人（PATCH /v1/channels/bots/{id}）：启停 / 名称 / 群聊旁听。 */
export async function updateChannelBot(channelId: string, payload: ChannelBotUpdateRequest): Promise<ChannelBot> {
  await delay(null)
  const bot = find(channelId)
  if (payload.display_name !== undefined) bot.display_name = payload.display_name.trim().slice(0, 100) || bot.display_name
  if (payload.group_listen_mode !== undefined) bot.group_listen_mode = payload.group_listen_mode
  if (payload.enabled !== undefined && payload.enabled !== bot.enabled) {
    bot.enabled = payload.enabled
    if (!bot.enabled) {
      bot.status = 'disconnected'
    } else if (credentialsValid(bot)) {
      bot.status = 'connected'
      bot.last_error = null
    } else {
      bot.status = 'error'
      bot.last_error = 'invalid app_secret'
    }
  }
  return toBot(bot)
}

/** 解绑机器人（DELETE /v1/channels/bots/{id}），同时清除凭据。 */
export async function deleteChannelBot(channelId: string): Promise<void> {
  await delay(null)
  const index = store.findIndex((bot) => bot.channel_id === channelId)
  if (index < 0) throw new ApiError('机器人不存在或已删除', 'NOT_FOUND', 404)
  store.splice(index, 1)
}

/** 测试凭据（POST /v1/channels/bots/{id}/test）；失败时状态写回 error。 */
export async function testChannelBot(channelId: string): Promise<ChannelBotTestResult> {
  await delay(null)
  const bot = find(channelId)
  if (!credentialsValid(bot)) {
    bot.status = 'error'
    bot.last_error = 'invalid app_secret'
    throw new ApiError('凭据校验失败：invalid app_secret', 'CHANNEL_TEST_FAILED', 400)
  }
  bot.last_error = null
  bot.status = bot.enabled ? 'connected' : 'disconnected'
  return { ok: true }
}
