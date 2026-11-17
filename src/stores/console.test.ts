import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, watchEffect } from 'vue'
import type { SseEvent } from '../interfaces/console/model'
import {
  getActiveTurn,
  getPendingInteraction,
  getSessionList,
  getSessionMessageList,
  getSessionTasks,
  sendMessage,
  shareSession,
  subscribeTurn,
  updateSessionChatSelection,
  SseOpenError,
} from '../http/console'
import { useConsoleStore } from './console'
import { getSessionSubAgentRuns } from '../http/session-runtime'

vi.mock('../http/session-runtime', () => ({ getSessionSubAgentRuns: vi.fn() }))

vi.mock('../http/console', async (importOriginal) => ({
  ...await importOriginal<typeof import('../http/console')>(),
  archiveSession: vi.fn(),
  cancelTurn: vi.fn(),
  cancelInteraction: vi.fn(),
  deleteSession: vi.fn(),
  deleteSessionList: vi.fn(),
  getActiveTurn: vi.fn(),
  getPendingInteraction: vi.fn(),
  getSessionList: vi.fn(),
  getSessionMessageList: vi.fn(),
  getSessionTasks: vi.fn(),
  respondInteraction: vi.fn(),
  sendMessage: vi.fn(),
  shareSession: vi.fn(),
  subscribeTurn: vi.fn(),
  updateSession: vi.fn(),
  updateSessionChatSelection: vi.fn(),
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
    vi.mocked(getActiveTurn).mockResolvedValue(null)
    vi.mocked(getSessionTasks).mockResolvedValue([])
    vi.mocked(getSessionSubAgentRuns).mockResolvedValue([])
    vi.mocked(sendMessage).mockReturnValue(() => {})
    vi.mocked(subscribeTurn).mockReturnValue(() => {})
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

  it('恢复已结束会话的任务并过滤删除项', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([message])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)
    const task = {
      id: 18, session_id: 42, subject: '历史任务', description: '已完成的工作',
      status: 'completed', owner: 'research', blocked_by: [17],
      created_at: message.created_at, updated_at: message.created_at,
    }
    vi.mocked(getSessionTasks).mockResolvedValue([task, { ...task, id: 19, status: 'deleted' }])

    const store = useConsoleStore()
    expect(await store.reloadConsole()).toBe(true)
    expect(getSessionTasks).toHaveBeenCalledWith('42')
    expect(store.state.tasks).toEqual([{
      id: '18', name: '历史任务', state: 'done', description: '已完成的工作',
      owner: 'research', blockedBy: [17],
    }])
  })

  it('任务查询失败不清空历史，也不阻断轮次恢复', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([message])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)
    vi.mocked(getSessionTasks).mockRejectedValue(new Error('任务暂不可用'))

    const store = useConsoleStore()
    expect(await store.reloadConsole()).toBe(true)
    expect(store.state.messages[0]?.blocks?.[0]).toMatchObject({ text: '历史消息仍然可见' })
    expect(store.state.health).toBe('degraded')
    expect(getActiveTurn).toHaveBeenCalledWith('42')
  })

  it('交互查询失败不阻断任务恢复与轮次恢复', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([message])
    vi.mocked(getPendingInteraction).mockRejectedValue(new Error('交互暂不可用'))

    const store = useConsoleStore()
    expect(await store.reloadConsole()).toBe(true)
    expect(store.state.health).toBe('degraded')
    expect(getActiveTurn).toHaveBeenCalledWith('42')
  })

  it('工作区重置后忽略尚未返回的任务与历史', async () => {
    let resolveTasks!: (tasks: []) => void
    vi.mocked(getSessionMessageList).mockResolvedValue([message])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)
    vi.mocked(getSessionTasks).mockImplementation(() => new Promise((resolve) => { resolveTasks = resolve }))
    const store = useConsoleStore()
    const loading = store.reloadConsole()
    await vi.waitFor(() => expect(getSessionTasks).toHaveBeenCalled())
    store.resetConsole()
    resolveTasks([])
    await loading
    expect(store.state.tasks).toEqual([])
    expect(store.state.messages).toEqual([])
    expect(getActiveTurn).not.toHaveBeenCalled()
  })

  it('新草稿连接失败后结束忙碌并显示错误', () => {
    const store = useConsoleStore()
    store.resetConsole()
    store.dispatch('你好')
    vi.mocked(sendMessage).mock.calls.at(-1)![1].onError?.(new Error('服务不可用'))
    expect(store.state.busy).toBe(false)
    expect(store.state.recovering).toBe(false)
    expect(store.state.messages.at(-1)?.blocks).toContainEqual(expect.objectContaining({
      kind: 'tool', tag: 'ERROR', body: '服务不可用', done: true,
    }))
  })

  it('run_started 早于 session_ready 时仍能恢复后端轮次', async () => {
    vi.mocked(getActiveTurn).mockResolvedValue({
      turn_id: 'turn-1', status: 'running', executing: true, last_event_offset: 1,
    })
    const store = useConsoleStore()
    store.resetConsole()
    store.dispatch('你好')
    const handlers = vi.mocked(sendMessage).mock.calls.at(-1)![1]
    handlers.onEvent({ type: 'run_started', sequence: 1, session_id: 42, turn_id: 'turn-1' })
    expect(store.state.activeSessionId).toBe('42')
    handlers.onError?.(new Error('断线'))
    await vi.waitFor(() => expect(subscribeTurn).toHaveBeenCalled())
    expect(getActiveTurn).toHaveBeenCalledWith('42')
    expect(subscribeTurn).toHaveBeenCalledWith(42, 'turn-1', expect.any(Object))
  })

  it('初次恢复的流式正文触发 Vue 响应式更新', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)
    vi.mocked(getActiveTurn).mockResolvedValue({
      turn_id: 'turn-1', status: 'running', executing: true, last_event_offset: 1,
    })
    const store = useConsoleStore()
    await store.reloadConsole()
    await vi.waitFor(() => expect(subscribeTurn).toHaveBeenCalled())
    let rendered = ''
    const stop = watchEffect(() => {
      const block = store.state.messages.at(-1)?.blocks?.[0]
      rendered = block?.kind === 'answer' ? block.text : ''
    })
    try {
      const handlers = vi.mocked(subscribeTurn).mock.calls.at(-1)![2]
      handlers.onEvent({ type: 'block_start', sequence: 2, session_id: 42,
        turn_id: 'turn-1', block: { index: 0, block_type: 'text' } })
      handlers.onEvent({ type: 'text_delta', sequence: 3, session_id: 42,
        turn_id: 'turn-1', block: { index: 0 }, text: '恢复后的增量' })
      await nextTick()
      expect(rendered).toBe('恢复后的增量')
    } finally {
      stop()
    }
  })

  it('上一轮的延迟历史刷新不会覆盖新一轮消息', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([message])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)
    const store = useConsoleStore()
    await store.reloadConsole()
    store.dispatch('第一轮')
    const handlers = vi.mocked(sendMessage).mock.calls.at(-1)![1]
    let resolveHistory!: (messages: typeof message[]) => void
    vi.mocked(getSessionMessageList).mockImplementationOnce(() => new Promise((resolve) => { resolveHistory = resolve }))
    handlers.onEvent({ type: 'run_end', sequence: 5, session_id: 42, turn_id: 'turn-1' })
    expect(store.dispatch('第二轮')).toBe(true)
    resolveHistory([message])
    await nextTick()
    await nextTick()
    expect(store.state.messages.some((item) => item.role === 'user' && item.text === '第二轮')).toBe(true)
  })

  it.each([false, true])('完整快照去重且截断快照保留更早历史: truncated=%s', async (truncated) => {
    vi.mocked(getSessionMessageList).mockResolvedValue([{ ...message, turn_id: 'turn-1', content: '暂停前回答' }])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)
    vi.mocked(getActiveTurn).mockResolvedValue({
      turn_id: 'turn-1', status: 'running', executing: true, last_event_offset: 10,
    })
    const store = useConsoleStore()
    await store.reloadConsole()
    await vi.waitFor(() => expect(subscribeTurn).toHaveBeenCalled())
    const handlers = vi.mocked(subscribeTurn).mock.calls.at(-1)![2]
    handlers.onEvent({ type: 'run_snapshot', sequence: 10, session_id: 42, turn_id: 'turn-1', state: {
      truncated, last_offset: 10,
      actors: [{ actor: { role: 'orchestrator', name: 'orchestrator' }, in_turn: true,
        blocks: [{ index: 0, kind: 'text', text: truncated ? '恢复后回答' : '暂停前回答', closed: true }] }],
      errors: [{ sequence: 9, actor: { role: 'orchestrator', name: 'orchestrator' },
        error: { code: 'RETRY', message: '可恢复错误', retriable: true, fatal: false } }],
    } })
    const answers = store.state.messages.flatMap((item) => item.blocks ?? [])
      .filter((block) => block.kind === 'answer').map((block) => block.text)
    expect(answers).toEqual(truncated ? ['暂停前回答', '恢复后回答'] : ['暂停前回答'])
    expect(store.state.messages.at(-1)?.blocks).toContainEqual(expect.objectContaining({
      kind: 'tool', tag: 'ERROR', body: '可恢复错误',
    }))
  })

  it('SSE 准入被拒绝时展示后端原因且不重放提交', () => {
    const store = useConsoleStore()
    store.resetConsole()
    store.dispatch('验证参数')
    const handlers = vi.mocked(sendMessage).mock.calls.at(-1)![1]
    handlers.onError?.(new SseOpenError('当前会话已有执行中轮次', 'HTTP_ERROR', 409))
    expect(store.state.busy).toBe(false)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(getActiveTurn).not.toHaveBeenCalled()
    expect(store.state.messages.at(-1)?.blocks).toContainEqual(expect.objectContaining({
      kind: 'tool', tag: 'ERROR', body: '当前会话已有执行中轮次',
    }))
  })

  it('连续订阅失败在三次恢复后收尾，避免无限立即重连', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(getSessionMessageList).mockResolvedValue([])
      vi.mocked(getPendingInteraction).mockResolvedValue(null)
      vi.mocked(getActiveTurn).mockResolvedValue({
        turn_id: 'turn-1', status: 'running', executing: true, last_event_offset: 1,
      })
      const store = useConsoleStore()
      await store.reloadConsole()
      await Promise.resolve()
      for (let index = 0; index < 4; index += 1) {
        vi.mocked(subscribeTurn).mock.calls.at(-1)![2].onError?.(new Error('暂时断线'))
        await vi.runAllTimersAsync()
      }
      expect(subscribeTurn).toHaveBeenCalledTimes(4)
      expect(store.state.busy).toBe(false)
      expect(store.state.recovering).toBe(false)
    } finally {
      vi.useRealTimers()
    }
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

  it('恢复后端中立块协议(kind 判别)的助手历史', async () => {
    vi.mocked(getSessionMessageList).mockResolvedValue([
      {
        ...message,
        id: 1,
        role: 'assistant',
        content: [
          { kind: 'thinking', text: '用户在打招呼', signature: null, redacted_data: null },
          { kind: 'text', text: '你好！' },
          { kind: 'tool_use', id: 'call-1', name: 'Bash', input: { command: 'ls' } },
        ],
      },
      {
        ...message,
        id: 2,
        role: 'tool',
        content: { tool_use_id: 'call-1', tool_name: 'Bash', input_args: { command: 'ls' }, output: 'a.txt', is_error: false },
      },
    ])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)

    const store = useConsoleStore()
    expect(await store.reloadConsole()).toBe(true)
    expect(store.state.messages).toHaveLength(1)
    expect(store.state.messages[0]?.blocks).toEqual([
      { kind: 'think', text: '用户在打招呼', done: true },
      { kind: 'answer', text: '你好！', streaming: false },
      expect.objectContaining({ kind: 'tool', tag: 'RESULT', body: 'a.txt', done: true }),
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
      { model_provider_id: null, mode_slug: 'standard', thinking_effort: 'fast', session_id: undefined, agent_id: 9, content: '使用设备 Agent 检查告警' },
      expect.any(Object),
    )
  })

  it('显式传入 null 时使用平台默认 Agent', () => {
    const store = useConsoleStore()
    store.resetConsole()
    store.newSession()
    store.setNewSessionAgent(9)

    expect(store.dispatch('改用默认 Agent', { agentId: null })).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith(
      { model_provider_id: null, mode_slug: 'standard', thinking_effort: 'fast', session_id: undefined, content: '改用默认 Agent' },
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
    expect(store.dispatch('继续当前会话', { agentId: 12 })).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith(
      { model_provider_id: null, mode_slug: 'standard', thinking_effort: 'fast', session_id: 42, content: '继续当前会话' },
      expect.any(Object),
    )
  })

  it('切换到绑定 Workflow 的会话时默认进入执行图视图', async () => {
    vi.mocked(getSessionList).mockResolvedValue([
      session,
      { ...session, id: 51, agent_id: null, workflow_id: 7 },
    ])
    vi.mocked(getSessionMessageList).mockResolvedValue([])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)

    const store = useConsoleStore()
    expect(await store.reloadConsole()).toBe(true)
    expect(store.state.workbenchMode).toBe('chat')
    store.selectSession('51')
    expect(store.state.workbenchMode).toBe('graph')
    store.setWorkbenchMode('chat')
    expect(store.state.workbenchMode).toBe('chat')
    store.setWorkbenchMode('graph')
    expect(store.state.workbenchMode).toBe('graph')
  })

  it('编排节点的分支消息不进主时间线', async () => {
    // 一次三成员的顺序编排会落 3 条 branch 消息 + 1 条主线汇总,
    // 若不按 branch 过滤,刷新后主对话会多出三条重复回复。
    vi.mocked(getSessionMessageList).mockResolvedValue([
      { ...message, id: 1, role: 'user', content: '写一段介绍', branch: null },
      { ...message, id: 2, branch: '内容生产流水线/n0_专业写作', content: '初稿正文' },
      { ...message, id: 3, branch: '内容生产流水线/n1_专业评审', content: '评审意见' },
      { ...message, id: 4, branch: '内容生产流水线/n2_专业翻译', content: '英文译文' },
      { ...message, id: 5, branch: null, content: '最终产出' },
    ])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)

    const store = useConsoleStore()
    expect(await store.reloadConsole()).toBe(true)
    expect(store.state.messages).toHaveLength(2)
    expect(store.state.messages[0]).toMatchObject({ role: 'user', text: '写一段介绍' })
    expect(store.state.messages[1]?.blocks?.[0]).toMatchObject({
      kind: 'answer',
      text: '最终产出',
    })
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

describe('console store Workflow 对话', () => {
  let sequence = 0

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    vi.mocked(getSessionTasks).mockResolvedValue([])
    vi.mocked(getSessionSubAgentRuns).mockResolvedValue([])
    vi.mocked(getActiveTurn).mockResolvedValue(null)
    vi.mocked(sendMessage).mockReturnValue(() => {})
    sequence = 0
  })

  /** 以 Workflow 5 派发一条消息并拿到 SSE 回调。 */
  function startWorkflowStream() {
    const store = useConsoleStore()
    store.resetConsole()
    store.setNewSessionWorkflow(5)
    expect(store.dispatch('按 Workflow 执行')).toBe(true)
    const handlers = vi.mocked(sendMessage).mock.calls.at(-1)?.[1]
    if (!handlers) throw new Error('未捕获到 SSE handlers')
    return { store, emit: handlers.onEvent, finish: () => handlers.onDone?.() }
  }

  function progressEvent(progress: NonNullable<SseEvent['progress']>): SseEvent {
    sequence += 1
    return {
      type: 'workflow_progress',
      sequence,
      session_id: 12,
      actor: { role: 'orchestrator', name: 'orchestrator' },
      progress,
    }
  }

  it('新会话绑定 Workflow 时只携带 workflow_id', () => {
    const store = useConsoleStore()
    store.resetConsole()
    store.setNewSessionAgent(9)
    store.setNewSessionWorkflow(5)

    expect(store.state.newSessionAgentId).toBeNull()
    expect(store.state.workbenchMode).toBe('graph')
    expect(store.dispatch('按 Workflow 执行')).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith(
      { model_provider_id: null, mode_slug: 'standard', thinking_effort: 'fast', session_id: undefined, workflow_id: 5, content: '按 Workflow 执行' },
      expect.any(Object),
    )
  })

  it('从 Workflow 切回 Agent 后只携带 agent_id', () => {
    const store = useConsoleStore()
    store.resetConsole()
    store.setNewSessionWorkflow(5)
    store.setNewSessionAgent(9)

    expect(store.state.newSessionWorkflowId).toBeNull()
    expect(store.dispatch('改用 Agent')).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith(
      { model_provider_id: null, mode_slug: 'standard', thinking_effort: 'fast', session_id: undefined, agent_id: 9, content: '改用 Agent' },
      expect.any(Object),
    )
  })

  it('已绑定 Workflow 的会话续聊不再携带 workflow_id 与 agent_id', async () => {
    vi.mocked(getSessionList).mockResolvedValue([
      { ...session, id: 61, agent_id: null, workflow_id: 5 },
    ])
    vi.mocked(getSessionMessageList).mockResolvedValue([])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)

    const store = useConsoleStore()
    expect(await store.reloadConsole()).toBe(true)
    store.selectSession('61')
    expect(store.state.sessions[0]?.workflowId).toBe(5)
    expect(store.state.workbenchMode).toBe('graph')
    expect(store.dispatch('继续', { agentId: 12, workflowId: 7 })).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith(
      { model_provider_id: null, mode_slug: 'standard', thinking_effort: 'fast', session_id: 61, content: '继续' },
      expect.any(Object),
    )
  })

  it('session_ready 后会话对象锁定 workflowId 并清空草稿', () => {
    const { store, emit } = startWorkflowStream()
    sequence += 1
    emit({
      type: 'session_ready',
      sequence,
      session_id: 12,
      data: { session_id: 12, title: '按 Workflow 执行', status: 'running' },
    })
    expect(store.state.activeSessionId).toBe('12')
    expect(store.state.sessions.find((item) => item.id === '12')?.workflowId).toBe(5)
    expect(store.state.newSessionWorkflowId).toBeNull()
  })

  it('workflow_progress 按 agent_id 归并成员并记录路由与汇总阶段', () => {
    const { store, emit } = startWorkflowStream()
    emit(progressEvent({ phase: 'routing', status: 'running' }))
    expect(store.state.workflowProgress.routing).toBe('running')

    emit(progressEvent({ phase: 'routing', status: 'done', agent_id: 2, member_name: '专业评审' }))
    expect(store.state.workflowProgress.routing).toBe('done')
    expect(store.state.workflowProgress.routedAgentId).toBe(2)

    emit(progressEvent({ phase: 'member', status: 'running', agent_id: 2, member_name: '专业评审', ordinal: 1, total: 2 }))
    // 配置期失败：没有 member_name，但要保留此前记录的名字与序号
    emit(progressEvent({ phase: 'member', status: 'failed', agent_id: 2 }))
    expect(store.state.workflowProgress.members[2]).toEqual({
      agentId: 2,
      memberName: '专业评审',
      status: 'failed',
      ordinal: 1,
      total: 2,
    })

    emit(progressEvent({ phase: 'merging', status: 'running' }))
    emit(progressEvent({ phase: 'merging', status: 'done' }))
    expect(store.state.workflowProgress.merging).toBe('done')
    // 进度事件不进主时间线
    expect(store.state.messages.at(-1)?.blocks ?? []).toHaveLength(0)
  })

  it('member 事件缺少 agent_id 时忽略并告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { store, emit } = startWorkflowStream()
    emit(progressEvent({ phase: 'member', status: 'running', member_name: '匿名' }))
    expect(store.state.workflowProgress.members).toEqual({})
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('新一轮派发清空上一轮的 Workflow 进度', () => {
    const { store, emit, finish } = startWorkflowStream()
    emit(progressEvent({ phase: 'member', status: 'done', agent_id: 1, member_name: '专业写作' }))
    expect(Object.keys(store.state.workflowProgress.members)).toHaveLength(1)

    finish()
    expect(store.dispatch('再跑一次')).toBe(true)
    expect(store.state.workflowProgress).toEqual({
      members: {},
      routing: null,
      routedAgentId: null,
      merging: null,
    })
  })
})

describe('console store 推理块收尾兜底', () => {
  let sequence = 0

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    vi.mocked(getSessionTasks).mockResolvedValue([])
    vi.mocked(getSessionSubAgentRuns).mockResolvedValue([])
    vi.mocked(getActiveTurn).mockResolvedValue(null)
    vi.mocked(sendMessage).mockReturnValue(() => {})
    sequence = 0
  })

  /** 派发一条消息,并灌入一个只有开头、没有 block_stop 的推理块。 */
  function startThinkingStream() {
    const store = useConsoleStore()
    store.resetConsole()
    expect(store.dispatch('你好')).toBe(true)
    const handlers = vi.mocked(sendMessage).mock.calls.at(-1)?.[1]
    if (!handlers) throw new Error('未捕获到 SSE handlers')
    const event = (type: SseEvent['type'], overrides: Partial<SseEvent>): SseEvent => {
      sequence += 1
      return { type, sequence, session_id: 12, ...overrides }
    }
    handlers.onEvent(event('block_start', { block: { index: 0, block_type: 'thinking' } }))
    handlers.onEvent(event('thinking_delta', { block: { index: 0 }, text: '分析中' }))
    const thinkBlock = () => store.state.messages.at(-1)?.blocks?.[0]
    expect(thinkBlock()).toMatchObject({ kind: 'think', done: false })
    return { handlers, thinkBlock }
  }

  it('流正常关闭但没收到 block_stop 时,推理块标为已结束', () => {
    const { handlers, thinkBlock } = startThinkingStream()
    handlers.onDone?.()
    expect(thinkBlock()).toMatchObject({ kind: 'think', done: true, seconds: 1 })
  })

  it('连接出错时,推理块同样标为已结束', () => {
    const { handlers, thinkBlock } = startThinkingStream()
    handlers.onError?.(new Error('网络断开'))
    expect(thinkBlock()).toMatchObject({ kind: 'think', done: true })
  })

  it('连接出错时,未结束的回答块停止流式光标', () => {
    const { handlers } = startThinkingStream()
    handlers.onEvent({ type: 'block_start', sequence: 90, session_id: 12, block: { index: 1, block_type: 'text' } })
    handlers.onEvent({ type: 'text_delta', sequence: 91, session_id: 12, block: { index: 1 }, text: '半截回答' })
    const store = useConsoleStore()
    const answer = () => store.state.messages.at(-1)?.blocks?.find((b) => b.kind === 'answer')
    expect(answer()).toMatchObject({ streaming: true })
    handlers.onError?.(new Error('网络断开'))
    expect(answer()).toMatchObject({ kind: 'answer', text: '半截回答', streaming: false })
  })

  /** 再灌入一个子代理：推理块和回答块都只开了头，没有 block_stop / turn_end */
  function startSubAgentStream(handlers: ReturnType<typeof startThinkingStream>['handlers']) {
    const actor = { role: 'subagent' as const, name: 'research', run_id: 'run-9' }
    handlers.onEvent({ type: 'turn_start', sequence: 80, session_id: 12, actor })
    handlers.onEvent({ type: 'block_start', sequence: 81, session_id: 12, actor, block: { index: 0, block_type: 'thinking' } })
    handlers.onEvent({ type: 'thinking_delta', sequence: 82, session_id: 12, actor, block: { index: 0 }, text: '查历史' })
    handlers.onEvent({ type: 'block_start', sequence: 83, session_id: 12, actor, block: { index: 1, block_type: 'text' } })
    handlers.onEvent({ type: 'text_delta', sequence: 84, session_id: 12, actor, block: { index: 1 }, text: '半截' })
    const stream = () => useConsoleStore().state.agents.find((a) => a.id === 'run-9')?.stream
    expect(stream()).toEqual([
      { kind: 'think', text: '查历史', done: false },
      { kind: 'answer', text: '半截', streaming: true },
    ])
    return stream
  }

  it('流正常关闭时,子代理面板里没结束的推理块和回答块一并收尾', () => {
    const { handlers } = startThinkingStream()
    const stream = startSubAgentStream(handlers)
    handlers.onDone?.()
    expect(stream()).toEqual([
      { kind: 'think', text: '查历史', done: true, seconds: 1 },
      { kind: 'answer', text: '半截', streaming: false },
    ])
  })

  it('连接出错时,子代理面板同样收尾', () => {
    const { handlers } = startThinkingStream()
    const stream = startSubAgentStream(handlers)
    handlers.onError?.(new Error('网络断开'))
    expect(stream()).toEqual([
      { kind: 'think', text: '查历史', done: true, seconds: 1 },
      { kind: 'answer', text: '半截', streaming: false },
    ])
  })
})

describe('聊天模型与模式状态', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    vi.mocked(getSessionList).mockResolvedValue([session])
    vi.mocked(getSessionMessageList).mockResolvedValue([])
    vi.mocked(getPendingInteraction).mockResolvedValue(null)
    vi.mocked(getSessionTasks).mockResolvedValue([])
    vi.mocked(getSessionSubAgentRuns).mockResolvedValue([])
    vi.mocked(getActiveTurn).mockResolvedValue(null)
    vi.mocked(sendMessage).mockReturnValue(() => {})
    vi.mocked(updateSessionChatSelection).mockImplementation(async (_id, selection) => ({ ...session, ...selection, metadata: { model_provider_override: selection.model_provider_id !== null } }))
  })

  it('首条消息携带草稿三项配置，SSE 创建会话后仍保留', async () => {
    const store = useConsoleStore()
    store.resetConsole()
    await store.setChatSelection({ model_provider_id: 'custom', mode_slug: 'standard', thinking_effort: 'high' })
    expect(store.dispatch('首条消息')).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ model_provider_id: 'custom', mode_slug: 'standard', thinking_effort: 'high' }), expect.any(Object))
    vi.mocked(sendMessage).mock.calls[0]![1].onEvent({ type: 'session_ready', sequence: 0, session_id: 42, data: { session_id: 42 } })
    expect(store.state.activeSessionId).toBe('42')
    expect(store.activeChatSelection()).toEqual({ model_provider_id: 'custom', mode_slug: 'standard', thinking_effort: 'high' })
  })

  it('保存完成前阻止发送；失败后保持原配置', async () => {
    const store = useConsoleStore()
    await store.reloadConsole()
    let fail!: (reason: Error) => void
    vi.mocked(updateSessionChatSelection).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
    const pending = store.setChatSelection({ model_provider_id: 'custom', mode_slug: 'standard', thinking_effort: 'high' })
    expect(store.state.chatSelectionSaving).toBe(true)
    expect(store.dispatch('此时不能发送')).toBe(false)
    expect(store.activeChatSelection().thinking_effort).toBe('fast')
    fail(new Error('保存失败'))
    await expect(pending).rejects.toThrow('保存失败')
    expect(store.state.chatSelectionSaving).toBe(false)
    expect(store.activeChatSelection().model_provider_id).toBeNull()
  })

  it('极速强制 fast，重新加载会话后保留标准强度', async () => {
    const store = useConsoleStore()
    await store.reloadConsole()
    await store.setChatSelection({ model_provider_id: 'custom', mode_slug: 'standard', thinking_effort: 'high' })
    await store.setChatSelection({ model_provider_id: 'custom', mode_slug: 'turbo', thinking_effort: 'max' })
    expect(store.activeChatSelection().thinking_effort).toBe('fast')
    expect(store.standardThinkingEffort()).toBe('high')
    expect(updateSessionChatSelection).toHaveBeenLastCalledWith('42', { model_provider_id: 'custom', mode_slug: 'turbo', thinking_effort: 'fast' })
    vi.mocked(getSessionList).mockResolvedValue([{ ...session, model_provider_id: 'custom', mode_slug: 'turbo', thinking_effort: 'fast', metadata: { model_provider_override: true } }])
    await store.reloadConsole()
    expect(store.standardThinkingEffort()).toBe('high')
    await store.setChatSelection({ ...store.activeChatSelection(), mode_slug: 'standard', thinking_effort: store.standardThinkingEffort() })
    expect(store.activeChatSelection().thinking_effort).toBe('high')
  })

  it('工作流恢复的实际角色模型不当作显式选择，修改强度与续聊仍传 null', async () => {
    const resolved = { ...session, workflow_id: 8, model_provider_id: 'workflow-role', thinking_effort: 'high' as const, metadata: { model_provider_override: false } }
    vi.mocked(getSessionList).mockResolvedValue([resolved])
    vi.mocked(updateSessionChatSelection).mockResolvedValue({ ...resolved, thinking_effort: 'medium' })
    const store = useConsoleStore()
    await store.reloadConsole()
    expect(store.state.sessions[0]?.modelProviderId).toBe('workflow-role')
    expect(store.activeChatSelection().model_provider_id).toBeNull()
    await store.setChatSelection({ ...store.activeChatSelection(), thinking_effort: 'medium' })
    expect(updateSessionChatSelection).toHaveBeenLastCalledWith('42', { model_provider_id: null, mode_slug: 'standard', thinking_effort: 'medium' })
    expect(store.activeChatSelection().model_provider_id).toBeNull()
    expect(store.dispatch('继续工作流')).toBe(true)
    expect(sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({ model_provider_id: null }), expect.any(Object))
  })

  it('显式覆盖从 metadata 恢复，重置默认后使用服务端归一强度', async () => {
    vi.mocked(getSessionList).mockResolvedValue([{ ...session, model_provider_id: 'custom', metadata: { model_provider_override: true } }])
    const store = useConsoleStore()
    await store.reloadConsole()
    expect(store.activeChatSelection().model_provider_id).toBe('custom')
    vi.mocked(updateSessionChatSelection).mockResolvedValue({ ...session, model_provider_id: 'resolved-default', mode_slug: 'standard', thinking_effort: 'medium', metadata: { model_provider_override: false } })
    await store.setChatSelection({ model_provider_id: null, mode_slug: 'standard', thinking_effort: 'max' })
    expect(store.state.sessions[0]?.modelProviderId).toBe('resolved-default')
    expect(store.activeChatSelection()).toEqual({ model_provider_id: null, mode_slug: 'standard', thinking_effort: 'medium' })
    expect(store.standardThinkingEffort()).toBe('medium')
  })

  it('只读会话与忙碌期间不保存配置', async () => {
    const store = useConsoleStore()
    await store.reloadConsole()
    store.state.sessions[0]!.readOnly = true
    expect(await store.setChatSelection({ model_provider_id: null, mode_slug: 'turbo', thinking_effort: 'fast' })).toBe(false)
    store.state.sessions[0]!.readOnly = false
    store.state.busy = true
    expect(await store.setChatSelection({ model_provider_id: null, mode_slug: 'turbo', thinking_effort: 'fast' })).toBe(false)
    expect(updateSessionChatSelection).not.toHaveBeenCalled()
  })
})
