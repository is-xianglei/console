import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { SseHandlers } from '../interfaces/console/api'
import type { SseEvent } from '../interfaces/console/model'
import type { TeamMemberResponse, TeamNotification } from '../interfaces/console/runtime'
import {
  getSessionTeamActivationList,
  getSessionTeamMemberList,
  getSessionTeamMessageList,
  subscribeTeamActivation,
  subscribeTeamStream,
} from '../http/session-runtime'
import { TEAM_POLL_INTERVAL, useTeamRuntimeStore } from './team-runtime'

vi.mock('../http/session-runtime', () => ({
  getSessionSubAgentRuns: vi.fn(),
  getSessionTeamMemberList: vi.fn(),
  getSessionTeamMessageList: vi.fn(),
  getSessionTeamActivationList: vi.fn(),
  subscribeTeamActivation: vi.fn(),
  subscribeTeamStream: vi.fn(),
}))

function member(overrides: Partial<TeamMemberResponse> = {}): TeamMemberResponse {
  return {
    id: 1, session_id: 42, team_id: 3, name: 'writer', role: '撰写初稿', status: 'idle',
    agent_type: null, agent_id: 9, prompt: null, activation_id: null,
    created_at: '2026-11-15T00:00:00Z', updated_at: '2026-11-15T00:00:00Z',
    ...overrides,
  }
}

/** 队友激活流只有主线：帧不带归属。 */
function mainFrame(type: string, sequence: number, overrides: Partial<SseEvent> = {}): SseEvent {
  return { type, sequence, session_id: 42, ...overrides }
}

/** 记下每次订阅拿到的回调，测试里手动推帧。 */
const streamHandlers: SseHandlers<TeamNotification>[] = []
const activationHandlers = new Map<string, SseHandlers<SseEvent>>()

async function flush() {
  for (let index = 0; index < 5; index += 1) await Promise.resolve()
}

describe('队友运行时', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    vi.useFakeTimers()
    streamHandlers.length = 0
    activationHandlers.clear()
    vi.mocked(getSessionTeamMemberList).mockResolvedValue([])
    vi.mocked(getSessionTeamMessageList).mockResolvedValue([])
    vi.mocked(getSessionTeamActivationList).mockResolvedValue([])
    vi.mocked(subscribeTeamStream).mockImplementation((_sessionId, _after, handlers) => {
      streamHandlers.push(handlers)
      return () => {}
    })
    vi.mocked(subscribeTeamActivation).mockImplementation((_sessionId, activationId, handlers) => {
      activationHandlers.set(activationId, handlers)
      return () => {}
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('普通会话没有成员时不订阅通知流，也不拉消息和激活', async () => {
    const store = useTeamRuntimeStore()
    await store.open('42', { teamSession: false, onLeadTurn: vi.fn() })
    expect(getSessionTeamMemberList).toHaveBeenCalledWith('42')
    expect(getSessionTeamMessageList).not.toHaveBeenCalled()
    expect(subscribeTeamStream).not.toHaveBeenCalled()
    expect(store.hasTeam).toBe(false)
  })

  it('Team 会话打开时拉成员、消息、激活，订阅通知流并订阅运行中的激活', async () => {
    vi.mocked(getSessionTeamMemberList).mockResolvedValue([member({ status: 'working', activation_id: 'a-1' })])
    vi.mocked(getSessionTeamActivationList).mockResolvedValue([{
      id: 'a-1', session_id: 42, member_id: 1, status: 'running', error_message: null,
      created_at: '2026-11-15T00:00:00Z', finished_at: null,
    }])
    const store = useTeamRuntimeStore()
    await store.open('42', { teamSession: true, onLeadTurn: vi.fn() })

    expect(subscribeTeamStream).toHaveBeenCalledWith('42', null, expect.any(Object))
    expect(subscribeTeamActivation).toHaveBeenCalledWith('42', 'a-1', expect.any(Object))
    expect(store.state.panels.map((panel) => panel.id)).toEqual(['writer'])
  })

  it('team_activation 触发激活订阅，快照和增量都写进该成员的面板', async () => {
    vi.mocked(getSessionTeamMemberList).mockResolvedValue([member()])
    const store = useTeamRuntimeStore()
    await store.open('42', { teamSession: true, onLeadTurn: vi.fn() })

    streamHandlers[0]!.onEvent({ type: 'team_activation', session_id: 42, member: 'writer', activation_id: 'a-1', cursor: '1-0' })
    const handlers = activationHandlers.get('a-1')!
    handlers.onEvent({
      type: 'run_snapshot', sequence: 3, session_id: 42, turn_id: 'a-1',
      state: {
        main: { segment: 1, in_turn: true, blocks: [{ index: 0, kind: 'text', text: '初稿第一段', closed: true, sequence: 2 }] },
        sub_runs: [],
        errors: [],
      },
    })
    handlers.onEvent(mainFrame('tool_use', 4, { turn_id: 'a-1', tool: { id: 't-1', name: 'SendMessage', input: { recipient: 'lead' } } }))

    const panel = store.state.panels.find((item) => item.id === 'writer')!
    expect(panel.stream).toMatchObject([
      { kind: 'answer', text: '初稿第一段' },
      { kind: 'tool', fn: 'SendMessage(recipient="lead")' },
    ])
    expect(store.state.panelActivation.writer).toBe('a-1')
  })

  it('同一成员开始新激活时面板换成新激活的输出，旧激活的增量不再写入', async () => {
    vi.mocked(getSessionTeamMemberList).mockResolvedValue([member()])
    const store = useTeamRuntimeStore()
    await store.open('42', { teamSession: true, onLeadTurn: vi.fn() })
    streamHandlers[0]!.onEvent({ type: 'team_activation', session_id: 42, member: 'writer', activation_id: 'a-1' })
    activationHandlers.get('a-1')!.onEvent(mainFrame('block_start', 1, { turn_id: 'a-1', block: { index: 0, block_type: 'text' } }))

    streamHandlers[0]!.onEvent({ type: 'team_activation', session_id: 42, member: 'writer', activation_id: 'a-2' })
    activationHandlers.get('a-1')!.onEvent(mainFrame('text_delta', 2, { turn_id: 'a-1', block: { index: 0 }, text: '旧' }))

    const panel = store.state.panels.find((item) => item.id === 'writer')!
    expect(panel.stream).toEqual([])
    expect(store.state.panelActivation.writer).toBe('a-2')
  })

  it('team_lead_turn 交给控制台订阅', async () => {
    vi.mocked(getSessionTeamMemberList).mockResolvedValue([member()])
    const onLeadTurn = vi.fn()
    const store = useTeamRuntimeStore()
    await store.open('42', { teamSession: true, onLeadTurn })

    streamHandlers[0]!.onEvent({ type: 'team_lead_turn', session_id: 42, turn_id: 'turn-auto', cursor: '2-0' })
    expect(onLeadTurn).toHaveBeenCalledWith('turn-auto')
  })

  it('通知流断开后按最后收到的 cursor 续订，stream_error 同样重连', async () => {
    vi.mocked(getSessionTeamMemberList).mockResolvedValue([member()])
    const store = useTeamRuntimeStore()
    await store.open('42', { teamSession: true, onLeadTurn: vi.fn() })

    streamHandlers[0]!.onEvent({ type: 'team_lead_turn', session_id: 42, turn_id: 'turn-1', cursor: '5-1' })
    streamHandlers[0]!.onError?.(new Error('网络断开'))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(subscribeTeamStream).toHaveBeenLastCalledWith('42', '5-1', expect.any(Object))

    streamHandlers[1]!.onEvent({ type: 'team_activation', session_id: 42, member: 'writer', activation_id: 'a-9', cursor: '6-0' })
    streamHandlers[1]!.onEvent({ type: 'stream_error', message: '事件流读取失败' })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(subscribeTeamStream).toHaveBeenLastCalledWith('42', '6-0', expect.any(Object))
  })

  it('还有成员 working 时每 10 秒兜底刷新，全部空闲后停止', async () => {
    vi.mocked(getSessionTeamMemberList).mockResolvedValue([member({ status: 'working' })])
    const store = useTeamRuntimeStore()
    await store.open('42', { teamSession: true, onLeadTurn: vi.fn() })
    expect(getSessionTeamMemberList).toHaveBeenCalledTimes(1)

    vi.mocked(getSessionTeamMemberList).mockResolvedValue([member({ status: 'idle' })])
    await vi.advanceTimersByTimeAsync(TEAM_POLL_INTERVAL)
    await flush()
    expect(getSessionTeamMemberList).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(TEAM_POLL_INTERVAL * 2)
    expect(getSessionTeamMemberList).toHaveBeenCalledTimes(2)
  })

  it('激活读到 run_end 后刷新成员和消息；关闭会话后清空并忽略迟到的帧', async () => {
    vi.mocked(getSessionTeamMemberList).mockResolvedValue([member()])
    const store = useTeamRuntimeStore()
    await store.open('42', { teamSession: true, onLeadTurn: vi.fn() })
    streamHandlers[0]!.onEvent({ type: 'team_activation', session_id: 42, member: 'writer', activation_id: 'a-1' })
    await vi.advanceTimersByTimeAsync(300)
    const calls = vi.mocked(getSessionTeamMessageList).mock.calls.length

    activationHandlers.get('a-1')!.onEvent({ type: 'run_end', sequence: 9, session_id: 42, turn_id: 'a-1' })
    await vi.advanceTimersByTimeAsync(300)
    expect(vi.mocked(getSessionTeamMessageList).mock.calls.length).toBe(calls + 1)

    store.close()
    const onLeadTurn = vi.fn()
    streamHandlers[0]!.onEvent({ type: 'team_lead_turn', session_id: 42, turn_id: 'late' })
    expect(store.state.members).toEqual([])
    expect(onLeadTurn).not.toHaveBeenCalled()
  })

  it('排队中的激活也订阅；帧按 sequence 去重', async () => {
    vi.mocked(getSessionTeamMemberList).mockResolvedValue([member({ status: 'working', activation_id: 'a-1' })])
    vi.mocked(getSessionTeamActivationList).mockResolvedValue([{
      id: 'a-1', session_id: 42, member_id: 1, status: 'queued', error_message: null,
      created_at: '2026-11-15T00:00:00Z', finished_at: null,
    }])
    const store = useTeamRuntimeStore()
    await store.open('42', { teamSession: true, onLeadTurn: vi.fn() })
    expect(subscribeTeamActivation).toHaveBeenCalledWith('42', 'a-1', expect.any(Object))

    const handlers = activationHandlers.get('a-1')!
    handlers.onEvent({ type: 'run_snapshot', sequence: 0, turn_id: 'a-1', state: { main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [], errors: [] } })
    handlers.onEvent({ type: 'run_started', sequence: 1, session_id: 42, turn_id: 'a-1' })
    handlers.onEvent(mainFrame('block_start', 2, { block: { index: 0, block_type: 'text' } }))
    handlers.onEvent(mainFrame('text_delta', 3, { block: { index: 0 }, text: '初稿' }))
    // 断线重放的旧帧不再写一遍。
    handlers.onEvent(mainFrame('text_delta', 3, { block: { index: 0 }, text: '初稿' }))
    expect(store.state.panels.find((item) => item.id === 'writer')!.stream).toMatchObject([{ kind: 'answer', text: '初稿' }])
  })

  it('激活续跑时按水位丢掉没落库的半截输出', async () => {
    vi.mocked(getSessionTeamMemberList).mockResolvedValue([member()])
    const store = useTeamRuntimeStore()
    await store.open('42', { teamSession: true, onLeadTurn: vi.fn() })
    streamHandlers[0]!.onEvent({ type: 'team_activation', session_id: 42, member: 'writer', activation_id: 'a-1' })
    const handlers = activationHandlers.get('a-1')!
    handlers.onEvent({ type: 'run_started', sequence: 1, session_id: 42, turn_id: 'a-1' })
    handlers.onEvent(mainFrame('block_start', 2, { block: { index: 0, block_type: 'text' } }))
    handlers.onEvent(mainFrame('text_delta', 3, { block: { index: 0 }, text: '已落库' }))
    handlers.onEvent(mainFrame('block_stop', 4, { block: { index: 0 } }))
    handlers.onEvent(mainFrame('block_start', 6, { block: { index: 1, block_type: 'text' } }))
    handlers.onEvent(mainFrame('text_delta', 7, { block: { index: 1 }, text: '半截' }))

    handlers.onEvent({ type: 'run_started', sequence: 65, session_id: 42, turn_id: 'a-1' })
    handlers.onEvent({ type: 'run_resumed', sequence: 66, turn_id: 'a-1', attempt: 2, watermark: 4 })
    handlers.onEvent(mainFrame('block_start', 67, { block: { index: 0, block_type: 'text' } }))
    handlers.onEvent(mainFrame('text_delta', 68, { block: { index: 0 }, text: '续跑' }))

    expect(store.state.panels.find((item) => item.id === 'writer')!.stream).toEqual([
      { kind: 'answer', text: '已落库', streaming: false },
      { kind: 'answer', text: '续跑', streaming: true },
    ])
  })
})
