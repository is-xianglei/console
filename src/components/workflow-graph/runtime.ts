import type { SubAgent, WorkflowProgressState } from '@/interfaces/console/model'
import type { TopoNode, WfStatus } from './types'

/** 状态文案。pending 是"无进度事件"推出来的，不是后端下发的枚举值。 */
export const STATUS_LABEL: Record<WfStatus, string> = {
  pending: '未开始',
  running: '执行中',
  completed: '已完成',
  suspended: '等待审批',
  failed: '已失败',
  escalated: '已升级',
}

/** 成员节点解析出的运行时快照，供节点与边共同消费。 */
export interface MemberRuntime {
  status: WfStatus
  runId: string | null
}

/** 节点跑过（不再是 pending）即视为其入边已走通。 */
function isVisited(status: WfStatus): boolean {
  return status !== 'pending'
}

// ===== Workflow 进度图（数据源是 workflow_progress 事件，按 agent_id 归并） =====

/** 后端进度状态 → 图状态。done 对应 completed；取消不会下发事件，节点停在 running 直到本地重置。 */
function workflowStatusOf(status: 'running' | 'done' | 'failed' | null | undefined): WfStatus {
  if (status === 'running') return 'running'
  if (status === 'done') return 'completed'
  if (status === 'failed') return 'failed'
  return 'pending'
}

/** 把 Workflow 进度按节点 id 解析成运行时表：成员看 members[agent_id]，
 *  「智能路由」节点看 routing，「汇总结果」节点看 merging；起点/终点没有自身状态。
 *  runId 从右栏面板反查：成员以 SubAgent 运行，面板 agentId 即事件 actor.agent_id，
 *  面板 id 即 run_id。同一成员多轮会话只会有当前轮的面板（dispatch 每轮清空）。 */
export function resolveWorkflowRuntime(
  nodes: TopoNode[],
  progress: WorkflowProgressState,
  agents: SubAgent[],
): Record<string, MemberRuntime> {
  const result: Record<string, MemberRuntime> = {}
  for (const node of nodes) {
    if (node.data.kind === 'member') {
      if (node.data.agentId == null) continue
      const member = progress.members[node.data.agentId]
      const panel = agents.find((agent) => agent.agentId === node.data.agentId)
      result[node.id] = {
        status: workflowStatusOf(member?.status),
        runId: panel?.id ?? null,
      }
    } else if (node.data.kind === 'router') {
      result[node.id] = { status: workflowStatusOf(progress.routing), runId: null }
    } else if (node.data.kind === 'join') {
      result[node.id] = { status: workflowStatusOf(progress.merging), runId: null }
    }
  }
  return result
}

/** Workflow 图的边点亮规则：
 *  - 路由/汇聚节点有自己的状态（routing / merging 阶段），直接取用；
 *  - llm_routing 只运行命中的成员，router→成员 的边仅 routedAgentId 那条点亮。 */
export function deriveWorkflowEdgeActive(
  nodes: TopoNode[],
  edges: { id: string; source: string; target: string }[],
  runtime: Record<string, MemberRuntime>,
  routedAgentId: number | null,
): Record<string, boolean> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const statusOf = (id: string): WfStatus => runtime[id]?.status ?? 'pending'
  const result: Record<string, boolean> = {}
  for (const edge of edges) {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) {
      result[edge.id] = false
      continue
    }
    if (source.data.kind === 'router' && target.data.kind === 'member') {
      result[edge.id] = routedAgentId != null && target.data.agentId === routedAgentId
        && isVisited(statusOf(target.id))
      continue
    }
    if (source.data.kind === 'anchor-start') {
      // 起点→首个有状态节点：目标跑过即走通
      result[edge.id] = isVisited(statusOf(target.id))
      continue
    }
    if (target.data.kind === 'anchor-end') {
      result[edge.id] = statusOf(source.id) === 'completed'
      continue
    }
    // 成员→汇聚、成员→成员：前驱 completed 且目标跑过
    result[edge.id] = statusOf(source.id) === 'completed' && isVisited(statusOf(target.id))
  }
  return result
}

/** Workflow 底部状态条文案：优先报正在执行/失败的节点，全部完成后按终态收口。 */
export function deriveWorkflowStatusText(
  nodes: TopoNode[],
  runtime: Record<string, MemberRuntime>,
  progress: WorkflowProgressState,
): string {
  const statusOf = (id: string): WfStatus => runtime[id]?.status ?? 'pending'
  const members = nodes.filter((node) => node.data.kind === 'member')
  const pick = (status: WfStatus) => members.find((node) => statusOf(node.id) === status)

  if (progress.routing === 'running') return '智能路由 · 判定中'
  const running = pick('running')
  if (running) return `${running.data.label} · 执行中`
  if (progress.merging === 'running') return '汇总结果 · 进行中'
  if (progress.routing === 'failed') return '智能路由 · 已失败'
  const failed = pick('failed')
  if (failed) return `${failed.data.label} · 已失败`
  if (progress.merging === 'failed') return '汇总结果 · 已失败'
  if (progress.merging === 'done') return '编排已完成'
  if (members.length && members.every((node) => statusOf(node.id) === 'completed')) {
    return '编排已完成'
  }
  if (progress.routedAgentId != null && members.some((node) => statusOf(node.id) === 'completed')) {
    return '编排已完成'
  }
  return members.some((node) => statusOf(node.id) !== 'pending') ? '编排执行中' : '等待开始'
}

/** 顺序模式的进度角标「第 N/M 步」：取当前 running 的成员，没有则取最后一个完成的。 */
export function deriveWorkflowStepBadge(progress: WorkflowProgressState): string | null {
  const members = Object.values(progress.members)
  const current = members.find((member) => member.status === 'running')
    ?? [...members].sort((left, right) => (right.ordinal ?? 0) - (left.ordinal ?? 0))[0]
  if (!current || current.ordinal == null || current.total == null) return null
  return `${current.ordinal}/${current.total}`
}
