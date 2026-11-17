import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, watchEffect } from 'vue'
import type { ChatMessage, SseEvent, SubAgent } from '@/interfaces/console/model'
import { createSseReducer, fmtToolCall } from './sse-reducer'

let sequence = 0

function createEvent(type: SseEvent['type'], overrides: Partial<SseEvent> = {}): SseEvent {
  sequence += 1
  return {
    type,
    sequence,
    session_id: 12,
    ...overrides,
  }
}

describe('fmtToolCall', () => {
  it('将工具输入格式化为稳定的函数签名', () => {
    expect(fmtToolCall('readFile', { path: '/tmp/demo.txt', limit: 20 }))
      .toBe('readFile(path="/tmp/demo.txt", limit=20)')
  })

  it('限制过长参数，避免工具卡被单个值撑开', () => {
    const result = fmtToolCall('search', { query: 'a'.repeat(64) })
    expect(result).toContain('…')
    expect(result.length).toBeLessThan(64)
  })
})

describe('createSseReducer', () => {
  it('累加文本增量并在块结束时关闭流式状态', () => {
    const ai: ChatMessage = { id: 'ai-1', role: 'ai', time: '10:00', blocks: [] }
    const reducer = createSseReducer({
      ai,
      agents: [],
      selectAgent: vi.fn(),
    })

    reducer.handle(createEvent('block_start', { block: { index: 0, block_type: 'text' } }))
    reducer.handle(createEvent('text_delta', { block: { index: 0 }, text: '诊断' }))
    reducer.handle(createEvent('text_delta', { block: { index: 0 }, text: '完成' }))
    reducer.handle(createEvent('block_stop', { block: { index: 0 } }))

    expect(ai.blocks).toEqual([{ kind: 'answer', text: '诊断完成', streaming: false }])
  })

  it('把新会话 ID 回填给调用方', () => {
    const onSessionId = vi.fn()
    const reducer = createSseReducer({
      ai: { id: 'ai-2', role: 'ai', time: '10:01', blocks: [] },
      agents: [],
      selectAgent: vi.fn(),
      onSessionId,
    })

    reducer.handle(createEvent('session_ready', {
      data: { session_id: 42 },
    }))

    expect(onSessionId).toHaveBeenCalledOnce()
    expect(onSessionId).toHaveBeenCalledWith(42)
  })

  it('把通用人工交互事件转换为可渲染的交互卡', () => {
    const ai: ChatMessage = { id: 'ai-3', role: 'ai', time: '10:02', blocks: [] }
    const reducer = createSseReducer({
      ai,
      agents: [],
      selectAgent: vi.fn(),
    })

    reducer.handle(createEvent('interaction_request', {
      actor: { role: 'orchestrator', name: 'orchestrator' },
      interaction: {
        request_id: 'request-1',
        suspension_id: 'suspension-1',
        kind: 'tool_approval',
        schema_version: 1,
        request_payload: {
          tool: { id: 'tool-1', name: 'Bash', input: { command: 'pwd' } },
          reason: '危险工具默认需审批',
          allowed_decisions: ['allow_once', 'always_allow', 'deny'],
          can_update_input: true,
        },
      },
    }))

    expect(ai.blocks).toEqual([{
      kind: 'interaction',
      interaction: expect.objectContaining({ request_id: 'request-1', kind: 'tool_approval' }),
      status: 'pending',
    }])
  })

  it('渲染思考、工具调用与流内错误', () => {
    const ai: ChatMessage = { id: 'ai-4', role: 'ai', time: '10:03', blocks: [] }
    const reducer = createSseReducer({ ai, agents: [], selectAgent: vi.fn() })

    reducer.handle(createEvent('block_start', { block: { index: 0, block_type: 'thinking' } }))
    reducer.handle(createEvent('thinking_delta', { block: { index: 0 }, text: '正在分析' }))
    reducer.handle(createEvent('block_stop', { block: { index: 0 } }))
    reducer.handle(createEvent('tool_use', {
      tool: { id: 'tool-1', name: 'Search', input: { query: 'pump-01' } },
    }))
    reducer.handle(createEvent('tool_result', {
      tool: { id: 'tool-1', name: 'Search', output: '找到 2 条记录', is_error: false },
    }))
    reducer.handle(createEvent('error', {
      error: { code: 'MODEL_TIMEOUT', message: '模型超时', retriable: true, fatal: false },
    }))

    expect(ai.blocks).toEqual([
      { kind: 'think', text: '正在分析', done: true, seconds: 1 },
      {
        kind: 'tool',
        tag: 'RESULT',
        fn: 'Search(query="pump-01")',
        body: '找到 2 条记录',
        done: true,
      },
      { kind: 'tool', tag: 'ERROR', fn: 'MODEL_TIMEOUT', body: '模型超时', done: true },
    ])
  })

  it('按 tool.id 将同轮主 Agent 的多个工具结果写回各自卡片', () => {
    const ai: ChatMessage = { id: 'ai-tools', role: 'ai', time: '10:04', blocks: [] }
    const reducer = createSseReducer({ ai, agents: [], selectAgent: vi.fn() })

    reducer.handle(createEvent('tool_use', {
      tool: { id: 'tool-a', name: 'Search', input: { query: 'a' } },
    }))
    reducer.handle(createEvent('tool_use', {
      tool: { id: 'tool-b', name: 'Search', input: { query: 'b' } },
    }))
    reducer.handle(createEvent('tool_result', {
      tool: { id: 'tool-a', name: 'Search', output: '结果 A', is_error: false },
    }))
    reducer.handle(createEvent('tool_result', {
      tool: { id: 'tool-b', name: 'Search', output: '结果 B', is_error: true },
    }))

    expect(ai.blocks).toEqual([
      { kind: 'tool', tag: 'RESULT', fn: 'Search(query="a")', body: '结果 A', done: true },
      { kind: 'tool', tag: 'ERROR', fn: 'Search(query="b")', body: '结果 B', done: true },
    ])
  })

  it.each([
    ['orchestrator', false], ['orchestrator', true],
    ['subagent', false], ['subagent', true],
  ] as const)('%s 的工具结果 is_error=%s 会触发响应式视图更新', async (role, is_error) => {
    const ai = reactive<ChatMessage>({ id: 'ai-reactive-tools', role: 'ai', time: '10:04', blocks: [] })
    const agents = reactive<Parameters<typeof createSseReducer>[0]['agents']>([])
    const reducer = createSseReducer({ ai, agents, selectAgent: vi.fn() })
    const actor = role === 'orchestrator' ? undefined : { role, name: 'research', run_id: 'run-reactive' }
    const observed = vi.fn()
    const stop = watchEffect(() => {
      const items = role === 'orchestrator' ? ai.blocks : agents[0]?.stream
      observed(items?.filter((item) => item.kind === 'tool').map((item) => ({
        body: item.body, done: item.done,
        tag: 'tag' in item ? item.tag : item.is_error ? 'ERROR' : item.done ? 'RESULT' : 'TOOL',
      })))
    })

    try {
      reducer.handle(createEvent('tool_use', { actor, tool: { id: 'tool-reactive', name: 'Search' } }))
      // 先让视图渲染运行态，避免数组 push 排队的更新掩盖 tool_result 的响应式缺口。
      await nextTick()
      expect(observed).toHaveBeenLastCalledWith([{ body: '', done: false, tag: 'TOOL' }])
      const renders = observed.mock.calls.length

      reducer.handle(createEvent('tool_result', {
        actor, tool: { id: 'tool-reactive', name: 'Search', output: '真实工具结果', is_error },
      }))
      await nextTick()

      expect(observed).toHaveBeenCalledTimes(renders + 1)
      expect(observed).toHaveBeenLastCalledWith([{
        body: '真实工具结果', done: true, tag: is_error ? 'ERROR' : 'RESULT',
      }])
    } finally {
      stop()
    }
  })

  it('按 actor + tool.id 区分主 Agent 与子 Agent 的同名工具调用', () => {
    const ai: ChatMessage = { id: 'ai-tool-scopes', role: 'ai', time: '10:04', blocks: [] }
    const agents: Parameters<typeof createSseReducer>[0]['agents'] = []
    const reducer = createSseReducer({ ai, agents, selectAgent: vi.fn() })
    const actor = { role: 'subagent' as const, name: 'research', run_id: 'run-tools' }

    reducer.handle(createEvent('tool_use', {
      tool: { id: 'shared-id', name: 'Search', input: { query: '主 Agent' } },
    }))
    reducer.handle(createEvent('turn_start', { actor }))
    reducer.handle(createEvent('tool_use', {
      actor,
      tool: { id: 'shared-id', name: 'Search', input: { query: '子 Agent' } },
    }))
    reducer.handle(createEvent('tool_result', {
      actor,
      tool: { id: 'shared-id', name: 'Search', output: '子结果', is_error: false },
    }))
    // 子 Agent 的重复结果不能因精确卡已完成而回退写入主 Agent 的同 id 卡片。
    reducer.handle(createEvent('tool_result', {
      actor,
      tool: { id: 'shared-id', name: 'Search', output: '重复子结果', is_error: false },
    }))
    reducer.handle(createEvent('tool_result', {
      tool: { id: 'shared-id', name: 'Search', output: '主结果', is_error: false },
    }))

    expect(ai.blocks).toEqual([
      { kind: 'tool', tag: 'RESULT', fn: 'Search(query="主 Agent")', body: '主结果', done: true },
    ])
    expect(agents[0].stream).toEqual([
      { kind: 'tool', fn: 'Search(query="子 Agent")', body: '子结果', done: true, is_error: false },
    ])
  })

  it.each([
    ['subagent', true], ['subagent', false], ['subagent', undefined],
    ['teammate', true], ['teammate', false], ['teammate', undefined],
  ] as const)('%s 工具结果保留 is_error=%s，兼容未带标记的旧事件', (role, is_error) => {
    const agents: Parameters<typeof createSseReducer>[0]['agents'] = []
    const reducer = createSseReducer({
      ai: { id: 'ai-tool-errors', role: 'ai', time: '10:04', blocks: [] },
      agents, selectAgent: vi.fn(),
    })
    const actor = { role, name: 'research', run_id: 'run-tool-errors' }
    reducer.handle(createEvent('tool_use', { actor, tool: { id: 'tool-1', name: 'Search' } }))
    const flag = typeof is_error === 'boolean' ? { is_error } : {}
    // 正文出现 ERROR 不代表调用失败，状态只能来自协议标记。
    reducer.handle(createEvent('tool_result', {
      actor, tool: { id: 'tool-1', name: 'Search', output: '找到 ERROR 日志', ...flag },
    }))

    expect(agents[0]?.stream).toEqual([{
      kind: 'tool', fn: 'Search()', body: '找到 ERROR 日志', done: true, ...flag,
    }])
  })

  describe('推理块的结束状态与思考秒数', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    function startThinking() {
      const ai: ChatMessage = { id: 'ai-think', role: 'ai', time: '10:05', blocks: [] }
      const reducer = createSseReducer({ ai, agents: [], selectAgent: vi.fn() })
      reducer.handle(createEvent('block_start', { block: { index: 0, block_type: 'thinking' } }))
      reducer.handle(createEvent('thinking_delta', { block: { index: 0 }, text: '拆解问题' }))
      return { ai, reducer }
    }

    it('block_stop 前保持进行中，结束时按 block_start 到 block_stop 的时长记秒数', () => {
      const { ai, reducer } = startThinking()
      expect(ai.blocks).toEqual([{ kind: 'think', text: '拆解问题', done: false }])

      vi.advanceTimersByTime(4600)
      reducer.handle(createEvent('block_stop', { block: { index: 0 } }))

      expect(ai.blocks).toEqual([{ kind: 'think', text: '拆解问题', done: true, seconds: 5 }])
    })

    it('不足 1 秒按 1 秒显示', () => {
      const { ai, reducer } = startThinking()
      vi.advanceTimersByTime(200)
      reducer.handle(createEvent('block_stop', { block: { index: 0 } }))

      expect(ai.blocks?.[0]).toMatchObject({ done: true, seconds: 1 })
    })

    it('流收尾时兜底结束没收到 block_stop 的推理块', () => {
      const { ai, reducer } = startThinking()
      vi.advanceTimersByTime(3000)
      reducer.settleStreams()

      expect(ai.blocks?.[0]).toMatchObject({ done: true, seconds: 3 })
    })

    it('已结束的推理块不会被兜底改写秒数', () => {
      const { ai, reducer } = startThinking()
      vi.advanceTimersByTime(2000)
      reducer.handle(createEvent('block_stop', { block: { index: 0 } }))
      vi.advanceTimersByTime(8000)
      reducer.settleStreams()

      expect(ai.blocks?.[0]).toMatchObject({ done: true, seconds: 2 })
    })

    it('其他归约器建的推理块（如审批后续流）兜底时只标结束、不记秒数', () => {
      const { ai } = startThinking()
      const resumed = createSseReducer({ ai, agents: [], selectAgent: vi.fn() })
      resumed.settleStreams()

      expect(ai.blocks).toEqual([{ kind: 'think', text: '拆解问题', done: true }])
    })
  })

  it('MCP 工具卡去掉 mcp__ 前缀并记下 server_key，内置工具不变', () => {
    const ai: ChatMessage = { id: 'ai-mcp', role: 'ai', time: '10:00', blocks: [] }
    const reducer = createSseReducer({ ai, agents: [], selectAgent: vi.fn() })

    reducer.handle(createEvent('tool_use', {
      tool: { id: 't1', name: 'mcp__deepwiki__ask_wiki_question', input: { repoName: 'vuejs/core' }, source: 'mcp:deepwiki' },
    }))
    reducer.handle(createEvent('tool_use', { tool: { id: 't2', name: 'Read', input: { file_path: '/a' } } }))
    reducer.handle(createEvent('tool_result', { tool: { id: 't1', name: 'mcp__deepwiki__ask_wiki_question', output: '答案', is_error: false, source: 'mcp:deepwiki' } }))

    expect(ai.blocks?.[0]).toMatchObject({ kind: 'tool', fn: 'ask_wiki_question(repoName="vuejs/core")', mcp: 'deepwiki', tag: 'RESULT', body: '答案' })
    expect(ai.blocks?.[1]).not.toHaveProperty('mcp')
  })

  it('tool_sources 放在本轮回复最上面，重复推送去重', () => {
    const ai: ChatMessage = { id: 'ai-src', role: 'ai', time: '10:00', blocks: [] }
    const reducer = createSseReducer({ ai, agents: [], selectAgent: vi.fn() })
    const auth = { source: 'mcp:linear', server_id: 3, kind: 'auth_required', message: '需要授权' }
    const timeout = { source: 'mcp:jira', server_id: 4, kind: 'timeout', message: '获取超时' }

    reducer.handle(createEvent('block_start', { block: { index: 0, block_type: 'text' } }))
    reducer.handle(createEvent('tool_sources', { data: { session_id: 12, faults: [auth] } }))
    reducer.handle(createEvent('tool_sources', { data: { session_id: 12, faults: [auth, timeout] } }))
    reducer.handle(createEvent('tool_sources', { data: { session_id: 12, faults: [] } }))
    reducer.handle(createEvent('text_delta', { block: { index: 0 }, text: '好' }))

    expect(ai.blocks?.[0]).toEqual({ kind: 'sources', faults: [auth, timeout] })
    expect(ai.blocks?.[1]).toMatchObject({ kind: 'answer', text: '好' })
  })

  it('子代理面板里的 MCP 工具同样标注来源', () => {
    const agents: SubAgent[] = []
    const reducer = createSseReducer({ ai: { id: 'ai-sub', role: 'ai', time: '10:00', blocks: [] }, agents, selectAgent: vi.fn() })
    reducer.handle(createEvent('tool_use', {
      actor: { role: 'subagent', name: 'research', run_id: 'r1' },
      tool: { id: 't1', name: 'mcp__jira__search', input: {}, source: 'mcp:jira' },
    }))
    expect(agents[0]?.stream[0]).toMatchObject({ kind: 'tool', fn: 'search()', mcp: 'jira' })
  })

  it('透传会话任务全量快照', () => {
    const onTaskSnapshot = vi.fn()
    const reducer = createSseReducer({
      ai: { id: 'ai-5', role: 'ai', time: '10:04', blocks: [] },
      agents: [],
      selectAgent: vi.fn(),
      onTaskSnapshot,
    })
    const tasks = [{
      id: 8,
      session_id: 12,
      subject: '根因分析',
      description: '检查振动数据',
      status: 'in_progress',
      owner: 'research',
      blocked_by: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:01Z',
    }]

    reducer.handle(createEvent('task_snapshot', { data: { session_id: 12, tasks } }))

    expect(onTaskSnapshot).toHaveBeenCalledWith(tasks)
  })

  it('累加子代理增量并收束运行状态', () => {
    const agents: Parameters<typeof createSseReducer>[0]['agents'] = []
    const selectAgent = vi.fn()
    const reducer = createSseReducer({
      ai: { id: 'ai-6', role: 'ai', time: '10:05', blocks: [] },
      agents,
      selectAgent,
    })
    const actor = { role: 'subagent' as const, name: 'research', run_id: 'run-1', task: '调查振动历史' }

    reducer.handle(createEvent('turn_start', { actor }))
    reducer.handle(createEvent('block_start', { actor, block: { index: 1, block_type: 'text' } }))
    reducer.handle(createEvent('text_delta', { actor, block: { index: 1 }, text: '调查完成' }))
    reducer.handle(createEvent('block_stop', { actor, block: { index: 1 } }))
    reducer.handle(createEvent('turn_end', { actor }))

    expect(selectAgent).toHaveBeenCalledWith('run-1')
    expect(agents).toEqual([expect.objectContaining({
      id: 'run-1',
      status: 'done',
      progress: 100,
      stream: [{ kind: 'answer', text: '调查完成', streaming: false }],
    })])
  })

  it('编排成员面板用 Agent 名作标题并按 run_id 归并', () => {
    const agents: Parameters<typeof createSseReducer>[0]['agents'] = []
    const reducer = createSseReducer({
      ai: { id: 'ai-7', role: 'ai', time: '10:06', blocks: [] },
      agents,
      selectAgent: vi.fn(),
    })
    const runId = '335e31a7:内容生产流水线/n1_专业评审'
    // 顺序编排的 task 是渲染后的完整 instruction,带上游全文,不能拿来当标题:
    // 三个成员的面板会长得几乎一样,且看不出是哪个 Agent。
    const actor = {
      role: 'subagent' as const,
      name: '专业评审',
      run_id: runId,
      task: '任务:介绍工业物联网。\n\n上游产出:\n(此处是上游整篇初稿)',
    }

    reducer.handle(createEvent('turn_start', { actor }))
    reducer.handle(createEvent('block_start', { actor, block: { index: 0, block_type: 'text' } }))
    reducer.handle(createEvent('text_delta', { actor, block: { index: 0 }, text: '结构清晰' }))

    expect(agents).toHaveLength(1)
    expect(agents[0]).toMatchObject({
      id: runId,
      name: '专业评审',
      stream: [{ kind: 'answer', text: '结构清晰', streaming: true }],
    })
  })

  it('workflow_progress 只喂进度图,不进主时间线也不建面板', () => {
    const ai: ChatMessage = { id: 'ai-8', role: 'ai', time: '10:07', blocks: [] }
    const agents: Parameters<typeof createSseReducer>[0]['agents'] = []
    const onWorkflowProgress = vi.fn()
    const reducer = createSseReducer({ ai, agents, selectAgent: vi.fn(), onWorkflowProgress })
    const progress = { phase: 'member', status: 'running', agent_id: 1, member_name: '专业写作', ordinal: 1, total: 2 }

    reducer.handle(createEvent('workflow_progress', {
      actor: { role: 'orchestrator', name: 'orchestrator' },
      progress,
    }))
    // 缺 progress 负载的事件同样早退,不触发回调
    reducer.handle(createEvent('workflow_progress', { actor: { role: 'orchestrator', name: 'orchestrator' } }))

    expect(onWorkflowProgress).toHaveBeenCalledTimes(1)
    expect(onWorkflowProgress).toHaveBeenCalledWith(progress)
    expect(ai.blocks).toEqual([])
    expect(agents).toEqual([])
  })

  it('Workflow 成员面板记录 actor.agent_id 供进度图反查 run_id', () => {
    const agents: Parameters<typeof createSseReducer>[0]['agents'] = []
    const reducer = createSseReducer({
      ai: { id: 'ai-9', role: 'ai', time: '10:08', blocks: [] },
      agents,
      selectAgent: vi.fn(),
    })
    const actor = { role: 'subagent' as const, name: 'wf-专业写作', run_id: 'run-1', agent_id: 1 }

    reducer.handle(createEvent('turn_start', { actor }))
    reducer.handle(createEvent('turn_end', { actor }))

    expect(agents).toHaveLength(1)
    expect(agents[0]).toMatchObject({ id: 'run-1', name: 'wf-专业写作', agentId: 1, status: 'done' })
  })

  describe('子代理面板的推理块与回答块收尾', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const actor = { role: 'subagent' as const, name: 'research', run_id: 'run-2' }

    /** 子代理开一个推理块和一个回答块，都还没收到 block_stop */
    function startAgent() {
      const ai: ChatMessage = { id: 'ai-10', role: 'ai', time: '10:09', blocks: [] }
      const agents: Parameters<typeof createSseReducer>[0]['agents'] = []
      const reducer = createSseReducer({ ai, agents, selectAgent: vi.fn() })
      reducer.handle(createEvent('turn_start', { actor }))
      reducer.handle(createEvent('block_start', { actor, block: { index: 0, block_type: 'thinking' } }))
      reducer.handle(createEvent('thinking_delta', { actor, block: { index: 0 }, text: '查历史工单' }))
      vi.advanceTimersByTime(2600)
      reducer.handle(createEvent('block_start', { actor, block: { index: 1, block_type: 'text' } }))
      reducer.handle(createEvent('text_delta', { actor, block: { index: 1 }, text: '找到 3 条' }))
      return { ai, agents, reducer }
    }

    it('block_stop 结束推理块并记秒数，回答块停止流式', () => {
      const { agents, reducer } = startAgent()
      expect(agents[0].stream).toEqual([
        { kind: 'think', text: '查历史工单', done: false },
        { kind: 'answer', text: '找到 3 条', streaming: true },
      ])

      reducer.handle(createEvent('block_stop', { actor, block: { index: 0 } }))
      reducer.handle(createEvent('block_stop', { actor, block: { index: 1 } }))

      expect(agents[0].stream).toEqual([
        { kind: 'think', text: '查历史工单', done: true, seconds: 3 },
        { kind: 'answer', text: '找到 3 条', streaming: false },
      ])
    })

    it('增量按块索引累加，推理和回答交替出现时各自累加到对应块', () => {
      const { agents, reducer } = startAgent()
      reducer.handle(createEvent('block_start', { actor, block: { index: 2, block_type: 'thinking' } }))
      reducer.handle(createEvent('thinking_delta', { actor, block: { index: 0 }, text: '，按时间排序' }))
      reducer.handle(createEvent('text_delta', { actor, block: { index: 1 }, text: '，均已关闭' }))

      expect(agents[0].stream.map((it) => it.kind === 'tool' ? '' : it.text)).toEqual([
        '查历史工单，按时间排序',
        '找到 3 条，均已关闭',
        '',
      ])
    })

    it('turn_end 时收尾没收到 block_stop 的推理块和回答块', () => {
      const { agents, reducer } = startAgent()
      reducer.handle(createEvent('turn_end', { actor }))

      expect(agents[0]).toMatchObject({ status: 'done', progress: 100 })
      expect(agents[0].stream).toEqual([
        { kind: 'think', text: '查历史工单', done: true, seconds: 3 },
        { kind: 'answer', text: '找到 3 条', streaming: false },
      ])
    })

    it('子代理出错时同样收尾，再追加错误卡片', () => {
      const { agents, reducer } = startAgent()
      reducer.handle(createEvent('error', {
        actor,
        error: { code: 'TOOL_FAILED', message: '检索失败', retriable: false, fatal: false },
      }))

      expect(agents[0].status).toBe('error')
      expect(agents[0].stream).toEqual([
        { kind: 'think', text: '查历史工单', done: true, seconds: 3 },
        { kind: 'answer', text: '找到 3 条', streaming: false },
        { kind: 'tool', fn: 'TOOL_FAILED', body: '检索失败', done: true, is_error: true },
      ])
    })

    it('settleStreams 同时收尾中间对话区和所有子代理面板', () => {
      const { ai, agents, reducer } = startAgent()
      reducer.handle(createEvent('block_start', { block: { index: 0, block_type: 'text' } }))
      reducer.handle(createEvent('text_delta', { block: { index: 0 }, text: '汇总中' }))

      reducer.settleStreams()

      expect(ai.blocks).toEqual([{ kind: 'answer', text: '汇总中', streaming: false }])
      expect(agents[0].stream).toEqual([
        { kind: 'think', text: '查历史工单', done: true, seconds: 3 },
        { kind: 'answer', text: '找到 3 条', streaming: false },
      ])
    })
  })
})
