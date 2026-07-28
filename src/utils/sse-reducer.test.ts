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
})
