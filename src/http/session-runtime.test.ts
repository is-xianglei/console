import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from './index'
import { getSessionSubAgentRuns } from './session-runtime'

vi.mock('./index', () => ({ request: vi.fn() }))

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
})
