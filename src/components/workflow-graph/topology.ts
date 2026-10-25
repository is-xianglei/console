import type { PlanMemberResponse, PlanResponse } from '@/interfaces/orchestration-plan/api'
import type { WorkflowAgentResponse, WorkflowMode, WorkflowResponse } from '@/interfaces/workflow/api'
import type { TopoEdge, TopoNode, Topology, WfNodeKind } from './types'

/** 成员节点键用 position 而非数组下标：position 是后端定的稳定序号，
 *  成员增删时下标会漂移，运行时补丁按 id 找节点就会张冠李戴。 */
function memberId(member: PlanMemberResponse): string {
  return `m${member.position}`
}

/** 分支键取法照抄旧组件：role_config 是宽松的 Record，
 *  后端不保证 route_key 存在或为字符串，非字符串一律按无分支处理。 */
function routeKeyOf(member: PlanMemberResponse): string | null {
  return typeof member.role_config.route_key === 'string' ? member.role_config.route_key : null
}

/** 结构节点（start/end/router/join）：router/join 的文案照抄旧组件 <title> 原文，
 *  运行时字段统一给初始值，之后由 SSE 补丁回写。 */
function structNode(id: string, kind: WfNodeKind, label: string): TopoNode {
  return {
    id,
    data: { kind, label, position: null, agentId: null, disabled: false, status: 'pending', runId: null },
  }
}

function memberNode(member: PlanMemberResponse): TopoNode {
  return {
    id: memberId(member),
    data: {
      kind: 'member',
      label: member.agent_name,
      position: member.position,
      agentId: null,
      disabled: !member.is_available,
      status: 'pending',
      runId: null,
    },
  }
}

/** 正常流向边。id 固定为 e-{source}-{target}：运行时要按 id 调 updateEdge 打补丁，
 *  同一方案两次构建必须得到相同 id，所以只能由两端节点键合成，不掺下标或随机量。 */
function flowEdge(source: string, target: string, routeKey: string | null = null): TopoEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    data: { kind: 'flow', routeKey, active: false },
  }
}

/**
 * 把编排方案转成与坐标无关的抽象图，拓扑语义与旧手绘 SVG 组件逐字对齐：
 * sequential/loop 是 start→成员链→end 的单链，parallel 由 start 扇出再经 join 收束，
 * routing 在起点后多一个路由节点。loop 的回环不参与 dagre 布局，单独放进 loopbacks。
 */
export function buildTopology(plan: PlanResponse): Topology {
  // 接口不保证 members 有序，排序必须与旧组件同源，否则链式连线的先后会错
  const members = [...plan.members].sort((left, right) => left.position - right.position)
  // 无成员时组件要走"该方案暂无成员"空态，孤立的 start/end 反而会把空态顶掉
  if (!members.length) return { nodes: [], edges: [], loopbacks: [] }

  // 判定沿用旧组件：join 只看 mode 不看成员数，单成员的 parallel/routing 也有汇聚节点
  const isChain = plan.mode === 'sequential' || plan.mode === 'loop'
  const hasRouterNode = plan.mode === 'routing'
  const hasJoinNode = !isChain

  const nodes: TopoNode[] = [structNode('start', 'anchor-start', '开始')]
  if (hasRouterNode) nodes.push(structNode('router', 'router', '路由判定'))
  nodes.push(...members.map(memberNode))
  if (hasJoinNode) nodes.push(structNode('join', 'join', '结果汇聚'))
  nodes.push(structNode('end', 'anchor-end', '结束'))

  const edges: TopoEdge[] = []
  const loopbacks: TopoEdge[] = []

  if (isChain) {
    // sequential / loop：start → m… → end 单链
    let prev = 'start'
    for (const member of members) {
      edges.push(flowEdge(prev, memberId(member)))
      prev = memberId(member)
    }
    edges.push(flowEdge(prev, 'end'))
    // 回环要求至少两个成员，与旧 loopArc 在 list.length < 2 时返回 null 一致；
    // 全图至多一条回环，id 直接定死 e-loopback
    if (plan.mode === 'loop' && members.length >= 2) {
      loopbacks.push({
        id: 'e-loopback',
        source: memberId(members[members.length - 1]),
        target: memberId(members[0]),
        data: { kind: 'loopback', routeKey: null, active: false },
      })
    }
  } else {
    // parallel / routing：起点（routing 则先经路由节点）扇出到各成员，再收束进 join
    const fan = hasRouterNode ? 'router' : 'start'
    if (hasRouterNode) edges.push(flowEdge('start', 'router'))
    for (const member of members) {
      // routeKey 只挂在 router→成员 的边上：旧组件的标签判定是 hasRouterNode && routeKey，
      // parallel 即便配置里残留 route_key 也不展示
      edges.push(flowEdge(fan, memberId(member), hasRouterNode ? routeKeyOf(member) : null))
      edges.push(flowEdge(memberId(member), 'join'))
    }
    edges.push(flowEdge('join', 'end'))
  }

  return { nodes, edges, loopbacks }
}

/** Workflow 成员节点键用 agent_id：后端约束同一 Agent 不能重复绑定，天然唯一且稳定；
 *  workflow_progress 事件也只带 agent_id，运行时补丁按它找节点。 */
function workflowMemberId(member: WorkflowAgentResponse): string {
  return `m${member.agent_id}`
}

/** Workflow 成员节点。agent_name 为 null 表示成员 Agent 已被软删除，运行必然失败，标成 disabled。 */
function workflowMemberNode(member: WorkflowAgentResponse): TopoNode {
  return {
    id: workflowMemberId(member),
    data: {
      kind: 'member',
      label: member.agent_name ?? '已删除的 Agent',
      position: null,
      agentId: member.agent_id,
      disabled: member.agent_name == null,
      status: 'pending',
      runId: null,
    },
  }
}

/**
 * 把后端 Workflow 定义转成抽象图，三种模式与后端编排器一一对应：
 * sequential 是 start→成员链→end 单链；parallel 由 start 扇出、经「汇总结果」收束（后端
 * merging 阶段）；llm_routing 在起点后加「智能路由」节点（后端 routing 阶段）扇出到各成员，
 * 只有命中的那个会运行，成员直接接 end，不设汇聚节点。Workflow 没有回环，loopbacks 恒空。
 */
export function buildWorkflowTopology(workflow: WorkflowResponse): Topology {
  // 接口已按 (sort_order, agent_id) 升序返回，这里再排一次防御外部构造的乱序数据
  const members = [...workflow.agents].sort(
    (left, right) => left.sort_order - right.sort_order || left.agent_id - right.agent_id,
  )
  return buildWorkflowModeTopology(workflow.mode, members.map(workflowMemberNode))
}

/**
 * 按模式把已排好序的成员节点接成 Workflow 图。聊天页的 Workflow 图与 Builder 的模式预览
 * 共用这一份结构：前者传真实成员（id 为 m{agent_id}），后者传预览成员，连线规则只认节点 id。
 */
export function buildWorkflowModeTopology(mode: WorkflowMode, members: TopoNode[]): Topology {
  if (!members.length) return { nodes: [], edges: [], loopbacks: [] }

  const hasRouterNode = mode === 'llm_routing'
  const hasJoinNode = mode === 'parallel'

  const nodes: TopoNode[] = [structNode('start', 'anchor-start', '开始')]
  if (hasRouterNode) nodes.push(structNode('router', 'router', '智能路由'))
  nodes.push(...members)
  if (hasJoinNode) nodes.push(structNode('join', 'join', '汇总结果'))
  nodes.push(structNode('end', 'anchor-end', '结束'))

  const edges: TopoEdge[] = []
  if (mode === 'sequential') {
    let prev = 'start'
    for (const member of members) {
      edges.push(flowEdge(prev, member.id))
      prev = member.id
    }
    edges.push(flowEdge(prev, 'end'))
  } else {
    const fan = hasRouterNode ? 'router' : 'start'
    const sink = hasJoinNode ? 'join' : 'end'
    if (hasRouterNode) edges.push(flowEdge('start', 'router'))
    for (const member of members) {
      edges.push(flowEdge(fan, member.id))
      edges.push(flowEdge(member.id, sink))
    }
    if (hasJoinNode) edges.push(flowEdge('join', 'end'))
  }

  return { nodes, edges, loopbacks: [] }
}
