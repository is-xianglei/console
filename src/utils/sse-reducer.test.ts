import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, watchEffect } from 'vue'
import type { ChatMessage, SseEvent, SubAgent } from '@/interfaces/console/model'
import { createSseReducer, createStreamCursor, fmtToolCall, replaySnapshot } from './sse-reducer'

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

/** 子运行的一帧：外层固定为 subagent_event，原事件名在 sub_type。 */
function subEvent(
  sub_type: string,
  overrides: Partial<SseEvent> = {},
  run = { parent_id: 'toolu_01A', sub_run_id: 'run-1', agent_id: null as number | null, agent_name: 'general-purpose' },
): SseEvent {
  return createEvent('subagent_event', { ...run, sub_type, ...overrides })
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
  it('累加文本增量并在块结束时关闭流式状态（主线帧没有归属）', () => {
    const ai: ChatMessage = { id: 'ai-1', role: 'ai', time: '10:00', blocks: [] }
    const reducer = createSseReducer({
      ai,
      agents: [],
      selectAgent: vi.fn(),
    })

    reducer.handle(createEvent('turn_start'))
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
    ['main', false], ['main', true],
    ['sub', false], ['sub', true],
  ] as const)('%s 的工具结果 is_error=%s 会触发响应式视图更新', async (line, is_error) => {
    const ai = reactive<ChatMessage>({ id: 'ai-reactive-tools', role: 'ai', time: '10:04', blocks: [] })
    const agents = reactive<Parameters<typeof createSseReducer>[0]['agents']>([])
    const reducer = createSseReducer({ ai, agents, selectAgent: vi.fn() })
    const useFrame = (type: string, payload: Partial<SseEvent>): SseEvent => line === 'main'
      ? createEvent(type, payload)
      : subEvent(type, payload)
    const observed = vi.fn()
    const stop = watchEffect(() => {
      const items = line === 'main' ? ai.blocks : agents[0]?.stream
      observed(items?.filter((item) => item.kind === 'tool').map((item) => ({
        body: item.body, done: item.done,
        tag: 'tag' in item ? item.tag : item.is_error ? 'ERROR' : item.done ? 'RESULT' : 'TOOL',
      })))
    })

    try {
      reducer.handle(useFrame('tool_use', { tool: { id: 'tool-reactive', name: 'Search' } }))
      // 先让视图渲染运行态，避免数组 push 排队的更新掩盖 tool_result 的响应式缺口。
      await nextTick()
      expect(observed).toHaveBeenLastCalledWith([{ body: '', done: false, tag: 'TOOL' }])
      const renders = observed.mock.calls.length

      reducer.handle(useFrame('tool_result', {
        tool: { id: 'tool-reactive', name: 'Search', output: '真实工具结果', is_error },
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

  it('主线与子运行的同 id 工具调用互不匹配，重复结果不会串线', () => {
    const ai: ChatMessage = { id: 'ai-tool-scopes', role: 'ai', time: '10:04', blocks: [] }
    const agents: Parameters<typeof createSseReducer>[0]['agents'] = []
    const reducer = createSseReducer({ ai, agents, selectAgent: vi.fn() })

    reducer.handle(createEvent('tool_use', {
      tool: { id: 'shared-id', name: 'Search', input: { query: '主 Agent' } },
    }))
    reducer.handle(subEvent('turn_start', { task: '查一下' }))
    reducer.handle(subEvent('tool_use', {
      tool: { id: 'shared-id', name: 'Search', input: { query: '子 Agent' } },
    }))
    reducer.handle(subEvent('tool_result', {
      tool: { id: 'shared-id', name: 'Search', output: '子结果', is_error: false },
    }))
    // 子运行的重复结果不能因精确卡已完成而回退写入主线的同 id 卡片。
    reducer.handle(subEvent('tool_result', {
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

  it('兄弟子运行各自 index 从 0 编号，增量与工具结果都不串', () => {
    const agents: SubAgent[] = []
    const reducer = createSseReducer({
      ai: { id: 'ai-parallel', role: 'ai', time: '10:00', blocks: [] },
      agents, selectAgent: vi.fn(),
    })
    const first = { parent_id: 'member:11', sub_run_id: 'run-1', agent_id: 11, agent_name: '撰稿人' }
    const second = { parent_id: 'member:12', sub_run_id: 'run-2', agent_id: 12, agent_name: '审稿人' }

    // 文档 02a 的并行示例：两个成员的 running 节点先到，帧随后交错。
    reducer.handle(subEvent('turn_start', { task: '帮我看看这个方案' }, first))
    reducer.handle(subEvent('block_start', { block: { index: 0, block_type: 'text' } }, first))
    reducer.handle(subEvent('turn_start', { task: '帮我看看这个方案' }, second))
    reducer.handle(subEvent('block_start', { block: { index: 0, block_type: 'text' } }, second))
    reducer.handle(subEvent('text_delta', { block: { index: 0 }, text: '撰稿人的结论' }, first))
    reducer.handle(subEvent('text_delta', { block: { index: 0 }, text: '审稿人的结论' }, second))
    reducer.handle(subEvent('tool_use', { block: { index: 1 }, tool: { id: 'dup', name: 'Read', input: { path: 'a' } } }, first))
    reducer.handle(subEvent('tool_use', { block: { index: 1 }, tool: { id: 'dup', name: 'Read', input: { path: 'b' } } }, second))
    reducer.handle(subEvent('tool_result', { tool: { id: 'dup', name: 'Read', output: '甲的读取结果' } }, first))

    expect(agents.map((agent) => agent.id)).toEqual(['run-1', 'run-2'])
    expect(agents[0]?.stream).toEqual([
      { kind: 'answer', text: '撰稿人的结论', streaming: true },
      { kind: 'tool', fn: 'Read(path="a")', body: '甲的读取结果', done: true, is_error: undefined },
    ])
    expect(agents[1]?.stream).toEqual([
      { kind: 'answer', text: '审稿人的结论', streaming: true },
      { kind: 'tool', fn: 'Read(path="b")', body: '', done: false },
    ])
  })

  it('子运行面板的键与标题取外层字段，任务取 turn_start 的 task', () => {
    const agents: SubAgent[] = []
    const selectAgent = vi.fn()
    const reducer = createSseReducer({
      ai: { id: 'ai-6', role: 'ai', time: '10:05', blocks: [] },
      agents,
      selectAgent,
    })
    const run = { parent_id: 'toolu_01A', sub_run_id: 'run-1', agent_id: null, agent_name: 'general-purpose' }

    reducer.handle(subEvent('turn_start', { task: '调查振动历史' }, run))
    reducer.handle(subEvent('block_start', { block: { index: 1, block_type: 'text' } }, run))
    reducer.handle(subEvent('text_delta', { block: { index: 1 }, text: '调查完成' }, run))
    reducer.handle(subEvent('block_stop', { block: { index: 1 } }, run))
    reducer.handle(subEvent('turn_end', {}, run))

    expect(selectAgent).toHaveBeenCalledWith('run-1')
    expect(agents).toEqual([expect.objectContaining({
      id: 'run-1',
      pid: 'run-1',
      name: 'general-purpose',
      parentId: 'toolu_01A',
      agentId: null,
      task: '调查振动历史',
      status: 'done',
      progress: 100,
      stream: [{ kind: 'answer', text: '调查完成', streaming: false }],
    })])
  })

  it('Workflow 成员面板记录外层 agent_id 与 member_id 父卡', () => {
    const agents: SubAgent[] = []
    const reducer = createSseReducer({
      ai: { id: 'ai-9', role: 'ai', time: '10:08', blocks: [] },
      agents,
      selectAgent: vi.fn(),
    })
    const run = { parent_id: 'member:1', sub_run_id: 'run-1', agent_id: 1, agent_name: '专业写作' }

    reducer.handle(subEvent('turn_start', {}, run))
    reducer.handle(subEvent('turn_end', {}, run))

    expect(agents).toHaveLength(1)
    expect(agents[0]).toMatchObject({
      id: 'run-1', name: '专业写作', parentId: 'member:1', agentId: 1, status: 'done',
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
    reducer.handle(subEvent('tool_use', {
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

  it('workflow_progress 只喂进度图,不进主时间线也不建面板', () => {
    const ai: ChatMessage = { id: 'ai-8', role: 'ai', time: '10:07', blocks: [] }
    const agents: Parameters<typeof createSseReducer>[0]['agents'] = []
    const onWorkflowProgress = vi.fn()
    const reducer = createSseReducer({ ai, agents, selectAgent: vi.fn(), onWorkflowProgress })
    const progress = { phase: 'member', status: 'running', agent_id: 1, member_name: '专业写作', member_id: 'member:1', ordinal: 1, total: 2 }

    reducer.handle(createEvent('workflow_progress', { progress }))
    // 缺 progress 负载的事件同样早退,不触发回调
    reducer.handle(createEvent('workflow_progress', {}))

    expect(onWorkflowProgress).toHaveBeenCalledTimes(1)
    expect(onWorkflowProgress).toHaveBeenCalledWith(progress)
    expect(ai.blocks).toEqual([])
    expect(agents).toEqual([])
  })

  describe('子代理面板的推理块与回答块收尾', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    /** 子代理开一个推理块和一个回答块，都还没收到 block_stop */
    function startAgent() {
      const ai: ChatMessage = { id: 'ai-10', role: 'ai', time: '10:09', blocks: [] }
      const agents: Parameters<typeof createSseReducer>[0]['agents'] = []
      const reducer = createSseReducer({ ai, agents, selectAgent: vi.fn() })
      reducer.handle(subEvent('turn_start', { task: '查历史工单' }))
      reducer.handle(subEvent('block_start', { block: { index: 0, block_type: 'thinking' } }))
      reducer.handle(subEvent('thinking_delta', { block: { index: 0 }, text: '查历史工单' }))
      vi.advanceTimersByTime(2600)
      reducer.handle(subEvent('block_start', { block: { index: 1, block_type: 'text' } }))
      reducer.handle(subEvent('text_delta', { block: { index: 1 }, text: '找到 3 条' }))
      return { ai, agents, reducer }
    }

    it('block_stop 结束推理块并记秒数，回答块停止流式', () => {
      const { agents, reducer } = startAgent()
      expect(agents[0].stream).toEqual([
        { kind: 'think', text: '查历史工单', done: false },
        { kind: 'answer', text: '找到 3 条', streaming: true },
      ])

      reducer.handle(subEvent('block_stop', { block: { index: 0 } }))
      reducer.handle(subEvent('block_stop', { block: { index: 1 } }))

      expect(agents[0].stream).toEqual([
        { kind: 'think', text: '查历史工单', done: true, seconds: 3 },
        { kind: 'answer', text: '找到 3 条', streaming: false },
      ])
    })

    it('增量按块索引累加，推理和回答交替出现时各自累加到对应块', () => {
      const { agents, reducer } = startAgent()
      reducer.handle(subEvent('block_start', { block: { index: 2, block_type: 'thinking' } }))
      reducer.handle(subEvent('thinking_delta', { block: { index: 0 }, text: '，按时间排序' }))
      reducer.handle(subEvent('text_delta', { block: { index: 1 }, text: '，均已关闭' }))

      expect(agents[0].stream.map((it) => it.kind === 'tool' ? '' : it.text)).toEqual([
        '查历史工单，按时间排序',
        '找到 3 条，均已关闭',
        '',
      ])
    })

    it('turn_end 时收尾没收到 block_stop 的推理块和回答块', () => {
      const { agents, reducer } = startAgent()
      reducer.handle(subEvent('turn_end'))

      expect(agents[0]).toMatchObject({ status: 'done', progress: 100 })
      expect(agents[0].stream).toEqual([
        { kind: 'think', text: '查历史工单', done: true, seconds: 3 },
        { kind: 'answer', text: '找到 3 条', streaming: false },
      ])
    })

    it('子代理出错时同样收尾，再追加错误卡片', () => {
      const { agents, reducer } = startAgent()
      reducer.handle(subEvent('error', {
        error: { code: 'SUBAGENT_RUN_FAILED', message: '检索失败', retriable: false, fatal: true },
      }))

      expect(agents[0].status).toBe('error')
      expect(agents[0].stream).toEqual([
        { kind: 'think', text: '查历史工单', done: true, seconds: 3 },
        { kind: 'answer', text: '找到 3 条', streaming: false },
        { kind: 'tool', fn: 'SUBAGENT_RUN_FAILED', body: '检索失败', done: true, is_error: true },
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

/** 文档第 2～3、8 节的示例帧，原样作夹具（ID 换成短值）。 */
describe('契约示例：续跑折叠', () => {
  function setup() {
    const ai: ChatMessage = { id: 'ai-fold', role: 'ai', time: '10:00', blocks: [] }
    const agents = reactive<SubAgent[]>([])
    const reducer = createSseReducer({ ai, agents, selectAgent: vi.fn() })
    return { ai, agents, reducer }
  }

  it('丢掉水位到 run_started 之间建块的半截内容，保留已落库的块再接着渲染', () => {
    const { ai, reducer } = setup()
    reducer.handle({ type: 'block_start', session_id: 101, sequence: 5, block: { index: 0, block_type: 'text' } })
    reducer.handle({ type: 'text_delta', session_id: 101, sequence: 6, block: { index: 0 }, text: '已落库' })
    reducer.handle({ type: 'block_stop', session_id: 101, sequence: 7, block: { index: 0 } })
    reducer.handle({ type: 'block_start', session_id: 101, sequence: 11, block: { index: 1, block_type: 'thinking' } })
    reducer.handle({ type: 'thinking_delta', session_id: 101, sequence: 12, block: { index: 1 }, text: '半截推理' })

    // {"type": "run_started", "sequence": 65} + {"type": "run_resumed", "attempt": 2, "watermark": 10, "sequence": 66}
    reducer.fold(65, 10)
    reducer.handle({ type: 'turn_start', session_id: 101, sequence: 66 })
    reducer.handle({ type: 'block_start', session_id: 101, sequence: 67, block: { index: 0, block_type: 'text' } })
    reducer.handle({ type: 'text_delta', session_id: 101, sequence: 68, block: { index: 0 }, text: '续跑' })

    expect(ai.blocks).toEqual([
      { kind: 'answer', text: '已落库', streaming: false },
      { kind: 'answer', text: '续跑', streaming: true },
    ])
  })

  it('保留下来的工具卡只清掉落在区间里的结果，续跑的结果照常回填', () => {
    const { ai, reducer } = setup()
    reducer.handle({ type: 'tool_use', session_id: 101, sequence: 3, tool: { id: 'b1', name: 'Bash', input: { command: 'ls' } } })
    reducer.handle({ type: 'tool_result', session_id: 101, sequence: 9, tool: { id: 'b1', name: 'Bash', output: '半截输出' } })
    reducer.handle({ type: 'tool_use', session_id: 101, sequence: 4, tool: { id: 'b2', name: 'Read', input: { path: 'a' } } })
    reducer.handle({ type: 'tool_result', session_id: 101, sequence: 4, tool: { id: 'b2', name: 'Read', output: '已落库结果' } })

    reducer.fold(20, 4)
    expect(ai.blocks).toEqual([
      expect.objectContaining({ fn: 'Bash(command="ls")', tag: 'TOOL', body: '', done: false }),
      expect.objectContaining({ fn: 'Read(path="a")', tag: 'RESULT', body: '已落库结果', done: true }),
    ])

    reducer.handle({ type: 'tool_result', session_id: 101, sequence: 22, tool: { id: 'b1', name: 'Bash', output: '重跑结果' } })
    expect(ai.blocks?.[0]).toMatchObject({ tag: 'RESULT', body: '重跑结果', done: true })
  })

  it('Workflow 回合按 sub_run_watermarks 折叠：已结束成员保留，没结束的成员半截删除并收口', () => {
    const { agents, reducer } = setup()
    const first = { parent_id: 'member:1', sub_run_id: 'run-1', agent_id: 1, agent_name: '甲' }
    const second = { parent_id: 'member:2', sub_run_id: 'run-2', agent_id: 2, agent_name: '乙' }
    reducer.handle({ type: 'subagent_event', sub_type: 'turn_start', session_id: 101, sequence: 2, ...second })
    reducer.handle({ type: 'subagent_event', sub_type: 'block_start', session_id: 101, sequence: 4, ...second, block: { index: 0, block_type: 'text' } })
    reducer.handle({ type: 'subagent_event', sub_type: 'text_delta', session_id: 101, sequence: 5, ...second, block: { index: 0 }, text: '乙的半截' })
    reducer.handle({ type: 'subagent_event', sub_type: 'turn_start', session_id: 101, sequence: 6, ...first })
    reducer.handle({ type: 'subagent_event', sub_type: 'block_start', session_id: 101, sequence: 7, ...first, block: { index: 0, block_type: 'text' } })
    reducer.handle({ type: 'subagent_event', sub_type: 'text_delta', session_id: 101, sequence: 8, ...first, block: { index: 0 }, text: '甲的结论' })
    reducer.handle({ type: 'subagent_event', sub_type: 'block_stop', session_id: 101, sequence: 9, ...first, block: { index: 0 } })
    reducer.handle({ type: 'subagent_event', sub_type: 'turn_end', session_id: 101, sequence: 10, ...first })

    // {"type": "run_resumed", "attempt": 2, "watermark": 9, "sub_run_watermarks": {"run-1": 9, "run-2": 0}, "sequence": 12}
    reducer.fold(11, 9, { 'run-1': 9, 'run-2': 0 })
    expect(agents.find((agent) => agent.id === 'run-1')?.stream).toEqual([{ kind: 'answer', text: '甲的结论', streaming: false }])
    expect(agents.find((agent) => agent.id === 'run-2')?.stream).toEqual([])
    // 上次执行里没结束的子运行一律收口，记录本身保留。
    expect(agents.find((agent) => agent.id === 'run-2')?.status).toBe('interrupted')
    expect(agents.find((agent) => agent.id === 'run-1')?.status).toBe('done')
  })

  it('只认 watermark 时并行成员的半截会留下：sub_run_watermarks 必须覆盖 watermark', () => {
    const { agents, reducer } = setup()
    const second = { parent_id: 'member:2', sub_run_id: 'run-2', agent_id: 2, agent_name: '乙' }
    reducer.handle({ type: 'subagent_event', sub_type: 'block_start', session_id: 101, sequence: 4, ...second, block: { index: 0, block_type: 'text' } })
    reducer.handle({ type: 'subagent_event', sub_type: 'text_delta', session_id: 101, sequence: 5, ...second, block: { index: 0 }, text: '乙的半截' })
    reducer.fold(11, 9)
    expect(agents[0]?.stream).toHaveLength(1)
    reducer.fold(11, 9, { 'run-2': 0 })
    expect(agents[0]?.stream).toEqual([])
  })

  it('收到 run_end 时把还没结束的子运行收口：只改状态，不动块', () => {
    const { agents, reducer } = setup()
    const run = { parent_id: 'toolu_01A', sub_run_id: 'run-1', agent_id: null, agent_name: 'Explore' }
    reducer.handle({ type: 'subagent_event', sub_type: 'turn_start', session_id: 101, sequence: 4, ...run })
    reducer.handle({ type: 'subagent_event', sub_type: 'block_start', session_id: 101, sequence: 5, ...run, block: { index: 0, block_type: 'text' } })
    reducer.handle({ type: 'subagent_event', sub_type: 'text_delta', session_id: 101, sequence: 6, ...run, block: { index: 0 }, text: '进行中' })

    reducer.interruptAgents()

    expect(agents[0]).toMatchObject({ status: 'interrupted' })
    expect(agents[0]?.stream).toEqual([{ kind: 'answer', text: '进行中', streaming: false }])
    // 已经结束的子运行不受影响。
    reducer.handle({ type: 'subagent_event', sub_type: 'turn_end', session_id: 101, sequence: 7, ...run })
    expect(agents[0]?.status).toBe('done')
    reducer.interruptAgents()
    expect(agents[0]?.status).toBe('done')
  })

  it('errors 不在折叠范围内', () => {
    const { ai, reducer } = setup()
    reducer.handle({ type: 'error', session_id: 101, sequence: 15, error: { code: 'TURN_FAILED', message: '暂时失败', retriable: true, fatal: false } })
    reducer.fold(20, 4)
    expect(ai.blocks).toEqual([expect.objectContaining({ tag: 'ERROR', body: '暂时失败' })])
  })
})

describe('契约示例：需要人工处理', () => {
  it('TURN_NEEDS_ATTENTION 挂一张提示卡，不当作普通错误', () => {
    const ai: ChatMessage = { id: 'ai-attention', role: 'ai', time: '10:00', blocks: [] }
    const calls = [{ tool_use_id: 'b1', tool_name: 'Bash', source: null, status: 'unknown', input_summary: '{"command":"rm -rf build","timeout":30}', started_at: '2026-11-19T12:26:37.947381Z', sub_run_id: null }]
    const reducer = createSseReducer({ ai, agents: [], selectAgent: vi.fn(), attentionCalls: () => calls })
    reducer.handle({ type: 'error', session_id: 101, sequence: 134, error: { code: 'TURN_NEEDS_ATTENTION', message: '工具 Bash 执行中断，结果未知，未自动重试', retriable: false, fatal: true } })
    reducer.markAttention()
    expect(ai.blocks).toEqual([{ kind: 'attention', message: '工具 Bash 执行中断，结果未知，未自动重试', calls }])
  })
})

describe('契约示例：快照回放', () => {
  it('读 main、sub_runs 与 errors，主线块按 segment 换段、子运行按 sub_run_id 分面板', () => {
    const ai: ChatMessage = { id: 'ai-snapshot', role: 'ai', time: '10:00', blocks: [] }
    const agents: SubAgent[] = []
    const reducer = createSseReducer({ ai, agents, selectAgent: vi.fn() })
    // 文档 02b 的第一个示例：主 Agent 回合，子代理正文流到一半。
    const snapshot = {
      turn_id: 'a1',
      status: 'running',
      last_offset: 18,
      truncated: false,
      errors: [],
      main: {
        segment: 1,
        in_turn: true,
        usage: null,
        stop_reason: null,
        blocks: [
          { segment: 1, index: 0, kind: 'text', text: '我派一个子代理去查', closed: true, tool: null, result: null, sequence: 6, result_sequence: null },
          { segment: 1, index: 1, kind: 'tool_use', text: '', closed: true, tool: { id: 'toolu_01A', name: 'Agent', input: { agent_type: 'general-purpose', prompt: '查一下北京天气' } }, result: null, sequence: 9, result_sequence: null },
        ],
      },
      sub_runs: [{
        sub_run_id: 'run-1',
        parent_id: 'toolu_01A',
        agent_id: null,
        agent_name: 'general-purpose',
        task: '查一下北京天气',
        in_turn: true,
        usage: null,
        stop_reason: null,
        errors: [],
        blocks: [
          { index: 0, kind: 'tool_use', text: '', closed: true, tool: { id: 'toolu_S1', name: 'Weather', input: { city: '北京' } }, result: { id: 'toolu_S1', name: 'Weather', output: '北京 - 晴朗☀️', is_error: false }, sequence: 13, result_sequence: 16 },
          { index: 1, kind: 'text', text: '北京晴朗', closed: false, tool: null, result: null, sequence: 17, result_sequence: null },
        ],
      }],
    }

    replaySnapshot(snapshot, reducer.handle, 101, 'a1')

    expect(ai.blocks).toEqual([
      { kind: 'answer', text: '我派一个子代理去查', streaming: false },
      expect.objectContaining({ kind: 'tool', tag: 'SPAWN', fn: 'Agent(agent_type="general-purpose", prompt="查一下北京天气")', done: false }),
    ])
    expect(agents).toHaveLength(1)
    expect(agents[0]).toMatchObject({
      id: 'run-1',
      name: 'general-purpose',
      parentId: 'toolu_01A',
      task: '查一下北京天气',
      agentId: null,
      status: 'run',
    })
    expect(agents[0]?.stream).toEqual([
      { kind: 'tool', fn: 'Weather(city="北京")', body: '北京 - 晴朗☀️', done: true, is_error: false },
      { kind: 'answer', text: '北京晴朗', streaming: true },
    ])
  })

  it('并行 Workflow 快照：三个成员各占一个面板，已结束的成员带 turn_end', () => {
    const ai: ChatMessage = { id: 'ai-wf', role: 'ai', time: '10:00', blocks: [] }
    const agents: SubAgent[] = []
    const reducer = createSseReducer({ ai, agents, selectAgent: vi.fn() })
    const run = (id: string, agentId: number, name: string, text: string, inTurn: boolean) => ({
      sub_run_id: id,
      parent_id: `member:${agentId}`,
      agent_id: agentId,
      agent_name: name,
      task: '帮我看看这个方案',
      in_turn: inTurn,
      usage: null,
      stop_reason: inTurn ? null : 'end_turn',
      errors: [],
      blocks: [{ index: 0, kind: 'text', text, closed: !inTurn, tool: null, result: null, sequence: 8, result_sequence: null }],
    })
    replaySnapshot({
      main: { segment: 1, in_turn: true, usage: null, stop_reason: null, blocks: [] },
      sub_runs: [run('run-1', 11, '撰稿人', '撰稿人的结论', false), run('run-2', 12, '审稿人', '审稿人的结论', true)],
      errors: [],
    }, reducer.handle, 101, 'a5')

    expect(agents.map((agent) => [agent.id, agent.parentId, agent.status])).toEqual([
      ['run-1', 'member:11', 'done'],
      ['run-2', 'member:12', 'run'],
    ])
    expect(agents[0]?.stream).toEqual([{ kind: 'answer', text: '撰稿人的结论', streaming: false }])
  })

  it('主线错误来自 state.errors，子运行的错误来自各自 sub_runs[].errors', () => {
    const ai: ChatMessage = { id: 'ai-errors', role: 'ai', time: '10:00', blocks: [] }
    const agents: SubAgent[] = []
    const reducer = createSseReducer({ ai, agents, selectAgent: vi.fn() })
    replaySnapshot({
      main: { segment: 1, in_turn: false, usage: null, stop_reason: 'failed', blocks: [] },
      sub_runs: [{
        sub_run_id: 'run-1', parent_id: 'toolu_01A', agent_id: null, agent_name: 'general-purpose', task: '查',
        in_turn: false, usage: null, stop_reason: null,
        errors: [{ sequence: 10, error: { code: 'SUBAGENT_RUN_FAILED', message: '子代理模型不可用', retriable: false, fatal: true } }],
        blocks: [],
      }],
      errors: [{ sequence: 12, error: { code: 'TURN_FAILED', message: '本轮处理失败，请稍后重试', retriable: false, fatal: true } }],
    }, reducer.handle, 101, 'a1')

    expect(ai.blocks).toEqual([expect.objectContaining({ tag: 'ERROR', body: '本轮处理失败，请稍后重试' })])
    expect(agents[0]?.status).toBe('error')
    expect(agents[0]?.stream).toEqual([expect.objectContaining({ fn: 'SUBAGENT_RUN_FAILED', body: '子代理模型不可用', is_error: true })])
  })

  it('队友激活流只有主线：读 state.main，不会建子代理面板', () => {
    const ai: ChatMessage = { id: 'ai-team', role: 'ai', time: '10:00', blocks: [] }
    const agents: SubAgent[] = []
    const reducer = createSseReducer({ ai, agents, selectAgent: vi.fn() })
    replaySnapshot({
      main: { segment: 1, in_turn: true, blocks: [{ segment: 1, index: 0, kind: 'text', text: '初稿第一段', closed: true, sequence: 2 }] },
      errors: [],
    }, reducer.handle, 42, 'a-1')

    expect(ai.blocks).toEqual([{ kind: 'answer', text: '初稿第一段', streaming: false }])
    expect(agents).toEqual([])
  })
})

describe('契约示例：事件流去重与跟随', () => {
  it('按当前回合 + sequence 去重，跳号正常', () => {
    const cursor = createStreamCursor()
    const frames: SseEvent[] = [
      { type: 'run_started', turn_id: 'a0', session_id: 101, sequence: 1 },
      { type: 'session_ready', data: { session_id: 101, title: '查天气', status: 'running' }, sequence: 2 },
      { type: 'turn_start', session_id: 101, sequence: 4 },
      { type: 'turn_start', session_id: 101, sequence: 4 },
      { type: 'turn_end', session_id: 101, sequence: 8, stop_reason: 'stop' },
      { type: 'run_end', turn_id: 'a0', status: 'completed', sequence: 65 },
    ]
    expect(frames.map((frame) => cursor.accept(frame))).toEqual([true, true, true, false, true, true])
    expect(cursor.turnId).toBe('a0')
  })

  it('run_snapshot 以快照覆盖到的位置为准，之前的帧丢弃', () => {
    const cursor = createStreamCursor('a1')
    expect(cursor.accept({ type: 'input_queued', session_id: 101, turn_id: 'a1', input_id: 7 })).toBe(true)
    expect(cursor.accept({ type: 'run_snapshot', turn_id: 'a1', state: {}, sequence: 6 })).toBe(true)
    expect(cursor.accept({ type: 'text_delta', session_id: 101, sequence: 6, block: { index: 0 }, text: '旧' })).toBe(false)
    expect(cursor.accept({ type: 'text_delta', session_id: 101, sequence: 7, block: { index: 0 }, text: '晴。' })).toBe(true)
  })

  it('run_switched 切换跟随的回合，sequence 从 0 重新计；随后的空快照以帧顶层的 turn_id 为准', () => {
    const cursor = createStreamCursor()
    const frames: SseEvent[] = [
      { type: 'input_queued', session_id: 101, turn_id: 'a1', input_id: 7 },
      { type: 'run_snapshot', turn_id: 'a1', state: {}, sequence: 4 },
      { type: 'turn_end', session_id: 101, sequence: 5, stop_reason: 'end_turn' },
      { type: 'run_end', turn_id: 'a1', status: 'completed', sequence: 65 },
      { type: 'run_switched', session_id: 101, turn_id: 'b2', input_id: 7, previous_turn_id: 'a1' },
      { type: 'run_snapshot', turn_id: 'b2', state: { turn_id: null, status: null, last_offset: 0, main: { segment: 0, in_turn: false, blocks: [] }, sub_runs: [] }, sequence: 0 },
      { type: 'run_started', turn_id: 'b2', session_id: 101, sequence: 1 },
      { type: 'session_ready', data: { session_id: 101, title: '团队', status: 'running' }, sequence: 2 },
      { type: 'turn_end', session_id: 101, sequence: 5, stop_reason: 'end_turn' },
      { type: 'run_end', turn_id: 'b2', status: 'completed', sequence: 65 },
    ]
    expect(frames.map((frame) => cursor.accept(frame))).toEqual(frames.map(() => true))
    expect(cursor.turnId).toBe('b2')
  })

  it('记下紧挨 run_resumed 的 run_started 位置作折叠起点；之前没有 run_end 也照常接受', () => {
    const cursor = createStreamCursor('d4')
    cursor.accept({ type: 'run_started', turn_id: 'd4', session_id: 101, sequence: 1 })
    cursor.accept({ type: 'text_delta', session_id: 101, sequence: 12, block: { index: 0 }, text: '半截' })
    expect(cursor.accept({ type: 'run_started', turn_id: 'd4', session_id: 101, sequence: 65 })).toBe(true)
    expect(cursor.accept({ type: 'run_resumed', turn_id: 'd4', attempt: 2, watermark: 10, sequence: 66 })).toBe(true)
    expect(cursor.runStartedAt).toBe(65)
  })
})
