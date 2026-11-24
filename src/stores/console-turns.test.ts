import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { SseHandlers } from '../interfaces/console/api'
import type { SessionMessageResponse, SseEvent } from '../interfaces/console/model'
import {
  cancelInteraction,
  cancelTurn,
  getActiveTurn,
  getPendingInteraction,
  getSessionList,
  getSessionMessageList,
  getSessionPendingInputList,
  getSessionTasks,
  getSessionTurnList,
  respondInteraction,
  sendMessage,
  SseOpenError,
  subscribeTurn,
} from '../http/console'
import { ApiError } from '../http/index'
import { getSessionSubAgentRuns } from '../http/session-runtime'
import { useConsoleStore } from './console'

/**
 * 持久化执行重构后的发言与停止：按 frontend-contract 第 3～8 节的示例帧驱动 store。
 * 会话 101，回合 ID 用 a0、a1、b2 这类短值代替文档里的 UUID。
 */

vi.mock('../http/session-runtime', () => ({
  getSessionSubAgentRuns: vi.fn(),
  getSessionTeamMemberList: vi.fn(async () => []),
  getSessionTeamMessageList: vi.fn(async () => []),
  getSessionTeamActivationList: vi.fn(async () => []),
  subscribeTeamActivation: vi.fn(() => () => {}),
  subscribeTeamStream: vi.fn(() => () => {}),
}))

vi.mock('../http/console', async (importOriginal) => ({
  ...await importOriginal<typeof import('../http/console')>(),
  cancelInteraction: vi.fn(),
  cancelTurn: vi.fn(),
  getActiveTurn: vi.fn(),
  getPendingInteraction: vi.fn(),
  getSessionList: vi.fn(),
  getSessionMessageList: vi.fn(),
  getSessionPendingInputList: vi.fn(),
  getSessionTasks: vi.fn(),
  getSessionTurnList: vi.fn(),
  respondInteraction: vi.fn(),
  sendMessage: vi.fn(),
  subscribeTurn: vi.fn(),
}))

const created = '2026-11-19T08:00:00Z'
const session = {
  id: 101, title: '团队', status: 'running', user_id: 1, workspace_id: 1, agent_id: null,
  visibility: 'private', metadata: {}, created_at: created, updated_at: created, last_active_at: created,
}

function message(overrides: Partial<SessionMessageResponse>): SessionMessageResponse {
  return {
    id: 1, session_id: 101, turn_id: 'a1', role: 'user', content: '', token_estimate: 12, created_at: created,
    stream_offset: null, in_flight: false, input_ids: [], ...overrides,
  }
}

const startMessage = message({ id: 1, content: '北京天气怎么样', input_ids: [6], in_flight: true })

function lastSubscription(): SseHandlers {
  return vi.mocked(subscribeTurn).mock.calls.at(-1)![2]
}

function lastSend(): SseHandlers {
  return vi.mocked(sendMessage).mock.calls.at(-1)![1]
}

function textBlock(index: number, sequence: number, text: string): SseEvent[] {
  return [
    { type: 'block_start', session_id: 101, sequence, block: { index, block_type: 'text' } },
    { type: 'text_delta', session_id: 101, sequence: sequence + 1, block: { index }, text },
    { type: 'block_stop', session_id: 101, sequence: sequence + 2, block: { index } },
  ]
}

function emit(handlers: SseHandlers, frames: SseEvent[]) {
  for (const frame of frames) handlers.onEvent(frame)
}

/** 对话区按顺序摘要：user 气泡带排队标记，回复只取正文。 */
function timeline(store: ReturnType<typeof useConsoleStore>): string[] {
  return store.state.messages.flatMap((item) => {
    if (item.role === 'user') return [`${item.queued ? '排队:' : '用户:'}${item.text}`]
    const texts = (item.blocks ?? []).flatMap((block) => {
      if (block.kind === 'answer') return [block.text]
      if (block.kind === 'attention') return ['[需要人工处理]']
      if (block.kind === 'interaction') return [`[交互:${block.status}]`]
      return []
    })
    return texts.length ? [`回复:${texts.join('|')}`] : []
  })
}

/** 打开会话 101 并跟上 active-turn 给出的回合。 */
async function openSession(active: { turn_id: string; status: string; executing: boolean } | null) {
  vi.mocked(getActiveTurn).mockResolvedValue(active ? { ...active, last_event_offset: 0 } : null)
  const store = useConsoleStore()
  expect(await store.reloadConsole()).toBe(true)
  if (active) await vi.waitFor(() => expect(subscribeTurn).toHaveBeenCalled())
  return store
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  vi.mocked(getSessionList).mockResolvedValue([session])
  vi.mocked(getSessionMessageList).mockResolvedValue([startMessage])
  vi.mocked(getPendingInteraction).mockResolvedValue(null)
  vi.mocked(getSessionTasks).mockResolvedValue([])
  vi.mocked(getSessionSubAgentRuns).mockResolvedValue([])
  vi.mocked(getSessionPendingInputList).mockResolvedValue([])
  vi.mocked(getSessionTurnList).mockResolvedValue([])
  vi.mocked(sendMessage).mockReturnValue(() => {})
  vi.mocked(subscribeTurn).mockReturnValue(() => {})
})

describe('运行中发言', () => {
  it('执行中可以发送：排队中 → 被认领 → 同一回合接着回答', async () => {
    const store = await openSession({ turn_id: 'a1', status: 'running', executing: true })
    const abortFollow = vi.fn()
    vi.mocked(subscribeTurn).mockReturnValue(abortFollow)
    emit(lastSubscription(), [
      { type: 'run_snapshot', turn_id: 'a1', state: { status: 'running', last_offset: 3, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 3 },
      ...textBlock(0, 4, '我先查一下。'),
    ])
    expect(store.state.busy).toBe(true)

    expect(store.dispatch('那上海呢')).toBe(true)
    expect(sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({ session_id: 101, content: '那上海呢' }), expect.any(Object))
    expect(timeline(store)).toEqual(['用户:北京天气怎么样', '回复:我先查一下。', '排队:那上海呢'])

    const handlers = lastSend()
    emit(handlers, [
      { type: 'input_queued', session_id: 101, turn_id: 'a1', input_id: 7 },
      { type: 'run_snapshot', turn_id: 'a1', state: {
        status: 'running', last_offset: 6,
        main: { segment: 1, in_turn: true, blocks: [{ index: 0, kind: 'text', text: '我先查一下。', closed: true, sequence: 4 }] },
      }, sequence: 6 },
    ])
    expect(timeline(store)).toEqual(['用户:北京天气怎么样', '回复:我先查一下。', '排队:那上海呢'])

    emit(handlers, [
      { type: 'input_claimed', data: { session_id: 101, turn_id: 'a1', message_id: 502, input_ids: [7] }, sequence: 71 },
      ...textBlock(1, 72, '上海也是晴。'),
    ])
    expect(timeline(store)).toEqual(['用户:北京天气怎么样', '回复:我先查一下。', '用户:那上海呢', '回复:上海也是晴。'])
    expect(store.state.messages[2]).toMatchObject({ messageId: 502, inputIds: [7], streamOffset: 71, turnId: 'a1' })

    vi.mocked(getSessionMessageList).mockResolvedValue([])
    handlers.onEvent({ type: 'run_end', turn_id: 'a1', status: 'completed', sequence: 90 })
    expect(store.state.busy).toBe(false)
    expect(store.hasOpenTurn()).toBe(false)
  })

  it('越过最后一个轮次边界：run_end 后紧跟 run_switched，由后继回合回答', async () => {
    const store = await openSession({ turn_id: 'a1', status: 'running', executing: true })
    emit(lastSubscription(), [
      { type: 'run_snapshot', turn_id: 'a1', state: { status: 'running', last_offset: 3, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 3 },
      ...textBlock(0, 4, '北京今天晴。'),
    ])
    store.dispatch('那上海呢')
    const handlers = lastSend()
    // 文档第 3 节 run_switched 示例，原样逐帧回放。
    emit(handlers, [
      { type: 'input_queued', session_id: 101, turn_id: 'a1', input_id: 7 },
      { type: 'run_snapshot', turn_id: 'a1', state: {
        status: 'running', last_offset: 4,
        main: { segment: 1, in_turn: true, blocks: [{ index: 0, kind: 'text', text: '北京今天晴。', closed: true, sequence: 4 }] },
      }, sequence: 4 },
      { type: 'turn_end', session_id: 101, sequence: 5, stop_reason: 'end_turn' },
      { type: 'run_end', turn_id: 'a1', status: 'completed', sequence: 65 },
    ])
    expect(timeline(store)).toEqual(['用户:北京天气怎么样', '回复:北京今天晴。', '排队:那上海呢'])

    emit(handlers, [
      { type: 'run_switched', session_id: 101, turn_id: 'b2', input_id: 7, previous_turn_id: 'a1' },
      { type: 'run_snapshot', turn_id: 'b2', state: { turn_id: null, session_id: null, status: null, cancelled: false, execution_start_offset: 0, run_end: null, last_offset: 0, truncated: false, session: null, tasks: null, interaction: null, workflow: [], errors: [], main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 0 },
      { type: 'run_started', turn_id: 'b2', session_id: 101, sequence: 1 },
      { type: 'session_ready', data: { session_id: 101, title: '团队', status: 'running' }, sequence: 2 },
      { type: 'task_snapshot', data: { session_id: 101, tasks: [], reason: 'baseline' }, sequence: 3 },
      { type: 'turn_start', session_id: 101, sequence: 4 },
      ...textBlock(0, 5, '上海也是晴。'),
    ])
    expect(store.state.activeTurnId).toBe('b2')
    expect(store.state.busy).toBe(true)
    expect(timeline(store)).toEqual(['用户:北京天气怎么样', '回复:北京今天晴。', '用户:那上海呢', '回复:上海也是晴。'])
    expect(store.state.messages[2]?.turnId).toBe('b2')

    handlers.onEvent({ type: 'run_end', turn_id: 'b2', status: 'completed', sequence: 65 })
    expect(store.state.busy).toBe(false)
  })

  it('等待审批时发言排队、不代替审批；流在 run_end(awaiting_interaction) 后结束', async () => {
    const store = await openSession({ turn_id: 'a1', status: 'awaiting_interaction', executing: false })
    const interaction = {
      request_id: 'req-1', suspension_id: 'sus-1', schema_version: 1, kind: 'enter_plan_mode' as const,
      request_payload: { message: '进入规划模式？' },
    }
    emit(lastSubscription(), [
      { type: 'run_snapshot', turn_id: 'a1', state: { status: 'awaiting_interaction', last_offset: 9, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [], interaction }, sequence: 9 },
      { type: 'run_end', turn_id: 'a1', status: 'awaiting_interaction', sequence: 10 },
    ])
    expect(store.state.busy).toBe(false)
    expect(store.hasOpenTurn()).toBe(true)

    vi.mocked(getSessionPendingInputList).mockResolvedValue([
      { input_id: 7, client_input_id: 'c-7', session_id: 101, turn_id: 'a1', content: '顺便把 dist 也删了', created_at: created },
    ])
    vi.mocked(getActiveTurn).mockResolvedValue({ turn_id: 'a1', status: 'awaiting_interaction', executing: false, last_event_offset: 10 })
    vi.mocked(getPendingInteraction).mockResolvedValue({
      suspension: { id: 'sus-1', session_id: 101, turn_id: 'a1', status: 'pending', version: 1, resolved_at: null, created_at: created, updated_at: created },
      requests: [{ id: 'req-1', suspension_id: 'sus-1', session_id: 101, turn_id: 'a1', tool_call_id: null, tool_use_id: null, schema_version: 1, sequence: 9, status: 'pending', request_payload: interaction.request_payload, response_payload: null, responded_by: null, responded_at: null, created_at: created, updated_at: created, kind: 'enter_plan_mode' }],
    })
    expect(store.dispatch('顺便把 dist 也删了')).toBe(true)
    const handlers = lastSend()
    emit(handlers, [
      { type: 'input_queued', session_id: 101, turn_id: 'a1', input_id: 7 },
      { type: 'run_snapshot', turn_id: 'a1', state: { status: 'awaiting_interaction', last_offset: 10, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [], interaction }, sequence: 10 },
      { type: 'run_end', turn_id: 'a1', status: 'awaiting_interaction', sequence: 10 },
    ])
    handlers.onDone?.()
    // 收尾后重拉历史：排队发言从 pending-inputs 还原，交互卡仍可操作。
    await vi.waitFor(() => expect(timeline(store)).toEqual(['用户:北京天气怎么样', '回复:[交互:pending]', '排队:顺便把 dist 也删了']))
    expect(store.hasOpenTurn()).toBe(true)
  })

  it('回合 queued 时可以发送；订阅 queued 回合先收到 sequence 为 0 的空快照', async () => {
    const store = await openSession({ turn_id: 'b2', status: 'queued', executing: false })
    expect(store.state.busy).toBe(true)
    lastSubscription().onEvent({ type: 'run_snapshot', turn_id: 'b2', state: { turn_id: null, status: null, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 0 })
    expect(store.state.activeTurnId).toBe('b2')
    expect(store.dispatch('再补一句')).toBe(true)
    expect(store.state.messages.at(-1)).toMatchObject({ text: '再补一句', queued: true })
  })

  it('发言被拒（409 准入冲突）时展示后端原因，不重试，再接上原来的回合', async () => {
    const store = await openSession({ turn_id: 'a1', status: 'running', executing: true })
    store.dispatch('那上海呢')
    vi.mocked(getActiveTurn).mockResolvedValue({ turn_id: 'a1', status: 'running', executing: true, last_event_offset: 4 })
    lastSend().onError?.(new SseOpenError('会话回合准入冲突，请稍后重试', 'HTTP_ERROR', 409))
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(store.state.messages.flatMap((item) => item.blocks ?? [])).toContainEqual(expect.objectContaining({
      tag: 'ERROR', body: '会话回合准入冲突，请稍后重试',
    }))
    await vi.waitFor(() => expect(subscribeTurn).toHaveBeenCalledTimes(2))
    expect(subscribeTurn).toHaveBeenLastCalledWith(101, 'a1', expect.any(Object))
  })

  it('503 提示稍后重试，失败的发言可以原样重发', async () => {
    const store = await openSession(null)
    expect(store.dispatch('北京天气')).toBe(true)
    lastSend().onError?.(new SseOpenError('数据库繁忙：等待数据锁超时，请稍后重试', 'HTTP_ERROR', 503, { reason: 'lock_timeout' }))
    const failed = store.state.messages.find((item) => item.text === '北京天气')!
    expect(failed.retryable).toBe(true)
    expect(store.state.busy).toBe(false)
    const shown = store.state.messages.flatMap((item) => item.blocks ?? [])
    expect(shown).toContainEqual(expect.objectContaining({ tag: 'ERROR', body: '数据库繁忙：等待数据锁超时，请稍后重试' }))
    expect(JSON.stringify(shown)).not.toContain('lock_timeout')

    expect(store.resendMessage(failed.id)).toBe(true)
    expect(sendMessage).toHaveBeenCalledTimes(2)
    // 原样重发：请求体不变，带同一个 client_input_id。
    expect(vi.mocked(sendMessage).mock.calls[0]![0].client_input_id).toEqual(expect.any(String))
    expect(vi.mocked(sendMessage).mock.calls[1]![0]).toEqual(vi.mocked(sendMessage).mock.calls[0]![0])
    expect(timeline(store)).toEqual(['用户:北京天气怎么样', '用户:北京天气'])
    expect(store.state.messages.flatMap((item) => item.blocks ?? []).some((block) => block.kind === 'tool' && block.tag === 'ERROR')).toBe(false)
  })
})

describe('停止', () => {
  it('执行中且有排队发言：停止后发言接口的流自己切到后继回合', async () => {
    const store = await openSession({ turn_id: 'a1', status: 'running', executing: true })
    store.dispatch('那上海呢')
    const abortSend = vi.fn()
    const handlers = lastSend()
    vi.mocked(sendMessage).mockReturnValue(abortSend)
    emit(handlers, [
      { type: 'input_queued', session_id: 101, turn_id: 'a1', input_id: 7 },
      { type: 'run_snapshot', turn_id: 'a1', state: { status: 'running', last_offset: 3, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 3 },
    ])
    vi.mocked(cancelTurn).mockResolvedValue({ turn_id: 'a1', status: 'interrupted', session_status: 'running', successor_turn_id: 'b2' })
    expect(await store.cancelActiveTurn()).toEqual({ ok: true })
    expect(cancelTurn).toHaveBeenCalledWith(101, 'a1')

    emit(handlers, [
      { type: 'run_end', turn_id: 'a1', status: 'interrupted', cancelled: true, sequence: 9 },
      { type: 'run_switched', session_id: 101, turn_id: 'b2', input_id: 7, previous_turn_id: 'a1' },
      { type: 'run_snapshot', turn_id: 'b2', state: { turn_id: null, status: null, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 0 },
      { type: 'run_started', turn_id: 'b2', session_id: 101, sequence: 1 },
      ...textBlock(0, 4, '上海晴。'),
    ])
    expect(store.state.activeTurnId).toBe('b2')
    expect(timeline(store)).toEqual(['用户:北京天气怎么样', '用户:那上海呢', '回复:上海晴。'])
    expect(abortSend).not.toHaveBeenCalled()
    expect(subscribeTurn).not.toHaveBeenCalledWith(101, 'b2', expect.any(Object))
  })

  it('停止后直接订阅 successor_turn_id，不再查 active-turn', async () => {
    const abortFollow = vi.fn()
    vi.mocked(subscribeTurn).mockReturnValueOnce(abortFollow)
    const store = await openSession({ turn_id: 'a1', status: 'running', executing: true })
    lastSubscription().onEvent({ type: 'run_snapshot', turn_id: 'a1', state: { status: 'running', last_offset: 3, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 3 })
    expect(getActiveTurn).toHaveBeenCalledTimes(1)
    // 刷新后，接手排队发言的后继回合已在列表里有起始发言。
    vi.mocked(getSessionMessageList).mockResolvedValue([
      startMessage,
      message({ id: 2, turn_id: 'b2', content: '那上海呢', input_ids: [7], client_input_ids: ['c-7'] }),
    ])
    vi.mocked(cancelTurn).mockResolvedValue({ turn_id: 'a1', status: 'interrupted', session_status: 'running', successor_turn_id: 'b2' })

    expect(await store.cancelActiveTurn()).toEqual({ ok: true })
    expect(abortFollow).toHaveBeenCalled()
    expect(subscribeTurn).toHaveBeenLastCalledWith(101, 'b2', expect.any(Object))
    expect(getActiveTurn).toHaveBeenCalledTimes(1)
    expect(store.state.activeTurnId).toBe('b2')
    expect(store.state.busy).toBe(true)

    emit(lastSubscription(), [
      { type: 'run_snapshot', turn_id: 'b2', state: { turn_id: null, status: null, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 0 },
      { type: 'run_started', turn_id: 'b2', session_id: 101, sequence: 1 },
      ...textBlock(0, 4, '上海晴。'),
    ])
    expect(timeline(store)).toEqual(['用户:北京天气怎么样', '用户:那上海呢', '回复:上海晴。'])
  })

  it('queued 回合：停止后流里只有一帧 run_end(interrupted, cancelled)', async () => {
    const store = await openSession({ turn_id: 'b2', status: 'queued', executing: false })
    const handlers = lastSubscription()
    handlers.onEvent({ type: 'run_snapshot', turn_id: 'b2', state: { status: null, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 0 })
    vi.mocked(cancelTurn).mockResolvedValue({ turn_id: 'b2', status: 'interrupted', session_status: 'idle', successor_turn_id: null })
    vi.mocked(getActiveTurn).mockResolvedValue({ turn_id: 'b2', status: 'interrupted', executing: false, last_event_offset: 1 })

    expect(await store.cancelActiveTurn()).toEqual({ ok: true })
    expect(cancelTurn).toHaveBeenCalledWith(101, 'b2')
    expect(store.state.busy).toBe(false)
    expect(store.hasOpenTurn()).toBe(false)
    // successor_turn_id 为 null：没有后继回合，不再查 active-turn，也不再订阅。
    expect(getActiveTurn).toHaveBeenCalledTimes(1)
    expect(subscribeTurn).toHaveBeenCalledTimes(1)
    // 旧流的迟到帧不再处理。
    handlers.onEvent({ type: 'run_end', turn_id: 'b2', status: 'interrupted', cancelled: true, sequence: 1 })
    expect(store.hasOpenTurn()).toBe(false)
  })

  it('执行中断、等待续跑（running、executing: false）也能停', async () => {
    const store = await openSession({ turn_id: 'a1', status: 'running', executing: false })
    expect(store.hasOpenTurn()).toBe(true)
    vi.mocked(cancelTurn).mockResolvedValue({ turn_id: 'a1', status: 'interrupted', session_status: 'idle', successor_turn_id: null })
    expect(await store.cancelActiveTurn()).toEqual({ ok: true })
    expect(cancelTurn).toHaveBeenCalledWith(101, 'a1')
  })

  it('等待审批：不在跟随流也能停，待处理的交互卡收尾', async () => {
    const interaction = {
      request_id: 'req-1', suspension_id: 'sus-1', schema_version: 1, kind: 'enter_plan_mode' as const,
      request_payload: { message: '进入规划模式？' },
    }
    const store = await openSession({ turn_id: 'a1', status: 'awaiting_interaction', executing: false })
    emit(lastSubscription(), [
      { type: 'run_snapshot', turn_id: 'a1', state: { status: 'awaiting_interaction', last_offset: 9, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [], interaction }, sequence: 9 },
      { type: 'run_end', turn_id: 'a1', status: 'awaiting_interaction', sequence: 10 },
    ])
    vi.mocked(cancelTurn).mockResolvedValue({ turn_id: 'a1', status: 'interrupted', session_status: 'idle', successor_turn_id: null })
    vi.mocked(getActiveTurn).mockResolvedValue({ turn_id: 'a1', status: 'interrupted', executing: false, last_event_offset: 13 })
    expect(await store.cancelActiveTurn()).toEqual({ ok: true })
    expect(cancelTurn).toHaveBeenCalledWith(101, 'a1')
    expect(store.hasOpenTurn()).toBe(false)
  })

  it('跟随中的流收到停掉等待审批的三帧：交互卡收尾，回合不再算没结束', async () => {
    const interaction = {
      request_id: 'req-1', suspension_id: 'sus-1', schema_version: 1, kind: 'enter_plan_mode' as const,
      request_payload: { message: '进入规划模式？' },
    }
    const store = await openSession({ turn_id: 'c3', status: 'running', executing: true })
    const handlers = lastSubscription()
    emit(handlers, [
      { type: 'run_snapshot', turn_id: 'c3', state: { status: 'running', last_offset: 60, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 60 },
      { type: 'interaction_request', session_id: 101, sequence: 61, interaction },
      { type: 'session_ready', data: { session_id: 101, title: '团队', status: 'idle' }, sequence: 66 },
      { type: 'turn_end', session_id: 101, sequence: 67, stop_reason: 'user_cancelled' },
    ])
    expect(timeline(store)).toContain('回复:[交互:cancelled]')
    handlers.onEvent({ type: 'run_end', turn_id: 'c3', status: 'interrupted', cancelled: true, sequence: 68 })
    expect(store.hasOpenTurn()).toBe(false)
    expect(store.state.sessions[0]?.status).toBe('idle')
  })

  it('回合已经结束时停止返回 409，原因直接展示', async () => {
    const store = await openSession({ turn_id: 'a1', status: 'running', executing: true })
    vi.mocked(cancelTurn).mockRejectedValue(new ApiError('该轮次没有执行中的任务', 'HTTP_ERROR', 409))
    expect(await store.cancelActiveTurn()).toEqual({ ok: false, message: '该轮次没有执行中的任务' })
  })
})

describe('人工交互', () => {
  const interaction = {
    request_id: 'req-1', suspension_id: 'sus-1', schema_version: 1, kind: 'enter_plan_mode' as const,
    request_payload: { message: '进入规划模式？' },
  }

  async function awaiting() {
    const store = await openSession({ turn_id: 'a1', status: 'awaiting_interaction', executing: false })
    emit(lastSubscription(), [
      { type: 'run_snapshot', turn_id: 'a1', state: { status: 'awaiting_interaction', last_offset: 9, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [], interaction }, sequence: 9 },
      { type: 'run_end', turn_id: 'a1', status: 'awaiting_interaction', sequence: 10 },
    ])
    return store
  }

  it('决定接口只记下决定，流跟随下一次执行，回复接在同一回合', async () => {
    const store = await awaiting()
    vi.mocked(respondInteraction).mockReturnValue(() => {})
    store.respondInteraction('req-1', { kind: 'enter_plan_mode', response_payload: { decision: 'approve' } }, '已进入规划模式')
    const handlers = vi.mocked(respondInteraction).mock.calls.at(-1)![3]
    emit(handlers, [
      { type: 'run_started', turn_id: 'a1', session_id: 101, sequence: 11 },
      { type: 'session_ready', data: { session_id: 101, title: '团队', status: 'running' }, sequence: 12 },
      ...textBlock(0, 14, '开始规划。'),
    ])
    expect(store.state.activeTurnId).toBe('a1')
    expect(timeline(store)).toEqual(['用户:北京天气怎么样', '回复:[交互:resolved]', '回复:开始规划。'])
  })

  it.each([
    ['人工交互已经取消，不能再提交决定', { request_status: 'cancelled' }],
    ['人工交互已经失效，不能再提交决定', { request_status: 'expired' }],
  ])('决定被拒 409：卡片显示「%s」', async (reason, details) => {
    const store = await awaiting()
    vi.mocked(respondInteraction).mockReturnValue(() => {})
    store.respondInteraction('req-1', { kind: 'enter_plan_mode', response_payload: { decision: 'approve' } }, '已进入规划模式')
    vi.mocked(respondInteraction).mock.calls.at(-1)![3].onError?.(new SseOpenError(reason, 'HTTP_ERROR', 409, details))
    const card = store.state.messages.flatMap((item) => item.blocks ?? []).find((block) => block.kind === 'interaction')
    expect(card).toMatchObject({ status: 'cancelled', responseLabel: reason })
    expect(store.state.busy).toBe(false)
  })

  it('暂停点取消带回后继回合时直接订阅它', async () => {
    const store = await awaiting()
    vi.mocked(cancelInteraction).mockResolvedValue({
      id: 'sus-1', session_id: 101, turn_id: 'a1', status: 'cancelled', version: 2, resolved_at: created,
      created_at: created, updated_at: created, session_status: 'running', successor_turn_id: 'b2',
    })
    const activeTurnCalls = vi.mocked(getActiveTurn).mock.calls.length
    expect(await store.cancelInteraction('req-1', 'sus-1')).toEqual({ ok: true })
    expect(subscribeTurn).toHaveBeenLastCalledWith(101, 'b2', expect.any(Object))
    expect(getActiveTurn).toHaveBeenCalledTimes(activeTurnCalls)
    expect(store.state.activeTurnId).toBe('b2')
  })

  it('暂停点取消没有后继回合时不再订阅', async () => {
    const store = await awaiting()
    vi.mocked(cancelInteraction).mockResolvedValue({
      id: 'sus-1', session_id: 101, turn_id: 'a1', status: 'cancelled', version: 2, resolved_at: created,
      created_at: created, updated_at: created, session_status: 'idle', successor_turn_id: null,
    })
    expect(await store.cancelInteraction('req-1', 'sus-1')).toEqual({ ok: true })
    expect(subscribeTurn).toHaveBeenCalledTimes(1)
    expect(store.hasOpenTurn()).toBe(false)
  })

  it('暂停点取消被拒 409 时返回后端原因', async () => {
    const store = await awaiting()
    const reason = '人工交互已经决定，不能再取消；要停止本轮执行，请使用轮次取消接口'
    vi.mocked(cancelInteraction).mockRejectedValue(new ApiError(reason, 'HTTP_ERROR', 409))
    expect(await store.cancelInteraction('req-1', 'sus-1')).toEqual({ ok: false, message: reason })
  })
})

describe('续跑与需要人工处理', () => {
  it('run_resumed 丢掉半截内容后接着渲染，并按覆盖处理再次到来的 session_ready', async () => {
    const store = await openSession({ turn_id: 'd4', status: 'running', executing: true })
    const handlers = lastSubscription()
    emit(handlers, [
      { type: 'run_snapshot', turn_id: 'd4', state: { status: 'running', last_offset: 0, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 0 },
      { type: 'run_started', turn_id: 'd4', session_id: 101, sequence: 1 },
      ...textBlock(0, 4, '已落库'),
      { type: 'block_start', session_id: 101, sequence: 11, block: { index: 1, block_type: 'text' } },
      { type: 'text_delta', session_id: 101, sequence: 12, block: { index: 1 }, text: '半截' },
      // 被打断的那次执行没有自己的 run_end。
      { type: 'run_started', turn_id: 'd4', session_id: 101, sequence: 65 },
      { type: 'run_resumed', turn_id: 'd4', attempt: 2, watermark: 10, sequence: 66 },
      { type: 'session_ready', data: { session_id: 101, title: '团队', status: 'running' }, sequence: 67 },
      { type: 'task_snapshot', data: { session_id: 101, tasks: [], reason: 'baseline' }, sequence: 68 },
      ...textBlock(0, 69, '续跑'),
    ])
    expect(timeline(store)).toEqual(['用户:北京天气怎么样', '回复:已落库|续跑'])
    expect(store.state.busy).toBe(true)
  })

  it('流里的 TURN_NEEDS_ATTENTION 与 run_end(needs_attention) 挂一张提示卡，之后照常可以发言', async () => {
    vi.mocked(getSessionTurnList).mockResolvedValue([])
    const store = await openSession({ turn_id: 'a1', status: 'running', executing: false })
    const handlers = lastSubscription()
    // 文档第 8 节示例。
    emit(handlers, [
      { type: 'run_snapshot', turn_id: 'a1', state: { status: 'running', last_offset: 129, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 129 },
      { type: 'run_started', turn_id: 'a1', session_id: 101, sequence: 130 },
      { type: 'run_resumed', turn_id: 'a1', attempt: 2, watermark: 4, sequence: 131 },
      { type: 'session_ready', data: { session_id: 101, title: '团队', status: 'running' }, sequence: 132 },
      { type: 'task_snapshot', data: { session_id: 101, tasks: [], reason: 'baseline' }, sequence: 133 },
      { type: 'error', session_id: 101, sequence: 134, error: { code: 'TURN_NEEDS_ATTENTION', message: '工具 Bash 执行中断，结果未知，未自动重试', retriable: false, fatal: true } },
    ])
    vi.mocked(getActiveTurn).mockResolvedValue({ turn_id: 'a1', status: 'needs_attention', executing: false, last_event_offset: 194 })
    handlers.onEvent({ type: 'run_end', turn_id: 'a1', status: 'needs_attention', sequence: 194 })
    const cards = store.state.messages.flatMap((item) => item.blocks ?? []).filter((block) => block.kind === 'attention')
    expect(cards).toEqual([{ kind: 'attention', message: '工具 Bash 执行中断，结果未知，未自动重试', calls: [] }])
    expect(store.state.messages.flatMap((item) => item.blocks ?? []).some((block) => block.kind === 'tool' && block.fn === 'TURN_NEEDS_ATTENTION')).toBe(false)
    expect(store.hasOpenTurn()).toBe(false)
    expect(store.dispatch('那先别删了')).toBe(true)
    // 回合已结束，这条是新回合的起始发言，不排队。
    const sent = store.state.messages.find((item) => item.text === '那先别删了')
    expect(sent?.queued).toBeFalsy()
    expect(store.state.busy).toBe(true)
  })

  it('刷新后按回合列表还原提示卡（含历史回合），带结果未知的工具调用', async () => {
    const call = { tool_use_id: 'b1', tool_name: 'Bash', source: null, status: 'unknown', input_summary: '{"command":"rm -rf build","timeout":30}', started_at: '2026-11-19T12:26:37.947381Z', sub_run_id: null }
    vi.mocked(getSessionMessageList).mockResolvedValue([
      message({ id: 500, turn_id: 'a1', content: '清理构建目录', input_ids: [6] }),
      message({ id: 501, turn_id: 'a1', role: 'assistant', content: [{ kind: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'rm -rf build' } }], stream_offset: 4 }),
      message({ id: 503, turn_id: 'a2', content: '好的', input_ids: [8] }),
    ])
    vi.mocked(getSessionTurnList).mockResolvedValue([
      { turn_id: 'a1', status: 'needs_attention', started_message_id: 500, created_at: created, unknown_tool_calls: [call] },
      { turn_id: 'a2', status: 'completed', started_message_id: 503, created_at: created, unknown_tool_calls: [] },
    ])
    const store = await openSession(null)
    expect(store.state.messages[1]?.blocks?.at(-1)).toEqual({ kind: 'attention', calls: [call] })
    expect(store.state.messages.flatMap((item) => item.blocks ?? []).filter((block) => block.kind === 'attention')).toHaveLength(1)
  })
})

describe('刷新与在途内容', () => {
  it('刷新后还原排队中的发言，排在末尾', async () => {
    vi.mocked(getSessionPendingInputList).mockResolvedValue([
      { input_id: 7, client_input_id: 'c-7', session_id: 101, turn_id: 'a1', content: '顺便把 dist 也删了', created_at: created },
    ])
    const store = await openSession(null)
    expect(timeline(store)).toEqual(['用户:北京天气怎么样', '排队:顺便把 dist 也删了'])
    expect(store.state.messages.at(-1)).toMatchObject({ queued: true, queuedTurnId: 'a1', inputIds: [7] })
  })

  it('in_flight 回合以快照为准：列表里的回复不和快照各画一遍，注入发言按 sequence 插回', async () => {
    // 文档第 5 节示例：回合 a1 在途，助手消息 stream_offset 10、工具 11；注入发言 502 在 71。
    vi.mocked(getSessionMessageList).mockResolvedValue([
      message({ id: 3, turn_id: 'a1', content: '那上海呢', in_flight: true, input_ids: [8] }),
      message({ id: 4, turn_id: 'a1', role: 'assistant', content: [{ kind: 'text', text: '我先查一下。' }], stream_offset: 10, in_flight: true }),
      message({ id: 5, turn_id: 'a1', role: 'tool', content: { tool_use_id: 'toolu_01', tool_name: 'web_search', input_args: { query: '上海天气' }, output: '晴', is_error: false }, stream_offset: 11, in_flight: true }),
      message({ id: 502, turn_id: 'a1', content: '顺便查下广州', in_flight: true, input_ids: [9], stream_offset: 71 }),
    ])
    const store = await openSession({ turn_id: 'a1', status: 'running', executing: true })
    lastSubscription().onEvent({ type: 'run_snapshot', turn_id: 'a1', sequence: 80, state: {
      status: 'running', last_offset: 80, truncated: false,
      inputs: [{ message_id: 502, input_ids: [9], sequence: 71 }],
      main: { segment: 1, in_turn: true, blocks: [
        { segment: 1, index: 0, kind: 'text', text: '我先查一下。', closed: true, sequence: 8 },
        { segment: 1, index: 1, kind: 'text', text: '上海晴。', closed: true, sequence: 60 },
        { segment: 1, index: 2, kind: 'text', text: '广州多云', closed: false, sequence: 75 },
      ] },
      sub_runs: [],
    } })
    expect(timeline(store)).toEqual(['用户:那上海呢', '回复:我先查一下。|上海晴。', '用户:顺便查下广州', '回复:广州多云'])
  })

  it('截断快照用列表补前段：不大于落库水位的内容不再画，在途结果回填到已落库的工具卡', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([
      message({ id: 3, turn_id: 'a1', content: '那上海呢', in_flight: true }),
      message({ id: 4, turn_id: 'a1', role: 'assistant', content: [{ kind: 'text', text: '我先查一下。' }, { kind: 'tool_use', id: 'toolu_01', name: 'web_search', input: { query: '上海天气' } }], stream_offset: 10, in_flight: true }),
    ])
    const store = await openSession({ turn_id: 'a1', status: 'running', executing: true })
    lastSubscription().onEvent({ type: 'run_snapshot', turn_id: 'a1', sequence: 20, state: {
      status: 'running', last_offset: 20, truncated: true,
      main: { segment: 1, in_turn: true, blocks: [
        { segment: 1, index: 1, kind: 'tool_use', sequence: 9, tool: { id: 'toolu_01', name: 'web_search', input: { query: '上海天气' } }, result: { output: '晴', is_error: false }, result_sequence: 15 },
        { segment: 1, index: 2, kind: 'text', text: '上海晴。', closed: false, sequence: 16 },
      ] },
      sub_runs: [],
    } })
    expect(timeline(store)).toEqual(['用户:那上海呢', '回复:我先查一下。', '回复:上海晴。'])
    expect(store.state.messages[1]?.blocks?.[1]).toMatchObject({ kind: 'tool', tag: 'RESULT', body: '晴', done: true })
  })
})

describe('客户端发言 ID', () => {
  it('每条发言带一个新的 client_input_id，气泡记着它', async () => {
    const store = await openSession(null)
    store.dispatch('第一条')
    store.dispatch('第二条')
    const [first, second] = vi.mocked(sendMessage).mock.calls.map((call) => call[0].client_input_id)
    expect(first).toEqual(expect.any(String))
    expect(second).toEqual(expect.any(String))
    expect(first).not.toBe(second)
    expect(store.state.messages.find((item) => item.text === '第一条')?.clientInputIds).toEqual([first])
  })

  it('本页连发多条：前一条的流在 input_queued 之前就断开，认领时按 client_input_id 对上，正文相同也不会认错', async () => {
    const store = await openSession({ turn_id: 'a1', status: 'running', executing: true })
    lastSubscription().onEvent({ type: 'run_snapshot', turn_id: 'a1', state: { status: 'running', last_offset: 3, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 3 })
    store.dispatch('继续')
    const firstId = vi.mocked(sendMessage).mock.calls[0]![0].client_input_id!
    // 第二条发出时第一条的流被断开，它还没收到 input_queued。
    store.dispatch('继续')
    const secondId = vi.mocked(sendMessage).mock.calls[1]![0].client_input_id!
    const handlers = lastSend()
    emit(handlers, [
      { type: 'input_queued', session_id: 101, turn_id: 'a1', input_id: 8, client_input_id: secondId },
      { type: 'run_snapshot', turn_id: 'a1', state: { status: 'running', last_offset: 3, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 3 },
      { type: 'input_claimed', data: { session_id: 101, turn_id: 'a1', message_id: 502, input_ids: [7], client_input_ids: [firstId] }, sequence: 10 },
    ])
    const bubbles = store.state.messages.filter((item) => item.role === 'user' && item.text === '继续')
    expect(bubbles.map((item) => [item.queued ?? false, item.clientInputIds, item.messageId])).toEqual([
      [false, [firstId], 502],
      [true, [secondId], undefined],
    ])
    expect(getSessionMessageList).toHaveBeenCalledTimes(1)
  })

  it('快照 inputs 按 client_input_ids 认领本页还在排队的发言', async () => {
    const store = await openSession({ turn_id: 'a1', status: 'running', executing: true })
    store.dispatch('那上海呢')
    const clientInputId = vi.mocked(sendMessage).mock.calls[0]![0].client_input_id!
    emit(lastSend(), [
      { type: 'input_queued', session_id: 101, turn_id: 'a1', input_id: 7, client_input_id: clientInputId },
      { type: 'run_snapshot', turn_id: 'a1', sequence: 20, state: {
        status: 'running', last_offset: 20,
        inputs: [{ message_id: 502, input_ids: [7], client_input_ids: [clientInputId], sequence: 10 }],
        main: { segment: 1, in_turn: true, blocks: [
          { segment: 1, index: 0, kind: 'text', text: '北京晴。', closed: true, sequence: 4 },
          { segment: 1, index: 1, kind: 'text', text: '上海也晴。', closed: false, sequence: 12 },
        ] },
        sub_runs: [],
      } },
    ])
    expect(timeline(store)).toEqual(['用户:北京天气怎么样', '回复:北京晴。', '用户:那上海呢', '回复:上海也晴。'])
  })

  it('注入后断线：用同一 ID 重发，从 input_queued 开始照样跟到 run_switched，已认领的发言不挪回排队中', async () => {
    const store = await openSession({ turn_id: 'a1', status: 'running', executing: true })
    store.dispatch('那上海呢')
    const payload = vi.mocked(sendMessage).mock.calls[0]![0]
    const first = lastSend()
    emit(first, [
      { type: 'input_queued', session_id: 101, turn_id: 'a1', input_id: 7, client_input_id: payload.client_input_id },
      { type: 'run_snapshot', turn_id: 'a1', state: { status: 'running', last_offset: 3, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 3 },
    ])
    first.onError?.(new Error('断线'))
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
    expect(vi.mocked(sendMessage).mock.calls[1]![0]).toEqual(payload)
    expect(subscribeTurn).toHaveBeenCalledTimes(1)
    expect(store.state.messages.filter((item) => item.text === '那上海呢')).toHaveLength(1)

    const resent = lastSend()
    emit(resent, [
      { type: 'input_queued', session_id: 101, turn_id: 'a1', input_id: 7, client_input_id: payload.client_input_id },
      { type: 'run_snapshot', turn_id: 'a1', state: { status: 'running', last_offset: 5, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 5 },
      { type: 'run_end', turn_id: 'a1', status: 'completed', sequence: 65 },
      { type: 'run_switched', session_id: 101, turn_id: 'b2', input_id: 7, client_input_id: payload.client_input_id, previous_turn_id: 'a1' },
      { type: 'run_snapshot', turn_id: 'b2', state: { turn_id: null, status: null, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 0 },
      { type: 'run_started', turn_id: 'b2', session_id: 101, sequence: 1 },
      ...textBlock(0, 4, '上海晴。'),
    ])
    expect(store.state.activeTurnId).toBe('b2')
    expect(timeline(store)).toEqual(['用户:北京天气怎么样', '用户:那上海呢', '回复:上海晴。'])
  })

  it('新会话首条发言在 run_started 之前断线：重发拿到原回合的订阅流，会话照常建好', async () => {
    const store = useConsoleStore()
    store.resetConsole()
    store.dispatch('你好')
    const payload = vi.mocked(sendMessage).mock.calls[0]![0]
    expect(payload.session_id).toBeUndefined()
    lastSend().onError?.(new Error('断线'))
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
    expect(vi.mocked(sendMessage).mock.calls[1]![0]).toEqual(payload)
    lastSend().onEvent({ type: 'run_snapshot', turn_id: 'a0', sequence: 6, state: {
      turn_id: 'a0', session_id: 42, status: 'running', last_offset: 6, session: { session_id: 42, title: '你好' },
      main: { segment: 1, in_turn: true, blocks: [{ index: 0, kind: 'text', text: '你好！', closed: false, sequence: 5 }] },
    } })
    expect(store.state.activeSessionId).toBe('42')
    expect(store.state.messages.map((item) => [item.role, item.turnId])).toEqual([['user', 'a0'], ['ai', 'a0']])
  })

  it('刷新后按 client_input_id 去重：已认领的发言不会再从排队接口冒出来', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([
      startMessage,
      message({ id: 2, turn_id: 'a1', content: '那上海呢', input_ids: [7], client_input_ids: ['c-7'], stream_offset: 10 }),
    ])
    vi.mocked(getSessionPendingInputList).mockResolvedValue([
      { input_id: 7, client_input_id: 'c-7', session_id: 101, turn_id: 'a1', content: '那上海呢', created_at: created },
      { input_id: 9, client_input_id: 'c-9', session_id: 101, turn_id: 'a1', content: '顺便查下广州', created_at: created },
    ])
    const store = await openSession(null)
    expect(timeline(store)).toEqual(['用户:北京天气怎么样', '用户:那上海呢', '排队:顺便查下广州'])
    expect(store.state.messages[1]?.clientInputIds).toEqual(['c-7'])
    expect(store.state.messages[2]?.clientInputIds).toEqual(['c-9'])
  })
})
