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

/**
 * dagre 的 order 阶段会把同一层的兄弟节点整体倒序：实测 parallel / routing 的成员
 * 稳定排成 m4 m3 m2 m1 m0，而旧实现是按 position 从左到右。这里不碰 dagre 算好的
 * 间距与居中，只把同一行已占用的 x 坐标按拓扑输入顺序重新发一遍。
 *
 * 依赖 nodes 的数组顺序即 topo.nodes 的顺序，而 buildTopology 已按 position 排序，
 * 所以同一行里的先后天然就是 position 先后。
 */
function restoreSiblingOrder(nodes: LayoutedNode[]): void {
  // 同一 rank 的 y 由 dagre 一次性赋同一个数值，可直接作精确相等的分组键
  const rows = new Map<number, LayoutedNode[]>()
  for (const node of nodes) {
    const row = rows.get(node.position.y)
    if (row) row.push(node)
    else rows.set(node.position.y, [node])
  }
  for (const row of rows.values()) {
    if (row.length < 2) continue
    const xs = row.map((node) => node.position.x).sort((left, right) => left - right)
    row.forEach((node, index) => {
      node.position.x = xs[index]
    })
  }
}

/** 把与坐标无关的抽象拓扑交给 dagre 排版，产出可直接灌进 Vue Flow 的结果。 */
export function layoutTopology(topo: Topology): LayoutResult {
  // 空图直接短路：不值得为零个节点起一次 dagre，按契约返回零值
  if (topo.nodes.length === 0) {
    return { nodes: [], edges: [], bbox: { width: 0, height: 0 } }
  }

  const graph = new dagre.graphlib.Graph<GraphLabel, NodeLabel, Record<string, never>>()
  graph.setGraph({ rankdir: 'TB', nodesep: NODE_SEP, ranksep: RANK_SEP })
  // dagre 布局时会读每条边标签上的 minlen / weight 等字段，不给默认标签会中途崩掉
  graph.setDefaultEdgeLabel(() => ({}))

  // 尺寸显式喂给 dagre，无需等 DOM 测量即可同步算出坐标 —— 这是首帧不跳动的前提
  for (const node of topo.nodes) {
    graph.setNode(node.id, { width: NODE_SIZE, height: NODE_SIZE })
  }
  for (const edge of topo.edges) {
    graph.setEdge(edge.source, edge.target)
  }
  // loopback 绝对不能 setEdge 进 dagre：它把首末节点连成环，dagre 的 acyclic 模块
  // 会为了断环把这条边反转成「首 → 末」，首末节点的 rank 关系被搅乱，整条单链随之拆散。
  // 它只在函数末尾原样拼进返回值，交给渲染层画回环，不参与排版。

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

  restoreSiblingOrder(nodes)

  return { nodes, edges: [...topo.edges, ...topo.loopbacks], bbox: { width, height } }}
