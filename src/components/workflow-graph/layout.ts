import dagre from '@dagrejs/dagre'
import type { GraphLabel, NodeLabel } from '@dagrejs/dagre'
import { NODE_SIZE } from './types'
import type { LayoutResult, LayoutedNode, Topology } from './types'

// dagre 的 nodesep / ranksep 是相邻节点「边到边」的空隙，而被替换的手绘实现里
// ROW_GAP = 74、COL_GAP = 112 是圆心到圆心的距离。节点是直径 44 的圆，
// 想复现旧图的像素间距就必须先扣掉一个直径：30 = 74 - 44，68 = 112 - 44。
/** 行间空隙（边到边），落地后等价于旧实现的圆心行距 74 */
const RANK_SEP = 74 - NODE_SIZE
/** 并列节点的横向空隙（边到边），落地后等价于旧实现的圆心列距 112 */
const NODE_SEP = 112 - NODE_SIZE

/** 排版方向：TB 自上而下（聊天页），LR 自左向右（Builder 模式预览）。 */
export type LayoutDirection = 'TB' | 'LR'

export interface LayoutOptions {
  /** 默认 TB */
  direction?: LayoutDirection
  /** 同一 rank 内兄弟节点的空隙（边到边），默认 NODE_SEP */
  nodeSep?: number
  /** 相邻 rank 的空隙（边到边），默认 RANK_SEP */
  rankSep?: number
}

/**
 * dagre 的 order 阶段会把同一层的兄弟节点整体倒序：实测 parallel / llm_routing 的成员
 * 稳定排成 m4 m3 m2 m1 m0，而旧实现是按成员顺序从左到右。这里不碰 dagre 算好的
 * 间距与居中，只把同一行已占用的 x 坐标按拓扑输入顺序重新发一遍。
 *
 * 依赖 nodes 的数组顺序即 topo.nodes 的顺序，而 buildWorkflowTopology 已按 sort_order 排序，
 * 所以同一行里的先后天然就是成员顺序。
 *
 * LR 方向下 rank 沿 x 轴展开，同一 rank 共享 x、兄弟沿 y 排列：分组键换成 x，
 * 重新分配的是 y，拓扑顺序靠前的排在上方。
 */
function restoreSiblingOrder(nodes: LayoutedNode[], direction: LayoutDirection): void {
  const rankAxis = direction === 'LR' ? 'x' : 'y'
  const siblingAxis = direction === 'LR' ? 'y' : 'x'
  // 同一 rank 的坐标由 dagre 一次性赋同一个数值，可直接作精确相等的分组键
  const ranks = new Map<number, LayoutedNode[]>()
  for (const node of nodes) {
    const rank = ranks.get(node.position[rankAxis])
    if (rank) rank.push(node)
    else ranks.set(node.position[rankAxis], [node])
  }
  for (const rank of ranks.values()) {
    if (rank.length < 2) continue
    const slots = rank.map((node) => node.position[siblingAxis]).sort((left, right) => left - right)
    rank.forEach((node, index) => {
      node.position[siblingAxis] = slots[index]
    })
  }
}

/** 把与坐标无关的抽象拓扑交给 dagre 排版，产出可直接灌进 Vue Flow 的结果。 */
export function layoutTopology(topo: Topology, options: LayoutOptions = {}): LayoutResult {
  // 空图直接短路：不值得为零个节点起一次 dagre，按契约返回零值
  if (topo.nodes.length === 0) {
    return { nodes: [], edges: [], bbox: { width: 0, height: 0 } }
  }

  const { direction = 'TB', nodeSep = NODE_SEP, rankSep = RANK_SEP } = options
  const graph = new dagre.graphlib.Graph<GraphLabel, NodeLabel, Record<string, never>>()
  graph.setGraph({ rankdir: direction, nodesep: nodeSep, ranksep: rankSep })
  // dagre 布局时会读每条边标签上的 minlen / weight 等字段，不给默认标签会中途崩掉
  graph.setDefaultEdgeLabel(() => ({}))

  // 尺寸显式喂给 dagre，无需等 DOM 测量即可同步算出坐标 —— 这是首帧不跳动的前提
  for (const node of topo.nodes) {
    graph.setNode(node.id, { width: NODE_SIZE, height: NODE_SIZE })
  }
  for (const edge of topo.edges) {
    graph.setEdge(edge.source, edge.target)
  }

  dagre.layout(graph)

  // dagre 返回的 x / y 是节点中心点，Vue Flow 的 position 是左上角，统一减去半径换算
  let minX = Infinity
  let minY = Infinity
  const nodes: LayoutedNode[] = topo.nodes.map((node) => {
    const center = graph.node(node.id)
    // 布局完成后 x / y 必已写回，?? 0 仅用于收窄 dagre 类型声明里的可选字段
    const x = (center.x ?? 0) - NODE_SIZE / 2
    const y = (center.y ?? 0) - NODE_SIZE / 2
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    return { ...node, position: { x, y }, width: NODE_SIZE, height: NODE_SIZE }
  })

  // dagre 不保证坐标从 0 开始：整体平移使内容包围盒的左上角贴住原点，
  // 视口层才能直接拿 bbox 计算缩放，不必再关心内容飘在画布哪个角落
  let width = 0
  let height = 0
  for (const node of nodes) {
    node.position.x -= minX
    node.position.y -= minY
    width = Math.max(width, node.position.x + node.width)
    height = Math.max(height, node.position.y + node.height)
  }

  restoreSiblingOrder(nodes, direction)

  return { nodes, edges: [...topo.edges], bbox: { width, height } }}
