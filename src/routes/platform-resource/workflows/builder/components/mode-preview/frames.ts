import type { WorkflowMode } from '@/interfaces/workflow/api'
import { buildWorkflowModeTopology } from '@/components/workflow-graph/topology'
import type { TopoNode, Topology, WfStatus } from '@/components/workflow-graph/types'

/** 预览图最多画几个成员节点；超出时前 PREVIEW_MEMBER_CAP - 1 个照画，其余合成一个「+N」。 */
export const PREVIEW_MEMBER_CAP = 4

/** 表单里还没选成员时的占位成员。 */
export const PREVIEW_PLACEHOLDERS = ['成员 A', '成员 B', '成员 C'] as const

/** 动画每一帧的停留时长（ms）。 */
export const PREVIEW_TICK_MS = 900

/** 预览成员节点键：按槽位编号。预览不需要真实 agent_id，槽位键在成员增删时也不会撞。 */
export function previewMemberId(slot: number): string {
  return `m${slot}`
}

/**
 * 把表单成员名压成预览节点的文案：没选成员用占位，超过上限时末位合成「+N」。
 * 顺序沿用入参顺序（即表单里的排列顺序）。
 */
export function previewMemberLabels(names: readonly string[]): string[] {
  if (!names.length) return [...PREVIEW_PLACEHOLDERS]
  if (names.length <= PREVIEW_MEMBER_CAP) return [...names]
  const kept = names.slice(0, PREVIEW_MEMBER_CAP - 1)
  return [...kept, `+${names.length - kept.length}`]
}

function previewMemberNode(label: string, slot: number): TopoNode {
  return {
    id: previewMemberId(slot),
    data: {
      kind: 'member',
      label,
      position: null,
      agentId: null,
      disabled: false,
      status: 'pending',
      runId: null,
    },
  }
}

/** 预览图拓扑：与聊天页 Workflow 图同一份结构，只是成员换成预览成员。 */
export function buildPreviewTopology(mode: WorkflowMode, labels: readonly string[]): Topology {
  return buildWorkflowModeTopology(mode, labels.map(previewMemberNode))
}

/** 一帧的画面：节点状态与边状态都按 id 索引。 */
export interface PreviewFrame {
  nodes: Record<string, WfStatus>
  edges: Record<string, { active: boolean; animated: boolean }>
}

/** 智能路由每一轮的帧数：路由判定 → 选中成员运行 → 完成 → 停顿 → 空闲。 */
const ROUTING_ROUND = 5
/** 并行执行一轮的帧数：成员同时运行 → 汇总 → 完成 → 停顿 → 空闲。 */
const PARALLEL_ROUND = 5

/** 顺序执行一轮的帧数：每个成员各一帧 → 完成 → 停顿 → 空闲。 */
function sequentialRound(memberCount: number): number {
  return memberCount + 3
}

/** 每个节点在这一帧的状态。起点/终点没有自身状态，只靠边表达走到了哪里。 */
function nodeStatuses(mode: WorkflowMode, memberCount: number, frame: number): Record<string, WfStatus> {
  const result: Record<string, WfStatus> = {}
  const setMember = (slot: number, status: WfStatus) => {
    result[previewMemberId(slot)] = status
  }

  if (mode === 'sequential') {
    const step = frame % sequentialRound(memberCount)
    // step < memberCount：第 step 个成员运行，前面的已完成；step = memberCount、+1 是完成与停顿
    const idle = step === sequentialRound(memberCount) - 1
    for (let slot = 0; slot < memberCount; slot += 1) {
      if (idle) setMember(slot, 'pending')
      else if (slot < step) setMember(slot, 'completed')
      else setMember(slot, slot === step ? 'running' : 'pending')
    }
    return result
  }

  if (mode === 'parallel') {
    const step = frame % PARALLEL_ROUND
    const members: WfStatus = step === 0 ? 'running' : step < 4 ? 'completed' : 'pending'
    for (let slot = 0; slot < memberCount; slot += 1) setMember(slot, members)
    result.join = step === 1 ? 'running' : step === 2 || step === 3 ? 'completed' : 'pending'
    return result
  }

  // llm_routing：每一轮换一个成员，其余分支保持未走
  const step = frame % ROUTING_ROUND
  const chosen = Math.floor(frame / ROUTING_ROUND) % memberCount
  result.router = step === 0 ? 'running' : step < 4 ? 'completed' : 'pending'
  for (let slot = 0; slot < memberCount; slot += 1) {
    if (slot !== chosen) setMember(slot, 'pending')
    else setMember(slot, step === 1 ? 'running' : step === 2 || step === 3 ? 'completed' : 'pending')
  }
  return result
}

/**
 * 第 frame 帧（从 0 起，单调递增即可，内部自行取模循环）的完整画面。
 *
 * 边的规则与聊天页一致：前驱已完成（起点视为恒已出发）且后继已被走到（终点看前驱是否完成）
 * 即点亮；后继正在运行时虚线流动。智能路由未选中的分支，后继始终 pending，所以保持未走样式。
 */
export function previewFrame(mode: WorkflowMode, memberCount: number, frame: number): PreviewFrame {
  if (memberCount <= 0) return { nodes: {}, edges: {} }
  const topology = buildPreviewTopology(mode, Array.from({ length: memberCount }, (_, slot) => `${slot}`))
  const statuses = nodeStatuses(mode, memberCount, Math.max(0, Math.floor(frame)))
  const kindOf = new Map(topology.nodes.map((node) => [node.id, node.data.kind]))
  const statusOf = (id: string): WfStatus => statuses[id] ?? 'pending'

  const nodes: Record<string, WfStatus> = {}
  for (const node of topology.nodes) {
    if (node.data.kind !== 'anchor-start' && node.data.kind !== 'anchor-end') nodes[node.id] = statusOf(node.id)
  }

  const edges: PreviewFrame['edges'] = {}
  for (const edge of topology.edges) {
    const departed = kindOf.get(edge.source) === 'anchor-start' || statusOf(edge.source) === 'completed'
    const arrived = kindOf.get(edge.target) === 'anchor-end'
      ? statusOf(edge.source) === 'completed'
      : statusOf(edge.target) !== 'pending'
    edges[edge.id] = { active: departed && arrived, animated: statusOf(edge.target) === 'running' }
  }
  return { nodes, edges }
}

/** 静态的完整图：所有节点未开始、所有边未走。不播放的行与 reduced-motion 时都用它。 */
export function idlePreviewFrame(mode: WorkflowMode, memberCount: number): PreviewFrame {
  if (memberCount <= 0) return { nodes: {}, edges: {} }
  const topology = buildPreviewTopology(mode, Array.from({ length: memberCount }, (_, slot) => `${slot}`))
  const nodes: Record<string, WfStatus> = {}
  for (const node of topology.nodes) {
    if (node.data.kind !== 'anchor-start' && node.data.kind !== 'anchor-end') nodes[node.id] = 'pending'
  }
  const edges: PreviewFrame['edges'] = {}
  for (const edge of topology.edges) edges[edge.id] = { active: false, animated: false }
  return { nodes, edges }
}
