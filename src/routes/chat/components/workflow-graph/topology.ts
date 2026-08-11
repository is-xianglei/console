import type { PlanMemberResponse, PlanResponse } from '@/interfaces/orchestration-plan/api'
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
    data: { kind, label, position: null, disabled: false, status: 'pending', runId: null },
  }
}

function memberNode(member: PlanMemberResponse): TopoNode {
  return {
    id: memberId(member),
    data: {
      kind: 'member',
      label: member.agent_name,
      position: member.position,
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
