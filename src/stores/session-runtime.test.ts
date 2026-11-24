import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { SseHandlers } from '../interfaces/console/api'
import type { SubAgentRunResponse } from '../interfaces/console/runtime'
import { getActiveTurn, getPendingInteraction, getSessionList, getSessionMessageList, getSessionTasks, sendMessage, subscribeTurn } from '../http/console'
import { getSessionSubAgentRuns } from '../http/session-runtime'
import { useConsoleStore } from './console'

vi.mock('../http/console', async (importOriginal) => ({
  ...await importOriginal<typeof import('../http/console')>(),
  getActiveTurn: vi.fn(), getPendingInteraction: vi.fn(), getSessionList: vi.fn(),
  getSessionMessageList: vi.fn(), getSessionTasks: vi.fn(), sendMessage: vi.fn(), subscribeTurn: vi.fn(),
  getSessionPendingInputList: vi.fn(), getSessionTurnList: vi.fn(),
}))
vi.mock('../http/session-runtime', () => ({ getSessionSubAgentRuns: vi.fn() }))

const session = {
  id: 42, title: '会话', status: 'completed', user_id: 1, workspace_id: 1, agent_id: null,
  visibility: 'private', metadata: {}, created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z', last_active_at: '2026-11-01T00:00:00Z',
}
const message = { id: 7, session_id: 42, turn_id: 'old-turn', role: 'assistant',
  content: '历史回答', token_estimate: 1, created_at: session.created_at }
const runtimeRun: SubAgentRunResponse = {
  id: 21, session_id: 42, member_name: 'explore', status: 'succeeded', prompt: '任务',
  report: '已完成', error_message: null, started_at: session.created_at, finished_at: session.created_at,
  parent_id: 'toolu_01A', turn_id: null, agent_name: 'explore', sub_run_id: 'run-21',
}
function subscription(): SseHandlers { return vi.mocked(subscribeTurn).mock.calls.at(-1)![2] }

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  vi.mocked(getSessionList).mockResolvedValue([session])
  vi.mocked(getSessionMessageList).mockResolvedValue([message])
  vi.mocked(getPendingInteraction).mockResolvedValue(null)
  vi.mocked(getSessionTasks).mockResolvedValue([])
  vi.mocked(getSessionSubAgentRuns).mockResolvedValue([])
  vi.mocked(getActiveTurn).mockResolvedValue(null)
  vi.mocked(sendMessage).mockReturnValue(() => {})
  vi.mocked(subscribeTurn).mockReturnValue(() => {})
})

describe('会话运行的持久化恢复', () => {
  it('恢复运行报告、失败原因和首项选择', async () => {
    vi.mocked(getSessionSubAgentRuns).mockResolvedValue([runtimeRun, { ...runtimeRun, id: 22, sub_run_id: 'run-22', status: 'failed', report: null, error_message: '成员已停用' }])
    const store = useConsoleStore()
    await store.reloadConsole()
    expect(getSessionSubAgentRuns).toHaveBeenCalledWith('42')
    expect(store.state.agents.map((agent) => [agent.id, agent.status])).toEqual([['run-21', 'done'], ['run-22', 'error']])
    expect(store.state.agents[0]?.stream).toEqual([{ kind: 'answer', text: '已完成', streaming: false }])
    expect(store.state.agents[1]?.stream).toEqual([{ kind: 'tool', fn: 'ERROR', body: '成员已停用', done: true, is_error: true }])
    expect(store.state.selectedAgentId).toBe('run-21')
  })

  it('运行查询失败仍恢复历史和当前轮次', async () => {
    vi.mocked(getSessionSubAgentRuns).mockRejectedValue(new Error('暂不可用'))
    const store = useConsoleStore()
    await store.reloadConsole()
    expect(store.state.messages[0]?.blocks?.[0]).toMatchObject({ text: '历史回答' })
    expect(store.state.health).toBe('degraded')
    expect(getActiveTurn).toHaveBeenCalledWith('42')
  })

  it('跨会话切换后忽略迟到的运行列表', async () => {
    vi.mocked(getSessionList).mockResolvedValue([session, { ...session, id: 43 }])
    let resolveRuns!: (runs: SubAgentRunResponse[]) => void
    vi.mocked(getSessionSubAgentRuns).mockImplementationOnce(() => new Promise((resolve) => { resolveRuns = resolve }))
    const store = useConsoleStore()
    const loading = store.reloadConsole()
    await vi.waitFor(() => expect(getSessionSubAgentRuns).toHaveBeenCalledWith('42'))
    store.selectSession('43')
    await vi.waitFor(() => expect(getSessionSubAgentRuns).toHaveBeenCalledWith('43'))
    resolveRuns([runtimeRun])
    await loading
    expect(store.state.activeSessionId).toBe('43')
    expect(store.state.agents).toEqual([])
  })

  it.each(['reset', 'dispatch', 'newSession'] as const)('%s 后忽略旧运行查询', async (action) => {
    let resolveRuns!: (runs: SubAgentRunResponse[]) => void
    vi.mocked(getSessionSubAgentRuns).mockImplementationOnce(() => new Promise((resolve) => { resolveRuns = resolve }))
    const store = useConsoleStore()
    const loading = store.reloadConsole()
    await vi.waitFor(() => expect(getSessionSubAgentRuns).toHaveBeenCalled())
    if (action === 'reset') store.resetConsole()
    else if (action === 'newSession') store.newSession()
    else store.dispatch('新轮次')
    resolveRuns([runtimeRun])
    await loading
    expect(store.state.agents).toEqual([])
  })

  it('当前快照重建时保留其他轮次报告和有效选中项', async () => {
    vi.mocked(getSessionSubAgentRuns).mockResolvedValue([runtimeRun, { ...runtimeRun, id: 22, sub_run_id: 'run-22', status: 'running', report: null }])
    vi.mocked(getActiveTurn).mockResolvedValue({ turn_id: 'current-turn', status: 'running', executing: true, last_event_offset: 4 })
    const store = useConsoleStore()
    await store.reloadConsole()
    await vi.waitFor(() => expect(subscribeTurn).toHaveBeenCalled())
    store.selectAgent('run-21')
    subscription().onEvent({ type: 'run_snapshot', sequence: 4, session_id: 42, turn_id: 'current-turn', state: {
      main: { segment: 0, in_turn: false, blocks: [] },
      sub_runs: [{
        sub_run_id: 'run-22', parent_id: 'toolu_01A', agent_id: null, agent_name: 'explore', task: null,
        in_turn: true, errors: [],
        blocks: [{ index: 0, kind: 'text', text: '当前实时回答', closed: true }],
      }],
    } })
    expect(store.state.agents.map((agent) => agent.id)).toEqual(['run-21', 'run-22'])
    expect(store.state.agents[0]?.stream).toEqual([{ kind: 'answer', text: '已完成', streaming: false }])
    expect(store.state.agents[1]?.stream).toEqual([{ kind: 'answer', text: '当前实时回答', streaming: false }])
    expect(store.state.selectedAgentId).toBe('run-21')
  })

  it('REST 收尾刷新不覆盖实时工具轨迹或用户选择', async () => {
    const store = useConsoleStore()
    await store.reloadConsole()
    store.dispatch('执行')
    const handlers = vi.mocked(sendMessage).mock.calls.at(-1)![1]
    const run = { parent_id: 'toolu_01A', sub_run_id: 'run-21', agent_id: null, agent_name: 'explore' }
    handlers.onEvent({ type: 'subagent_event', sub_type: 'turn_start', sequence: 1, session_id: 42, ...run })
    handlers.onEvent({ type: 'subagent_event', sub_type: 'tool_use', sequence: 2, session_id: 42, ...run, tool: { id: 'tool-1', name: 'Read', input: { path: 'file.txt' } } })
    store.selectAgent('run-21')
    vi.mocked(getSessionSubAgentRuns).mockResolvedValue([runtimeRun, { ...runtimeRun, id: 22, sub_run_id: 'run-22' }])
    handlers.onEvent({ type: 'run_end', sequence: 3, session_id: 42, turn_id: 'current-turn' })
    await vi.waitFor(() => expect(store.state.agents).toHaveLength(2))
    expect(store.state.selectedAgentId).toBe('run-21')
    expect(store.state.agents[0]?.stream[0]).toMatchObject({ kind: 'tool', fn: expect.stringContaining('Read') })
  })
})

describe('已结束轮次的快照恢复', () => {
  it('暂停轮次的 REST 待处理交互与快照按 request_id 去重', async () => {
    const requestPayload = { message: '进入计划模式？' }
    const interaction = { request_id: 'request-1', suspension_id: 'suspension-1', schema_version: 1, kind: 'enter_plan_mode' as const, request_payload: requestPayload }
    vi.mocked(getPendingInteraction).mockResolvedValue({
      suspension: { id: 'suspension-1', session_id: 42, turn_id: 'paused-turn', status: 'pending', version: 1, resolved_at: null, created_at: session.created_at, updated_at: session.created_at },
      requests: [{ id: 'request-1', suspension_id: 'suspension-1', session_id: 42, turn_id: 'paused-turn', tool_call_id: null, tool_use_id: null, schema_version: 1, sequence: 1, status: 'pending', request_payload: requestPayload, response_payload: null, responded_by: null, responded_at: null, created_at: session.created_at, updated_at: session.created_at, kind: 'enter_plan_mode' }],
    })
    vi.mocked(getActiveTurn).mockResolvedValue({ turn_id: 'paused-turn', status: 'awaiting_interaction', executing: false, last_event_offset: 9 })
    const store = useConsoleStore()
    await store.reloadConsole()
    await vi.waitFor(() => expect(subscribeTurn).toHaveBeenCalled())
    subscription().onEvent({ type: 'run_snapshot', sequence: 9, session_id: 42, turn_id: 'paused-turn', state: { main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [], interaction } })
    subscription().onEvent({ type: 'run_end', sequence: 10, session_id: 42, turn_id: 'paused-turn' })
    const cards = store.state.messages.flatMap((item) => item.blocks ?? []).filter((block) => block.kind === 'interaction')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ status: 'pending', interaction: { request_id: 'request-1' } })
  })

  it('终态快照无任务事件时保留 REST 任务', async () => {
    vi.mocked(getSessionTasks).mockResolvedValue([{ id: 18, session_id: 42, subject: '历史任务', description: '', status: 'pending', owner: '', blocked_by: [], created_at: session.created_at, updated_at: session.created_at }])
    vi.mocked(getActiveTurn).mockResolvedValue({ turn_id: 'old-turn', status: 'completed', executing: false, last_event_offset: 9 })
    const store = useConsoleStore()
    await store.reloadConsole()
    await vi.waitFor(() => expect(subscribeTurn).toHaveBeenCalled())
    subscription().onEvent({ type: 'run_snapshot', sequence: 9, session_id: 42, turn_id: 'old-turn', state: { main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [], tasks: null } })
    subscription().onEvent({ type: 'run_end', sequence: 10, session_id: 42, turn_id: 'old-turn' })
    expect(store.state.tasks).toMatchObject([{ id: '18', name: '历史任务', state: 'queued' }])
  })

  it('终态快照查询失败后保留历史，且不重订阅', async () => {
    vi.mocked(getActiveTurn).mockResolvedValue({ turn_id: 'old-turn', status: 'completed', executing: false, last_event_offset: 9 })
    const store = useConsoleStore()
    await store.reloadConsole()
    await vi.waitFor(() => expect(subscribeTurn).toHaveBeenCalled())
    const handlers = subscription()
    handlers.onError?.(new Error('快照不可用'))
    handlers.onDone?.()
    expect(store.state.messages[0]?.blocks?.[0]).toMatchObject({ text: '历史回答' })
    expect(store.state.messages.at(-1)?.blocks).toContainEqual(expect.objectContaining({ kind: 'tool', body: '快照不可用' }))
    expect(store.state.busy).toBe(false)
    expect(store.state.recovering).toBe(false)
    expect(subscribeTurn).toHaveBeenCalledTimes(1)
  })

  it('恢复终态错误和执行图，结束后不循环查询或订阅', async () => {
    vi.mocked(getActiveTurn).mockResolvedValue({ turn_id: 'failed-turn', status: 'failed', executing: false, last_event_offset: 9 })
    const store = useConsoleStore()
    await store.reloadConsole()
    await vi.waitFor(() => expect(subscribeTurn).toHaveBeenCalled())
    expect(store.state.busy).toBe(false)
    const handlers = subscription()
    handlers.onEvent({ type: 'run_snapshot', sequence: 9, session_id: 42, turn_id: 'failed-turn', state: {
      main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [],
      errors: [{ sequence: 8, error: { code: 'WORKFLOW_RUN_FAILED', message: '成员已停用', fatal: true } }],
      workflow: [{ phase: 'member', status: 'failed', agent_id: 6, member_name: '停用成员', member_id: 'member:6', ordinal: 2, total: 2 }],
    } })
    handlers.onEvent({ type: 'run_end', sequence: 10, session_id: 42, turn_id: 'failed-turn' })
    handlers.onDone?.()
    await nextTick()
    expect(store.state.messages.at(-1)?.blocks).toContainEqual(expect.objectContaining({ kind: 'tool', tag: 'ERROR', body: '成员已停用' }))
    expect(store.state.busy).toBe(false)
    expect(store.state.recovering).toBe(false)
    expect(store.state.workflowProgress.members['member:6']).toMatchObject({ status: 'failed', memberName: '停用成员' })
    expect(subscribeTurn).toHaveBeenCalledTimes(1)
    expect(getSessionMessageList).toHaveBeenCalledTimes(1)
    expect(getActiveTurn).toHaveBeenCalledTimes(1)
  })

  it('快照已过期时保留持久历史并删除空恢复消息', async () => {
    vi.mocked(getActiveTurn).mockResolvedValue({ turn_id: 'old-turn', status: 'completed', executing: false, last_event_offset: 9 })
    const store = useConsoleStore()
    await store.reloadConsole()
    await vi.waitFor(() => expect(subscribeTurn).toHaveBeenCalled())
    subscription().onEvent({ type: 'run_end', sequence: 9, session_id: 42, turn_id: 'old-turn' })
    expect(store.state.messages).toHaveLength(1)
    expect(store.state.messages[0]?.blocks?.[0]).toMatchObject({ text: '历史回答' })
    expect(store.state.busy).toBe(false)
  })

  it('终态快照迟到不能覆盖已经发送的新轮次', async () => {
    vi.mocked(getActiveTurn).mockResolvedValue({ turn_id: 'old-turn', status: 'completed', executing: false, last_event_offset: 9 })
    const store = useConsoleStore()
    await store.reloadConsole()
    await vi.waitFor(() => expect(subscribeTurn).toHaveBeenCalled())
    const handlers = subscription()
    expect(store.dispatch('新一轮')).toBe(true)
    handlers.onEvent({ type: 'run_snapshot', sequence: 9, session_id: 42, turn_id: 'old-turn', state: { main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [], errors: [] } })
    handlers.onEvent({ type: 'run_end', sequence: 10, session_id: 42, turn_id: 'old-turn' })
    expect(store.state.messages.some((item) => item.text === '新一轮')).toBe(true)
    expect(store.state.busy).toBe(true)
  })

  it('实时流结束后先对齐历史，再补终态快照且只补一次', async () => {
    const store = useConsoleStore()
    await store.reloadConsole()
    store.dispatch('执行工作流')
    vi.mocked(getActiveTurn).mockResolvedValue({ turn_id: 'current-turn', status: 'failed', executing: false, last_event_offset: 9 })
    vi.mocked(sendMessage).mock.calls.at(-1)![1].onEvent({ type: 'run_end', sequence: 10, session_id: 42, turn_id: 'current-turn' })
    await vi.waitFor(() => expect(subscribeTurn).toHaveBeenCalled())
    const handlers = subscription()
    handlers.onEvent({ type: 'run_snapshot', sequence: 9, session_id: 42, turn_id: 'current-turn', state: {
      main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [],
      errors: [{ error: { code: 'WORKFLOW_RUN_FAILED', message: '成员已停用', fatal: true } }],
    } })
    handlers.onEvent({ type: 'run_end', sequence: 10, session_id: 42, turn_id: 'current-turn' })
    await nextTick()
    expect(store.state.messages.at(-1)?.blocks).toContainEqual(expect.objectContaining({ kind: 'tool', body: '成员已停用' }))
    expect(subscribeTurn).toHaveBeenCalledTimes(1)
    expect(getSessionMessageList).toHaveBeenCalledTimes(2)
  })
})
