/** 节点在图里的角色。member 是真正的成员 Agent，其余四种是编排结构本身的节点。 */
export type WfNodeKind = 'anchor-start' | 'anchor-end' | 'router' | 'join' | 'member'

/** 节点的运行时状态：无事件即 pending，其余取自 SSE。 */
export type WfStatus = 'pending' | 'running' | 'completed' | 'suspended' | 'failed' | 'escalated'

/** 节点直径。dagre 用它算间距，CSS 用它定尺寸，两边必须是同一个数。 */
export const NODE_SIZE = 44

/** 挂在 Vue Flow 节点上的业务数据。布局阶段只填静态字段，运行时字段由补丁回写。 */
export interface WfNodeData {
  kind: WfNodeKind
  /** 成员显示名；结构节点用固定文案（如"智能路由"） */
  label: string
  /** 成员的数据库 Agent ID，结构节点与预览成员为 null。Workflow 图运行时靠它匹配进度与面板 */
  agentId: number | null
  /** 成员 Agent 已删除，Workflow 无法运行 */
  disabled: boolean
  /** 运行时状态，默认 pending */
  status: WfStatus
  /** 事件里的 actor.run_id，有值才可点击跳转 */
  runId: string | null
}

/** 挂在 Vue Flow 边上的业务数据。 */
export interface WfEdgeData {
  /** 这条边已经走通，实线显示 */
  active: boolean
}

/** 不含坐标的抽象节点，由 buildWorkflowModeTopology 产出。 */
export interface TopoNode {
  /** 稳定合成键：start / end / router / join / m{agent_id}（预览图为 m{槽位}） */
  id: string
  data: WfNodeData
}

/** 不含坐标的抽象边。 */
export interface TopoEdge {
  id: string
  source: string
  target: string
  data: WfEdgeData
}

/** 一张图的完整拓扑。 */
export interface Topology {
  nodes: TopoNode[]
  edges: TopoEdge[]
}

/** 布局后的节点：position 是左上角坐标（Vue Flow 的约定，非 dagre 的中心点）。 */
export interface LayoutedNode extends TopoNode {
  position: { x: number; y: number }
  width: number
  height: number
}

/** 图形内容的包围盒，视口计算用它。 */
export interface LayoutBBox {
  width: number
  height: number
}

/** layoutTopology 的产出，可直接灌进 Vue Flow。 */
export interface LayoutResult {
  nodes: LayoutedNode[]
  edges: TopoEdge[]
  bbox: LayoutBBox
}
