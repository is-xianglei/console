import { describe, expect, it } from 'vitest'
import type { SubAgent, WorkflowMemberProgress, WorkflowProgressState } from '@/interfaces/console/model'
import type { WorkflowResponse } from '@/interfaces/workflow/api'
import {
  deriveWorkflowEdgeActive,
  deriveWorkflowStatusText,
  deriveWorkflowStepBadge,
  resolveWorkflowRuntime,
} from './runtime'
import { buildWorkflowTopology } from './topology'

function workflow(mode: WorkflowResponse['mode'], agents: Array<[number, string | null]>): WorkflowResponse {
  return {
    id: 1,
    workspace_id: 1,
    name: '写作-评审流水线',
    description: null,
    mode,
    is_enabled: true,
    created_by_user_id: 1,
    // 数组故意倒序,sort_order 仍按入参顺序递增,验证拓扑按 sort_order 重排
    agents: agents.map(([agentId, name], index) => ({
      agent_id: agentId,
      agent_name: name,
      sort_order: index,
    })).reverse(),
    created_at: '2026-09-04T00:00:00Z',
    updated_at: '2026-09-04T00:00:00Z',
  }
}

function progress(overrides: Partial<WorkflowProgressState> = {}): WorkflowProgressState {
  return { members: {}, routing: null, routedAgentId: null, merging: null, ...overrides }
}

/** 挂在成员卡 member:{agentId} 下的子运行面板；id 是 sub_run_id。 */
function panel(runId: string, agentId: number): SubAgent {
  return {
    id: runId, pid: runId, name: `wf-${agentId}`, icon: 'bot', status: 'run', progress: 50, stream: [], agentId,
    parentId: `member:${agentId}`,
  }
}

function member(agentId: number, name: string, status: 'running' | 'done' | 'failed', extra: Partial<WorkflowMemberProgress> = {}): WorkflowMemberProgress {
  return { memberId: `member:${agentId}`, agentId, memberName: name, status, ...extra }
}

describe('buildWorkflowTopology', () => {
  it('顺序模式是 start→成员链→end,成员键用 agent_id', () => {
    const topo = buildWorkflowTopology(workflow('sequential', [[1, '专业写作'], [2, '专业评审']]))
    expect(topo.nodes.map((node) => node.id)).toEqual(['start', 'm1', 'm2', 'end'])
    expect(topo.edges.map((edge) => edge.id)).toEqual(['e-start-m1', 'e-m1-m2', 'e-m2-end'])
    expect(topo.nodes[1].data).toMatchObject({ kind: 'member', agentId: 1, label: '专业写作', disabled: false })
  })

  it('并行模式经「汇总结果」收束,智能路由模式起点后加路由节点且成员直连终点', () => {
    const parallel = buildWorkflowTopology(workflow('parallel', [[1, 'A'], [2, 'B']]))
    expect(parallel.nodes.map((node) => node.id)).toEqual(['start', 'm1', 'm2', 'join', 'end'])
    expect(parallel.edges.map((edge) => edge.id)).toEqual([
      'e-start-m1', 'e-m1-join', 'e-start-m2', 'e-m2-join', 'e-join-end',
    ])

    const routing = buildWorkflowTopology(workflow('llm_routing', [[1, 'A'], [2, 'B']]))
    expect(routing.nodes.map((node) => node.id)).toEqual(['start', 'router', 'm1', 'm2', 'end'])
    expect(routing.edges.map((edge) => edge.id)).toEqual([
      'e-start-router', 'e-router-m1', 'e-m1-end', 'e-router-m2', 'e-m2-end',
    ])
    expect(routing.nodes[1].data.label).toBe('智能路由')
  })

  it('已软删的成员标 disabled 并用占位名', () => {
    const topo = buildWorkflowTopology(workflow('sequential', [[1, '专业写作'], [2, null]]))
    expect(topo.nodes[2].data).toMatchObject({ agentId: 2, label: '已删除的 Agent', disabled: true })
  })
})

describe('resolveWorkflowRuntime / deriveWorkflowEdgeActive', () => {
  it('顺序模式:成员状态按 member_id 取,runId 取挂在成员卡下的子运行,边随前驱完成逐段点亮', () => {
    const topo = buildWorkflowTopology(workflow('sequential', [[1, 'A'], [2, 'B']]))
    const state = progress({
      members: {
        'member:1': member(1, 'A', 'done', { ordinal: 1, total: 2 }),
        'member:2': member(2, 'B', 'running', { ordinal: 2, total: 2 }),
      },
    })
    const runtime = resolveWorkflowRuntime(topo.nodes, state, [panel('run-1', 1), panel('run-2', 2)])
    expect(runtime.m1).toEqual({ status: 'completed', runId: 'run-1' })
    expect(runtime.m2).toEqual({ status: 'running', runId: 'run-2' })
    expect(runtime.start).toBeUndefined()

    const active = deriveWorkflowEdgeActive(topo.nodes, topo.edges, runtime, null)
    expect(active).toEqual({ 'e-start-m1': true, 'e-m1-m2': true, 'e-m2-end': false })
    expect(deriveWorkflowStepBadge(state)).toBe('2/2')
    expect(deriveWorkflowStatusText(topo.nodes, runtime, state)).toBe('B · 执行中')
  })

  it('同一成员卡下续跑重跑的多条子运行全部保留，最后一条是当前的；别家成员的面板不串', () => {
    const topo = buildWorkflowTopology(workflow('sequential', [[1, 'A'], [2, 'B']]))
    const state = progress({ members: { 'member:1': member(1, 'A', 'done') } })
    const runtime = resolveWorkflowRuntime(topo.nodes, state, [
      panel('run-11', 1), panel('run-12', 1), panel('run-21', 2),
    ])
    expect(runtime.m1).toEqual({ status: 'completed', runId: 'run-12' })
    expect(runtime.m2).toEqual({ status: 'pending', runId: null })
  })

  it('智能路由:只有命中成员的入边点亮,其余成员保持 pending', () => {
    const topo = buildWorkflowTopology(workflow('llm_routing', [[1, 'A'], [2, 'B']]))
    const state = progress({
      routing: 'done',
      routedAgentId: 2,
      members: { 'member:2': member(2, 'B', 'done') },
    })
    const runtime = resolveWorkflowRuntime(topo.nodes, state, [])
    expect(runtime.router).toEqual({ status: 'completed', runId: null })
    expect(runtime.m1).toEqual({ status: 'pending', runId: null })

    const active = deriveWorkflowEdgeActive(topo.nodes, topo.edges, runtime, 2)
    expect(active).toEqual({
      'e-start-router': true,
      'e-router-m1': false,
      'e-m1-end': false,
      'e-router-m2': true,
      'e-m2-end': true,
    })
    expect(deriveWorkflowStatusText(topo.nodes, runtime, state)).toBe('编排已完成')
    expect(deriveWorkflowStepBadge(state)).toBeNull()
  })

  it('并行模式:汇聚节点取 merging 阶段,失败成员优先反映到状态条', () => {
    const topo = buildWorkflowTopology(workflow('parallel', [[1, 'A'], [2, 'B']]))
    const running = progress({
      members: {
        'member:1': member(1, 'A', 'done'),
        'member:2': member(2, 'B', 'failed'),
      },
      merging: 'running',
    })
    const runtime = resolveWorkflowRuntime(topo.nodes, running, [])
    expect(runtime.join).toEqual({ status: 'running', runId: null })
    const active = deriveWorkflowEdgeActive(topo.nodes, topo.edges, runtime, null)
    expect(active['e-m1-join']).toBe(true)
    expect(active['e-m2-join']).toBe(false)
    expect(active['e-join-end']).toBe(false)
    expect(deriveWorkflowStatusText(topo.nodes, runtime, running)).toBe('汇总结果 · 进行中')

    const failed = progress({ ...running, merging: 'failed' })
    expect(deriveWorkflowStatusText(topo.nodes, resolveWorkflowRuntime(topo.nodes, failed, []), failed))
      .toBe('B · 已失败')
  })

  it('无任何事件时全部 pending、状态条为等待开始', () => {
    const topo = buildWorkflowTopology(workflow('sequential', [[1, 'A']]))
    const runtime = resolveWorkflowRuntime(topo.nodes, progress(), [])
    expect(runtime.m1).toEqual({ status: 'pending', runId: null })
    expect(deriveWorkflowStatusText(topo.nodes, runtime, progress())).toBe('等待开始')
  })
})
