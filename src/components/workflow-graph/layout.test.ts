import { describe, expect, it } from 'vitest'
import { layoutTopology } from './layout'
import { buildWorkflowModeTopology } from './topology'
import type { LayoutResult, TopoNode } from './types'

function member(id: string): TopoNode {
  return {
    id,
    data: { kind: 'member', label: id, agentId: null, disabled: false, status: 'pending', runId: null },
  }
}

const MEMBERS = ['m11', 'm12', 'm13', 'm14']

function positionOf(result: LayoutResult, id: string) {
  const node = result.nodes.find((item) => item.id === id)
  if (!node) throw new Error(`missing node ${id}`)
  return node.position
}

describe('layoutTopology', () => {
  it('默认 TB：兄弟成员同一行，按拓扑顺序从左到右', () => {
    const topo = buildWorkflowModeTopology('parallel', MEMBERS.map(member))
    const result = layoutTopology(topo)
    const ys = MEMBERS.map((id) => positionOf(result, id).y)
    const xs = MEMBERS.map((id) => positionOf(result, id).x)
    expect(new Set(ys).size).toBe(1)
    expect(xs).toEqual([...xs].sort((left, right) => left - right))
    expect(new Set(xs).size).toBe(MEMBERS.length)
    expect(positionOf(result, 'start').y).toBeLessThan(ys[0])
    expect(positionOf(result, 'end').y).toBeGreaterThan(ys[0])
  })

  it('显式传 TB 与不传结果完全相同', () => {
    const topo = buildWorkflowModeTopology('llm_routing', MEMBERS.map(member))
    expect(layoutTopology(topo, { direction: 'TB' })).toEqual(layoutTopology(topo))
  })

  it.each(['parallel', 'llm_routing'] as const)('LR（%s）：兄弟成员同一列，按拓扑顺序从上到下', (mode) => {
    const topo = buildWorkflowModeTopology(mode, MEMBERS.map(member))
    const result = layoutTopology(topo, { direction: 'LR', nodeSep: 28, rankSep: 56 })
    const xs = MEMBERS.map((id) => positionOf(result, id).x)
    const ys = MEMBERS.map((id) => positionOf(result, id).y)
    expect(new Set(xs).size).toBe(1)
    expect(ys).toEqual([...ys].sort((left, right) => left - right))
    expect(new Set(ys).size).toBe(MEMBERS.length)
    // 兄弟节点间距 = 节点直径 44 + nodeSep
    expect(ys[1] - ys[0]).toBe(44 + 28)
    expect(positionOf(result, 'start').x).toBeLessThan(xs[0])
    expect(positionOf(result, 'end').x).toBeGreaterThan(xs[0])
  })

  it('LR 顺序执行：单链从左到右排成一行，包围盒从原点起', () => {
    const topo = buildWorkflowModeTopology('sequential', MEMBERS.map(member))
    const result = layoutTopology(topo, { direction: 'LR' })
    const chain = ['start', ...MEMBERS, 'end'].map((id) => positionOf(result, id))
    expect(new Set(chain.map((point) => point.y)).size).toBe(1)
    const xs = chain.map((point) => point.x)
    expect(xs).toEqual([...xs].sort((left, right) => left - right))
    expect(xs[0]).toBe(0)
    expect(result.bbox.height).toBe(44)
  })
})
