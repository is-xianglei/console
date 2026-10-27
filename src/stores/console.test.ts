import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { SseEvent, SseNodeInfo } from '../interfaces/console/model'
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

    expect(store.dispatch('改用默认 Agent', { agentId: null })).toBe(true)
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
    expect(store.dispatch('继续当前会话', { agentId: 12 })).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith(
      { session_id: 42, content: '继续当前会话' },
      expect.any(Object),
    )
  })

  it('新会话绑定编排方案时携带方案 ID 且不带 Agent ID', () => {
    const store = useConsoleStore()
    store.resetConsole()
    store.setNewSessionAgent(9)
    store.setNewSessionPlan(3)

    expect(store.state.newSessionAgentId).toBeNull()
    expect(store.state.workbenchMode).toBe('graph')
    expect(store.dispatch('按编排方案执行')).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith(
      { session_id: undefined, orchestration_plan_id: 3, content: '按编排方案执行' },
      expect.any(Object),
    )
  })

  it('从编排方案切回平台默认 Agent 后不再携带方案 ID', () => {
    const store = useConsoleStore()
    store.resetConsole()
    store.setNewSessionPlan(3)
    expect(store.state.newSessionPlanId).toBe(3)

    // setNewSessionAgent(null) 只清 Agent 不清方案,composer 正是依赖这一点才显式解绑
    store.setNewSessionAgent(null)
    expect(store.state.newSessionPlanId).toBe(3)

    store.setNewSessionPlan(null)
    expect(store.state.workbenchMode).toBe('chat')
    expect(store.dispatch('改用平台默认 Agent')).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith(
      { session_id: undefined, content: '改用平台默认 Agent' },
      expect.any(Object),
    )
  })

  it('切换到绑定编排方案的会话时默认进入执行图视图', async () => {
    vi.mocked(getSessionList).mockResolvedValue([
      session,
      { ...session, id: 51, agent_id: null, orchestration_plan_id: 7 },
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

describe('console store 编排执行图', () => {
  let sequence = 0

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    vi.mocked(sendMessage).mockReturnValue(() => {})
    sequence = 0
  })

  /** 派发一条消息并拿到该流的回调,用于直接灌入节点事件。 */
  function startStream() {
    const store = useConsoleStore()
    store.resetConsole()
    store.setNewSessionPlan(3)
    expect(store.dispatch('按编排方案执行')).toBe(true)
    const handlers = vi.mocked(sendMessage).mock.calls.at(-1)?.[1]
    if (!handlers) throw new Error('未捕获到 SSE handlers')
    return { store, emit: handlers.onEvent, finish: () => handlers.onDone?.() }
  }

  function nodeEvent(
    type: 'node_start' | 'node_end',
    path: string,
    overrides: Partial<SseNodeInfo> = {},
  ): SseEvent {
    sequence += 1
    return {
      type,
      sequence,
      session_id: 12,
      actor: { role: 'subagent', name: '内容生产方案', run_id: `a1b2c3d4:${path}` },
      node: { path, name: path.split('/').pop() ?? path, kind: 'leaf', ...overrides },
    }
  }

  it('并行模式下 start/end 乱序到达仍按 path 归并到各自节点', () => {
    const { store, emit } = startStream()
    const writer = '内容生产方案/n0_写作专员'
    const reviewer = '内容生产方案/n1_评审专员'
    const translator = '内容生产方案/n2_翻译专员'

    // 三个 start 集中出现,end 按各分支完成快慢乱序返回
    emit(nodeEvent('node_start', writer))
    emit(nodeEvent('node_start', reviewer))
    emit(nodeEvent('node_start', translator))
    emit(nodeEvent('node_end', reviewer, { status: 'completed' }))
    emit(nodeEvent('node_end', translator, { status: 'failed' }))

    expect(store.state.graphNodes[reviewer]).toMatchObject({ path: reviewer, status: 'completed' })
    expect(store.state.graphNodes[translator]).toMatchObject({ status: 'failed' })
    // 尚未回来的分支保持运行中,不被其他分支的 end 误收
    expect(store.state.graphNodes[writer]).toMatchObject({ status: 'running' })
    expect(store.state.graphNodes[writer]?.runId).toBe(`a1b2c3d4:${writer}`)
  })

  it('loop 同一成员跨轮次复用同一节点并刷新轮次角标', () => {
    const { store, emit } = startStream()
    const base = '内容生产方案/n0_写作专员'

    emit(nodeEvent('node_start', '内容生产方案#0/n0_写作专员', {
      detail: { iteration: 1, max_iterations: 2 },
    }))
    emit(nodeEvent('node_end', '内容生产方案#0/n0_写作专员', {
      status: 'completed',
      detail: { iteration: 1, max_iterations: 2 },
    }))
    emit(nodeEvent('node_start', '内容生产方案#1/n0_写作专员', {
      detail: { iteration: 2, max_iterations: 2 },
    }))

    // 两轮归并到同一个裸路径,图上只画一个节点框
    expect(Object.keys(store.state.graphNodes)).toEqual([base])
    expect(store.state.graphNodes[base]).toMatchObject({
      status: 'running',
      iteration: 2,
      maxIterations: 2,
    })
  })

  it('新一轮派发清空上一轮的执行图状态', () => {
    const { store, emit, finish } = startStream()
    emit(nodeEvent('node_end', '内容生产方案/n0_写作专员', { status: 'completed' }))
    expect(Object.keys(store.state.graphNodes)).toHaveLength(1)

    // 上一轮流收尾后才能再次派发(dispatch 在 busy 时直接拒绝)
    finish()
    expect(store.dispatch('再跑一次')).toBe(true)
    expect(store.state.graphNodes).toEqual({})
  })
})

describe('console store Workflow 对话', () => {
  let sequence = 0

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
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
    store.setNewSessionPlan(3)
    store.setNewSessionWorkflow(5)

    expect(store.state.newSessionAgentId).toBeNull()
    expect(store.state.newSessionPlanId).toBeNull()
    expect(store.state.workbenchMode).toBe('graph')
    expect(store.dispatch('按 Workflow 执行')).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith(
      { session_id: undefined, workflow_id: 5, content: '按 Workflow 执行' },
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
      { session_id: undefined, agent_id: 9, content: '改用 Agent' },
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
      { session_id: 61, content: '继续' },
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
