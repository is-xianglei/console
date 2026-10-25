import type { GraphNodeState, SubAgent, WorkflowProgressState } from '@/interfaces/console/model'
import type { TopoNode, WfStatus } from './types'

/** 状态文案。pending 是"表中无该键"推出来的，不是后端下发的枚举值。 */
export const STATUS_LABEL: Record<WfStatus, string> = {
  pending: '未开始',
  running: '执行中',
  completed: '已完成',
  suspended: '等待审批',
  failed: '已失败',
  escalated: '已升级',
}

/** SSE 归并后的执行图状态表，键是去掉 #N 轮次的裸路径。 */
export type GraphNodeMap = Record<string, GraphNodeState>

/** 取当前编排根节点的 path 首段。
 *
 *  后端的 path 形如 `slug(方案名)/n{位次}_{slug(Agent名)}`。前端不复刻 slug ——
 *  Python 的 \w 在 re.UNICODE 下保留中文，JS 的 \w 只认 ASCII，照抄会把中文名整体
 *  吃成空串且不报错。改为从事件里反查：根节点事件带 detail.root，store 已存成 root 标记。
 *
 *  首段同时是会话隔离的依据：selectSession/newSession 都不清 graphNodes，
 *  只有 dispatch 和 resetConsole 清。拿首段过滤，跨会话的残留自然被排除。 */
export function findRootSegment(graphNodes: GraphNodeMap): string | null {
  for (const node of Object.values(graphNodes)) {
    if (node.root === true) return node.path.split('/')[0]
  }
  return null
}

/** 按位次前缀匹配成员的运行时状态。
 *
 *  只认「首段等于根节点首段」且「末段以 n{位次}_ 开头」的条目，不依赖方案名和 Agent 名。
 *  位次前缀由后端 node_name() 保证唯一，成员数上限 5，不存在两位数位次撞前缀的情况。 */
export function matchRuntime(
  graphNodes: GraphNodeMap,
  rootSegment: string | null,
  position: number,
): GraphNodeState | null {
  if (!rootSegment) return null
  const prefix = `n${position}_`
  for (const node of Object.values(graphNodes)) {
    const segments = node.path.split('/')
    if (segments[0] !== rootSegment) continue
    if (segments.length < 2) continue
    if (segments[segments.length - 1].startsWith(prefix)) return node
  }
  return null
}

/** 根节点自身的状态，驱动底部状态条的兜底文案。 */
export function findRootState(graphNodes: GraphNodeMap): GraphNodeState | null {
  for (const node of Object.values(graphNodes)) {
    if (node.root === true) return node
  }
  return null
}

/** 成员节点解析出的运行时快照，供节点与边共同消费。 */
export interface MemberRuntime {
  status: WfStatus
  runId: string | null
}

/** 把所有成员的运行时状态按节点 id 解析成一张表。 */
export function resolveMemberRuntime(
  nodes: TopoNode[],
  graphNodes: GraphNodeMap,
): Record<string, MemberRuntime> {
  const rootSegment = findRootSegment(graphNodes)
  const result: Record<string, MemberRuntime> = {}
  for (const node of nodes) {
    if (node.data.kind !== 'member' || node.data.position == null) continue
    const runtime = matchRuntime(graphNodes, rootSegment, node.data.position)
    result[node.id] = {
      status: runtime?.status ?? 'pending',
      runId: runtime?.runId ?? null,
    }
  }
  return result
}

/** 节点跑过（不再是 pending）即视为其入边已走通。沿用旧实现的 isVisited 语义。 */
function isVisited(status: WfStatus): boolean {
  return status !== 'pending'
}

/** 推导每条边是否点亮（实线）。
 *
 *  规则逐条沿用旧实现，不做"顺手改进"：
 *  - 单链：前驱 completed 且自身跑过，才算这条边走通
 *  - routing 的 起点→路由 边：任一分支跑过即判定已完成
 *  - 成员→汇聚：该成员 completed
 *  - 汇聚→终点：全部成员 completed
 *
 *  统一表达成「看目标节点的入边条件」：结构节点没有自己的状态，
 *  只能从它依赖的成员集合反推。
 *
 *  只接收 flow 边。回环边（末成员→首成员）两端都是成员，落进来会被判成
 *  "已走通"而渲染成实线，但旧实现里它恒为强调色虚线，与执行进度无关。 */
export function deriveEdgeActive(
  nodes: TopoNode[],
  edges: { id: string; source: string; target: string }[],
  runtime: Record<string, MemberRuntime>,
): Record<string, boolean> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const members = nodes.filter((node) => node.data.kind === 'member')
  const statusOf = (id: string): WfStatus => runtime[id]?.status ?? 'pending'
  const allCompleted = members.every((node) => statusOf(node.id) === 'completed')
  const anyVisited = members.some((node) => isVisited(statusOf(node.id)))

  const result: Record<string, boolean> = {}
  for (const edge of edges) {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) {
      result[edge.id] = false
      continue
    }
    if (target.data.kind === 'member') {
      // 前驱是成员时要求它 completed；前驱是起点/路由节点则视为天然畅通
      const upstreamReady = source.data.kind === 'member'
        ? statusOf(source.id) === 'completed'
        : true
      result[edge.id] = upstreamReady && isVisited(statusOf(target.id))
      continue
    }
    if (target.data.kind === 'router') {
      result[edge.id] = anyVisited
      continue
    }
    if (target.data.kind === 'join') {
      result[edge.id] = statusOf(edge.source) === 'completed'
      continue
    }
    // 终点：单链看末成员是否 completed，扇形看全部成员
    result[edge.id] = source.data.kind === 'member'
      ? statusOf(edge.source) === 'completed'
      : allCompleted
  }
  return result
}

/** 底部状态条文案。优先级沿用旧实现：running → suspended → failed → 根节点状态。 */
export function deriveStatusText(
  nodes: TopoNode[],
  runtime: Record<string, MemberRuntime>,
  rootState: GraphNodeState | null,
): string {
  const members = nodes.filter((node) => node.data.kind === 'member')
  const pick = (status: WfStatus) =>
    members.find((node) => (runtime[node.id]?.status ?? 'pending') === status)

  const running = pick('running')
  if (running) return `${running.data.label} · 执行中`
  const waiting = pick('suspended')
  if (waiting) return `${waiting.data.label} · 等待审批`
  const failed = pick('failed')
  if (failed) return `${failed.data.label} · 已失败`
  if (rootState?.status === 'completed') return '编排已完成'
  if (rootState?.status === 'failed') return '编排执行失败'
  if (rootState?.status === 'running') return '编排执行中'
  return '等待开始'
}

/** loop 轮次角标：取全图最大轮次，避免落后成员把角标拉回上一轮。 */
export function deriveIterationBadge(
  nodes: TopoNode[],
  graphNodes: GraphNodeMap,
  fallbackMax: unknown,
): string | null {
  const rootSegment = findRootSegment(graphNodes)
  let iteration = 0
  let max = typeof fallbackMax === 'number' ? fallbackMax : null
  for (const node of nodes) {
    if (node.data.kind !== 'member' || node.data.position == null) continue
    const runtime = matchRuntime(graphNodes, rootSegment, node.data.position)
    if (runtime?.iteration != null && runtime.iteration > iteration) iteration = runtime.iteration
    if (runtime?.maxIterations != null) max = runtime.maxIterations
  }
  if (!iteration || max == null) return null
  return `${iteration}/${max}`
}

/** routing 实际命中的分支键；未命中分支完全没有事件，只能靠它区分虚实线。 */
export function deriveHitRoute(nodes: TopoNode[], graphNodes: GraphNodeMap): string | null {
  const rootSegment = findRootSegment(graphNodes)
  for (const node of nodes) {
    if (node.data.kind !== 'member' || node.data.position == null) continue
    const route = matchRuntime(graphNodes, rootSegment, node.data.position)?.route
    if (route) return route
  }
  return null
}

// ===== Workflow 进度图（数据源是 workflow_progress 事件，按 agent_id 归并，与 path 无关） =====

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

/** Workflow 图的边点亮规则。与方案图的差异只有两处：
 *  - 路由/汇聚节点有自己的状态（routing / merging 阶段），不再从成员集合反推；
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
