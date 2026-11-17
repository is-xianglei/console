import { describe, expect, it } from 'vitest'
import type { SubAgentRunResponse } from '../interfaces/console/runtime'
import { mapSubAgentRuns, mergeSubAgentRuns } from './session-runtime'

const run: SubAgentRunResponse = {
  id: 21, session_id: 42, member_name: 'explore', status: 'succeeded', prompt: '任务',
  report: '真实完成报告', error_message: null,
  started_at: '2026-11-01T00:00:00Z', finished_at: '2026-11-01T00:00:01Z',
}

describe('会话子代理运行恢复', () => {
  it.each([['running', 'run', 0], ['succeeded', 'done', 100], ['failed', 'error', 0]])(
    '将后端 %s 映射为 %s', (status, expected, progress) => {
      expect(mapSubAgentRuns([{ ...run, status }], 42)[0]).toMatchObject({
        id: 'run-21', pid: 'run-21', name: 'explore', status: expected, progress,
      })
    },
  )

  it('同名运行保持独立，只展示真实报告与错误，不伪造推理和工具轨迹', () => {
    const agents = mapSubAgentRuns([run, { ...run, id: 22, status: 'failed', report: null, error_message: '成员已停用' }], 42)
    expect(agents.map((agent) => agent.id)).toEqual(['run-21', 'run-22'])
    expect(agents[0]?.stream).toEqual([{ kind: 'answer', text: '真实完成报告', streaming: false }])
    expect(agents[1]?.stream).toEqual([{ kind: 'tool', fn: 'ERROR', body: '成员已停用', done: true, is_error: true }])
  })

  it('失败运行没有真实错误内容时不伪造工具错误卡', () => {
    expect(mapSubAgentRuns([{ ...run, status: 'failed', report: null, error_message: null }], 42)[0])
      .toMatchObject({ status: 'error', stream: [] })
  })

  it('忽略其他会话，未知状态保守显示为排队', () => {
    expect(mapSubAgentRuns([run], 99)).toEqual([])
    expect(mapSubAgentRuns([{ ...run, status: 'unexpected', report: null }], 42)[0]).toMatchObject({
      status: 'queued', progress: 0, stream: [],
    })
  })

  it('REST 只补缺失运行，保留实时完整轨迹与对象引用', () => {
    const existing = mapSubAgentRuns([run], 42)[0]!
    existing.stream.push({ kind: 'think', text: '实时推理', done: true })
    const merged = mergeSubAgentRuns([existing], mapSubAgentRuns([run, { ...run, id: 22 }], 42))
    expect(merged.map((agent) => agent.id)).toEqual(['run-21', 'run-22'])
    expect(merged[0]).toBe(existing)
    expect(merged[0]?.stream).toHaveLength(2)
  })
})
