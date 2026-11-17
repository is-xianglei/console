import { beforeEach, describe, expect, it, vi } from 'vitest'
import { streamGet } from './console'
import { request } from './index'
import {
  getSessionSubAgentRuns,
  getSessionTeamActivationList,
  getSessionTeamMemberList,
  getSessionTeamMessageList,
  subscribeTeamActivation,
  subscribeTeamStream,
} from './session-runtime'

vi.mock('./index', async (importOriginal) => ({ ...(await importOriginal<typeof import('./index')>()), request: vi.fn() }))
vi.mock('./console', () => ({ streamGet: vi.fn(() => () => {}) }))

describe('会话运行 REST 契约', () => {
  beforeEach(() => vi.resetAllMocks())

  it('按 AgentOS 的 session_id 查询参数读取运行列表', async () => {
    const runs = [{ id: 21, session_id: 42, member_name: 'explore', status: 'succeeded' }]
    vi.mocked(request).mockResolvedValue(runs)
    await expect(getSessionSubAgentRuns(42)).resolves.toBe(runs)
    expect(request).toHaveBeenCalledExactlyOnceWith('/teams/subagent-runs?session_id=42')
  })

  it('正确编码查询值并保留 HTTP 失败供独立降级', async () => {
    const error = new Error('无权读取会话')
    vi.mocked(request).mockRejectedValue(error)
    await expect(getSessionSubAgentRuns('42&other=1')).rejects.toBe(error)
    expect(request).toHaveBeenCalledWith('/teams/subagent-runs?session_id=42%26other%3D1')
  })

  it('成员、团队消息、激活都按 session_id 查询，激活可带 limit', async () => {
    vi.mocked(request).mockResolvedValue([])
    await getSessionTeamMemberList(7)
    await getSessionTeamMessageList(7)
    await getSessionTeamActivationList(7)
    await getSessionTeamActivationList(7, 20)
    expect(vi.mocked(request).mock.calls.map((call) => call[0])).toEqual([
      '/teams/members?session_id=7',
      '/teams/messages?session_id=7',
      '/teams/activations?session_id=7',
      '/teams/activations?session_id=7&limit=20',
    ])
  })

  it('激活订阅和团队通知流走 GET 订阅，通知流带 after 续订', () => {
    const handlers = { onEvent: vi.fn() }
    subscribeTeamActivation(7, 'a-1', handlers)
    subscribeTeamStream(7, null, handlers)
    subscribeTeamStream(7, '1700-0', handlers)
    expect(vi.mocked(streamGet).mock.calls.map((call) => call[0])).toEqual([
      '/teams/activations/a-1/subscription?session_id=7',
      '/teams/stream?session_id=7',
      '/teams/stream?session_id=7&after=1700-0',
    ])
  })
})
