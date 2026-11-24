import { describe, expect, it } from 'vitest'
import type { SubAgentRunResponse } from '../interfaces/console/runtime'
import { mapSubAgentRuns, mergeSubAgentRuns, subRunsForCard } from './session-runtime'

const run: SubAgentRunResponse = {
  id: 21, session_id: 42, member_name: 'explore', agent_id: null, status: 'succeeded', prompt: '任务',
  report: '真实完成报告', error_message: null,
  started_at: '2026-11-01T00:00:00Z', finished_at: '2026-11-01T00:00:01Z',
  parent_id: 'toolu_01A', turn_id: 'a1', agent_name: 'Explore', sub_run_id: 'run-21',
}

describe('会话子代理运行恢复', () => {
  it.each([['running', 'run', 0], ['succeeded', 'done', 100], ['failed', 'error', 0], ['interrupted', 'interrupted', 0]])(
    '将后端 %s 映射为 %s', (status, expected, progress) => {
      expect(mapSubAgentRuns([{ ...run, status }], 42)[0]).toMatchObject({
        id: 'run-21', pid: 'run-21', name: 'Explore', status: expected, progress,
      })
    },
  )

  it('id 直接用 sub_run_id、名字用 agent_name，并带上挂父卡的 (turn_id, parent_id)', () => {
    const agents = mapSubAgentRuns([run], 42)
    expect(agents[0]).toMatchObject({
      id: 'run-21',
      name: 'Explore',
      parentId: 'toolu_01A',
      turnId: 'a1',
      agentId: null,
    })
  })

  it('parent_id 为 null 的历史记录照常列出，不猜父卡', () => {
    const agent = mapSubAgentRuns([{ ...run, parent_id: null, turn_id: null }], 42)[0]
    expect(agent).toMatchObject({ id: 'run-21', parentId: null, turnId: null })
  })

  it('同一父卡下的多条记录全部保留，按 id 升序最后一条是当前的', () => {
    const agents = mapSubAgentRuns([
      { ...run, id: 31, sub_run_id: 'run-31', status: 'interrupted', report: null },
      { ...run, id: 32, sub_run_id: 'run-32', status: 'succeeded' },
    ], 42)
    expect(agents.map((agent) => agent.id)).toEqual(['run-31', 'run-32'])
    expect(agents.at(-1)).toMatchObject({ parentId: 'toolu_01A', status: 'done' })
  })

  it('同名运行保持独立，只展示真实报告与错误，不伪造推理和工具轨迹', () => {
    const agents = mapSubAgentRuns([run, { ...run, id: 22, sub_run_id: 'run-22', status: 'failed', report: null, error_message: '成员已停用' }], 42)
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
    const merged = mergeSubAgentRuns([existing], mapSubAgentRuns([run, { ...run, id: 22, sub_run_id: 'run-22' }], 42))
    expect(merged.map((agent) => agent.id)).toEqual(['run-21', 'run-22'])
    expect(merged[0]).toBe(existing)
    expect(merged[0]?.stream).toHaveLength(2)
  })

  it('按 (turn_id, parent_id) 挂回父卡：tool_use ID 只在一个回合内唯一', () => {
    const agents = mapSubAgentRuns([
      run,
      { ...run, id: 31, sub_run_id: 'run-31', turn_id: 'a2' },
      { ...run, id: 41, sub_run_id: 'run-41', parent_id: 'member:11' },
      { ...run, id: 42, sub_run_id: 'run-42', parent_id: null, turn_id: null },
    ], 42)

    expect(subRunsForCard(agents, 'a1', 'toolu_01A').map((agent) => agent.id)).toEqual(['run-21'])
    expect(subRunsForCard(agents, 'a2', 'toolu_01A').map((agent) => agent.id)).toEqual(['run-31'])
    // Workflow 成员按 member:{agent_id} 挂成员卡，与同名工具 ID 不混。
    expect(subRunsForCard(agents, 'a1', 'member:11').map((agent) => agent.id)).toEqual(['run-41'])
    expect(subRunsForCard(agents, 'a2', 'member:11')).toEqual([])
    // parent_id 为 null 的历史记录挂不回卡片，不猜父卡。
    expect(subRunsForCard(agents, null, null)).toEqual([])
  })
})
