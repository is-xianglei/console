import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage, SseEvent } from '@/interfaces/console/model'
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
      { kind: 'think', text: '正在分析', duration: '推理完成', collapsed: true },
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
      stream: [{ kind: 'answer', text: '调查完成' }],
    })])
  })

  it('编排叶子面板用 Agent 名作标题并按节点键归并', () => {
    const agents: Parameters<typeof createSseReducer>[0]['agents'] = []
    const onNodeEvent = vi.fn()
    const reducer = createSseReducer({
      ai: { id: 'ai-7', role: 'ai', time: '10:06', blocks: [] },
      agents,
      selectAgent: vi.fn(),
      onNodeEvent,
    })
    const nodeKey = '335e31a7:内容生产流水线/n1_专业评审'
    // 顺序编排的 task 是渲染后的完整 instruction,带上游全文,不能拿来当标题:
    // 三个成员的面板会长得几乎一样,且看不出是哪个 Agent。
    const actor = {
      role: 'subagent' as const,
      name: '专业评审',
      run_id: nodeKey,
      task: '任务:介绍工业物联网。\n\n上游产出:\n(此处是上游整篇初稿)',
    }

    reducer.handle(createEvent('node_start', {
      actor: { role: 'subagent' as const, name: '内容生产流水线', run_id: nodeKey },
      node: { path: '内容生产流水线/n1_专业评审', name: '专业评审', kind: 'leaf' },
    }))
    reducer.handle(createEvent('turn_start', { actor }))
    reducer.handle(createEvent('block_start', { actor, block: { index: 0, block_type: 'text' } }))
    reducer.handle(createEvent('text_delta', { actor, block: { index: 0 }, text: '结构清晰' }))

    // node 事件只喂执行图:一旦流进右栏就会以方案名抢先建面板并占住标题
    expect(onNodeEvent).toHaveBeenCalledTimes(1)
    expect(agents).toHaveLength(1)
    expect(agents[0]).toMatchObject({
      id: nodeKey,
      name: '专业评审',
      stream: [{ kind: 'answer', text: '结构清晰' }],
    })
  })
})
