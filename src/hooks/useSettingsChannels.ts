import { ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import {
  createChannelBot,
  deleteChannelBot,
  getChannelAdapterList,
  getChannelBotList,
  testChannelBot,
  updateChannelBot,
} from '@/http/settings/channels'
import type { ChannelBotCreateRequest, ChannelBotUpdateRequest } from '@/interfaces/settings/channels/api'
import type {
  ChannelAdapterInfo,
  ChannelBot,
  ChannelCredentialField,
  ChannelTransport,
  ChannelType,
} from '@/interfaces/settings/channels/model'

/** 绑定机器人弹窗的表单模型。 */
export interface ChannelBindForm {
  channelType: ChannelType
  displayName: string
  /** 全部凭据字段都占位为空串；组装请求体时只取当前渠道 credential_fields 里的。 */
  credentials: Record<ChannelCredentialField, string>
  /** 仅飞书可选，其余渠道由能力固定。 */
  transport: ChannelTransport
  /** 飞书 webhook 模式专用。 */
  encryptKey: string
  verificationToken: string
}

export interface ChannelBindIssue {
  /** 与 UFormField 的 name 对应。 */
  name: 'displayName' | ChannelCredentialField
  message: string
}

export const CHANNEL_DISPLAY_NAME_MAX = 100

const DEFAULT_CREDENTIAL_FIELDS: ChannelCredentialField[] = ['app_id', 'app_secret']

/** 渠道要填的凭据字段，按后端 credential_fields 顺序。 */
export function getCredentialFields(adapter?: ChannelAdapterInfo): ChannelCredentialField[] {
  return adapter?.credential_fields.length ? adapter.credential_fields : DEFAULT_CREDENTIAL_FIELDS
}

/** 只有飞书能在长连接 / Webhook 之间选。 */
export function canChooseTransport(channelType: ChannelType): boolean {
  return channelType === 'lark'
}

/** 渠道默认接入方式：支持长连接就用长连接，否则只能 webhook（企业微信）。 */
export function defaultTransport(adapter?: ChannelAdapterInfo): ChannelTransport {
  return adapter && !adapter.supports_long_conn ? 'webhook' : 'long_conn'
}

/** 实际提交的接入方式：飞书取表单选择，其余渠道取能力默认。 */
export function resolveTransport(form: ChannelBindForm, adapter?: ChannelAdapterInfo): ChannelTransport {
  return canChooseTransport(form.channelType) ? form.transport : defaultTransport(adapter)
}

function emptyCredentials(): Record<ChannelCredentialField, string> {
  return { app_id: '', app_secret: '', agent_id: '', token: '', aes_key: '' }
}

export function emptyBindForm(adapter?: ChannelAdapterInfo): ChannelBindForm {
  return {
    channelType: adapter?.channel_type ?? 'lark',
    displayName: '',
    credentials: emptyCredentials(),
    transport: defaultTransport(adapter),
    encryptKey: '',
    verificationToken: '',
  }
}

/** 切换渠道：保留名称，清空已填凭据并重置接入方式。 */
export function switchBindFormChannel(form: ChannelBindForm, adapter: ChannelAdapterInfo): ChannelBindForm {
  return { ...emptyBindForm(adapter), displayName: form.displayName }
}

export function validateBindForm(form: ChannelBindForm): ChannelBindIssue[] {
  const issues: ChannelBindIssue[] = []
  if (form.displayName.trim().length > CHANNEL_DISPLAY_NAME_MAX) {
    issues.push({ name: 'displayName', message: `名称不超过 ${CHANNEL_DISPLAY_NAME_MAX} 个字符` })
  }
  if (!form.credentials.app_id.trim()) issues.push({ name: 'app_id', message: '请填写 App ID' })
  if (!form.credentials.app_secret.trim()) issues.push({ name: 'app_secret', message: '请填写 App Secret' })
  return issues
}

/** 表单 → 绑定请求体：app_id / app_secret 走核心字段，其余凭据（及飞书 webhook 的加密配置）放进 extra。 */
export function bindFormToPayload(form: ChannelBindForm, adapter?: ChannelAdapterInfo): ChannelBotCreateRequest {
  const transport = resolveTransport(form, adapter)
  const extra: Record<string, string> = {}
  for (const field of getCredentialFields(adapter)) {
    if (field === 'app_id' || field === 'app_secret') continue
    const value = form.credentials[field].trim()
    if (value) extra[field] = value
  }
  if (form.channelType === 'lark' && transport === 'webhook') {
    if (form.encryptKey.trim()) extra.encrypt_key = form.encryptKey.trim()
    if (form.verificationToken.trim()) extra.verification_token = form.verificationToken.trim()
  }
  const displayName = form.displayName.trim()
  return {
    channel_type: form.channelType,
    app_id: form.credentials.app_id.trim(),
    app_secret: form.credentials.app_secret.trim(),
    transport,
    ...(displayName ? { display_name: displayName } : {}),
    ...(Object.keys(extra).length ? { extra } : {}),
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export type ChannelBotAction = 'enabled' | 'listen' | 'test' | 'delete'

/** 设置页「消息渠道」：机器人列表、启停 / 旁听 / 测试 / 删除 / 绑定。 */
export function useSettingsChannels() {
  const toast = useToast()
  const adapters = ref<ChannelAdapterInfo[]>([])
  const bots = ref<ChannelBot[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')
  /** 每个机器人正在进行的操作；同一行一次只做一件事。 */
  const busy = ref<Partial<Record<string, ChannelBotAction>>>({})
  const creating = ref(false)
  const createError = ref('')

  function adapterOf(channelType: ChannelType): ChannelAdapterInfo | undefined {
    return adapters.value.find((adapter) => adapter.channel_type === channelType)
  }

  async function refresh() {
    loading.value = true
    try {
      const [nextBots, nextAdapters] = await Promise.all([
        getChannelBotList(),
        adapters.value.length ? Promise.resolve(adapters.value) : getChannelAdapterList(),
      ])
      bots.value = nextBots
      adapters.value = nextAdapters
      error.value = ''
    } catch (err) {
      error.value = errorMessage(err, '加载机器人列表失败')
    } finally {
      loading.value = false
      loaded.value = true
    }
  }

  function replaceBot(next: ChannelBot) {
    bots.value = bots.value.map((bot) => (bot.channel_id === next.channel_id ? next : bot))
  }

  async function runAction(bot: ChannelBot, action: ChannelBotAction, task: () => Promise<void>) {
    if (busy.value[bot.channel_id]) return
    busy.value = { ...busy.value, [bot.channel_id]: action }
    try {
      await task()
    } finally {
      const next = { ...busy.value }
      delete next[bot.channel_id]
      busy.value = next
    }
  }

  /** 乐观更新，失败回滚并提示。 */
  function patchBot(bot: ChannelBot, action: ChannelBotAction, patch: Pick<ChannelBotUpdateRequest, 'enabled' | 'group_listen_mode'>) {
    return runAction(bot, action, async () => {
      const id = bot.channel_id
      const previous = bots.value.find((item) => item.channel_id === id)
      if (previous) replaceBot({ ...previous, ...patch })
      try {
        replaceBot(await updateChannelBot(id, patch))
      } catch (err) {
        if (previous) replaceBot(previous)
        toast.add({ title: '操作失败', description: errorMessage(err, '请稍后重试'), color: 'error', icon: 'i-lucide-circle-alert' })
      }
    })
  }

  function setEnabled(bot: ChannelBot, enabled: boolean) {
    return patchBot(bot, 'enabled', { enabled })
  }

  function setGroupObserve(bot: ChannelBot, observe: boolean) {
    return patchBot(bot, 'listen', { group_listen_mode: observe ? 'observe_all' : 'mention_only' })
  }

  /** 测试凭据；无论成败都刷新列表，让后端写回的 connected / error 及时显示。 */
  function testBot(bot: ChannelBot) {
    return runAction(bot, 'test', async () => {
      try {
        await testChannelBot(bot.channel_id)
        toast.add({ title: '凭据有效', color: 'success' })
      } catch (err) {
        toast.add({ title: '测试失败', description: errorMessage(err, '请检查凭据'), color: 'error', icon: 'i-lucide-circle-alert' })
      }
      await refresh()
    })
  }

  async function removeBot(bot: ChannelBot): Promise<boolean> {
    let removed = false
    await runAction(bot, 'delete', async () => {
      try {
        await deleteChannelBot(bot.channel_id)
        bots.value = bots.value.filter((item) => item.channel_id !== bot.channel_id)
        toast.add({ title: '已删除', color: 'success' })
        removed = true
      } catch (err) {
        toast.add({ title: '删除失败', description: errorMessage(err, '请稍后重试'), color: 'error', icon: 'i-lucide-circle-alert' })
      }
    })
    return removed
  }

  /** 绑定机器人；成功返回新机器人（webhook 模式带 webhook_path），失败写入 createError。 */
  async function createBot(payload: ChannelBotCreateRequest): Promise<ChannelBot | null> {
    if (creating.value) return null
    creating.value = true
    createError.value = ''
    try {
      const bot = await createChannelBot(payload)
      toast.add({ title: '机器人已绑定', color: 'success' })
      bots.value = [...bots.value, bot]
      return bot
    } catch (err) {
      createError.value = errorMessage(err, '绑定失败')
      return null
    } finally {
      creating.value = false
    }
  }

  return {
    adapters,
    bots,
    loading,
    loaded,
    error,
    busy,
    creating,
    createError,
    adapterOf,
    refresh,
    setEnabled,
    setGroupObserve,
    testBot,
    removeBot,
    createBot,
  }
}
