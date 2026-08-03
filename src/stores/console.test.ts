import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  getPendingInteraction,
  getSessionList,
  getSessionMessageList,
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

  it('历史查询失败时保留会话列表并标记服务异常', async () => {
    vi.mocked(getSessionMessageList).mockRejectedValue(new Error('暂时不可用'))
    vi.mocked(getPendingInteraction).mockResolvedValue(null)

    const store = useConsoleStore()
    expect(await store.reloadConsole()).toBe(true)
    expect(store.state.sessions).toHaveLength(1)
    expect(store.state.messages).toEqual([])
    expect(store.state.health).toBe('error')
  })
})
