import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  getPendingInteraction,
  getSessionList,
  getSessionMessageList,
  sendMessage,
  shareSession,
} from '../http/console'
import { useConsoleStore } from './console'

vi.mock('../http/console', () => ({
  archiveSession: vi.fn(),
  cancelInteraction: vi.fn(),
  deleteSession: vi.fn(),
  deleteSessionList: vi.fn(),
  getPendingInteraction: vi.fn(),
  getSessionList: vi.fn(),
  getSessionMessageList: vi.fn(),
  respondInteraction: vi.fn(),
  sendMessage: vi.fn(),
  shareSession: vi.fn(),
  updateSession: vi.fn(),
}))

const session = {
  id: 42,
  title: '接口联调',
  status: 'completed',
  model_name: null,
  system_prompt: null,
  user_id: 1,
  workspace_id: 1,
  agent_id: 9,
  visibility: 'private' as const,
  shared_with: [],
  shared_with_departments: [],
  shared_with_groups: [],
  metadata: {},
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  last_active_at: '2026-08-01T00:00:00Z',
}

const message = {
  id: 7,
  session_id: 42,
  role: 'assistant',
  content: [{ type: 'text', text: '历史消息仍然可见' }],
  token_estimate: 8,
  created_at: '2026-08-01T00:00:00Z',
}

describe('console store 会话恢复', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    vi.mocked(getSessionList).mockResolvedValue([session])
    vi.mocked(sendMessage).mockReturnValue(() => {})
  })

  it('待处理交互查询失败时保留已加载的历史', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([message])
    vi.mocked(getPendingInteraction).mockRejectedValue(new Error('暂时不可用'))

    const store = useConsoleStore()
    expect(await store.reloadConsole()).toBe(true)
    expect(store.state.messages[0]?.blocks?.[0]).toMatchObject({
      kind: 'answer',
      text: '历史消息仍然可见',
    })
    expect(store.state.health).toBe('degraded')
  })

  it('恢复字符串形式的助手历史正文', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([{ ...message, content: '字符串历史正文' }])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)

    const store = useConsoleStore()
    expect(await store.reloadConsole()).toBe(true)
    expect(store.state.messages[0]?.blocks?.[0]).toMatchObject({
      kind: 'answer',
      text: '字符串历史正文',
    })
  })

  it('兼容仅包含必填字段的会话响应', async () => {
    vi.mocked(getSessionList).mockResolvedValue([{
      id: 43,
      title: '最小会话',
      status: 'active',
      visibility: 'private',
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
      last_active_at: '2026-08-01T00:00:00Z',
    }])
    vi.mocked(getSessionMessageList).mockResolvedValue([])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)

    const store = useConsoleStore()
    expect(await store.reloadConsole()).toBe(true)
    expect(store.state.sessions[0]).toMatchObject({
      id: '43',
      agentId: null,
      modelName: null,
      visibility: 'private',
      sharedWith: [],
      sharedWithDepartments: [],
      sharedWithGroups: [],
    })
  })

  it('恢复内容块形式的用户历史并忽略无效块', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([{
      ...message,
      role: 'user',
      content: [null, { type: 'text', text: '来自内容块的用户消息' }],
    }])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)

    const store = useConsoleStore()
    expect(await store.reloadConsole()).toBe(true)
    expect(store.state.messages[0]).toMatchObject({
      role: 'user',
      text: '来自内容块的用户消息',
    })
  })

  it('忽略开放内容中类型错误的字段', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([{
      ...message,
      content: [
        { type: 'text', text: { unexpected: true } },
        { type: 'thinking', thinking: 42 },
        { type: 7, text: '错误类型' },
        { type: 'text', text: '有效正文' },
      ],
    }])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)

    const store = useConsoleStore()
    expect(await store.reloadConsole()).toBe(true)
    expect(store.state.messages[0]?.blocks).toEqual([
      { kind: 'answer', text: '有效正文', streaming: false },
    ])
  })

  it('历史查询失败时保留会话列表并标记服务异常', async () => {
    vi.mocked(getSessionMessageList).mockRejectedValue(new Error('暂时不可用'))
    vi.mocked(getPendingInteraction).mockResolvedValue(null)

    const store = useConsoleStore()
    expect(await store.reloadConsole()).toBe(true)
    expect(store.state.sessions).toHaveLength(1)
    expect(store.state.messages).toEqual([])
    expect(store.state.health).toBe('error')
  })

  it('新会话首次发送携带所选 Agent ID', () => {
    const store = useConsoleStore()
    store.resetConsole()
    store.setNewSessionAgent(9)

    expect(store.dispatch('使用设备 Agent 检查告警')).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith(
      { session_id: undefined, agent_id: 9, content: '使用设备 Agent 检查告警' },
      expect.any(Object),
    )
  })

  it('显式传入 null 时使用平台默认 Agent', () => {
    const store = useConsoleStore()
    store.resetConsole()
    store.newSession()
    store.setNewSessionAgent(9)

    expect(store.dispatch('改用默认 Agent', null)).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith(
      { session_id: undefined, content: '改用默认 Agent' },
      expect.any(Object),
    )
    expect(store.state.sessions[0]?.agentId).toBeNull()
  })

  it('已有会话发送消息不会提交新的 Agent ID', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)
    const store = useConsoleStore()

    expect(await store.reloadConsole()).toBe(true)
    expect(store.state.sessions[0]?.agentId).toBe(9)
    expect(store.dispatch('继续当前会话', 12)).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith(
      { session_id: 42, content: '继续当前会话' },
      expect.any(Object),
    )
  })

  it('共享响应省略目标列表时使用本次提交值同步会话', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)
    vi.mocked(shareSession).mockResolvedValue({ session_id: 42, visibility: 'workspace' })
    const store = useConsoleStore()
    await store.reloadConsole()

    expect(await store.shareSession('42', {
      visibility: 'workspace',
      share_with: { users: [2], departments: [3], groups: [4] },
    })).toBe(true)
    expect(store.state.sessions[0]).toMatchObject({
      visibility: 'workspace',
      sharedWith: [2],
      sharedWithDepartments: [3],
      sharedWithGroups: [4],
    })
  })

  it('忽略会话 ID 不匹配的共享响应', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)
    vi.mocked(shareSession).mockResolvedValue({ session_id: 99, visibility: 'public' })
    const store = useConsoleStore()
    await store.reloadConsole()

    expect(await store.shareSession('42', { visibility: 'public' })).toBe(false)
    expect(store.state.sessions[0]?.visibility).toBe('private')
  })

  it('重置后忽略旧数据代次的共享响应', async () => {
    let resolveShare!: (value: { session_id: number; visibility: string }) => void
    vi.mocked(getSessionMessageList).mockResolvedValue([])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)
    vi.mocked(shareSession).mockReturnValue(new Promise((resolve) => { resolveShare = resolve }))
    const store = useConsoleStore()
    await store.reloadConsole()

    const sharing = store.shareSession('42', { visibility: 'public' })
    store.resetConsole()
    resolveShare({ session_id: 42, visibility: 'public' })

    expect(await sharing).toBe(false)
    expect(store.state.sessions).toEqual([])
  })
})
