import type { WorkflowAgentResponse, WorkflowMode, WorkflowResponse } from '@/interfaces/workflow/api'
import type { TopoEdge, TopoNode, Topology, WfNodeKind } from './types'

/** 结构节点（start/end/router/join）：运行时字段统一给初始值，之后由 SSE 补丁回写。 */
function structNode(id: string, kind: WfNodeKind, label: string): TopoNode {
  return {
    id,
    data: { kind, label, agentId: null, disabled: false, status: 'pending', runId: null },
  }
}

/** 流向边。id 固定为 e-{source}-{target}：运行时要按 id 调 updateEdge 打补丁，
 *  同一 Workflow 两次构建必须得到相同 id，所以只能由两端节点键合成，不掺下标或随机量。 */
function flowEdge(source: string, target: string): TopoEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    data: { active: false },
  }
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
 * 只有命中的那个会运行，成员直接接 end，不设汇聚节点。
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
  // 无成员时组件要走"暂无成员"空态，孤立的 start/end 反而会把空态顶掉
  if (!members.length) return { nodes: [], edges: [] }

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

  return { nodes, edges }
}
