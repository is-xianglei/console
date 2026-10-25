import { describe, expect, it } from 'vitest'
import {
  PREVIEW_MEMBER_CAP,
  PREVIEW_PLACEHOLDERS,
  buildPreviewTopology,
  idlePreviewFrame,
  previewFrame,
  previewMemberLabels,
} from './frames'

/** 只看点亮的边，按 id 排序，断言更直观。 */
function activeEdges(frame: ReturnType<typeof previewFrame>): string[] {
  return Object.entries(frame.edges).filter(([, state]) => state.active).map(([id]) => id).sort()
}

function animatedEdges(frame: ReturnType<typeof previewFrame>): string[] {
  return Object.entries(frame.edges).filter(([, state]) => state.animated).map(([id]) => id).sort()
}

describe('previewMemberLabels', () => {
  it('没选成员时用占位成员 A、B、C', () => {
    expect(previewMemberLabels([])).toEqual([...PREVIEW_PLACEHOLDERS])
  })

  it('真实成员按排列顺序原样使用', () => {
    expect(previewMemberLabels(['撰稿', '审校', '发布'])).toEqual(['撰稿', '审校', '发布'])
  })

  it('不超过上限时全部画出', () => {
    const names = ['a', 'b', 'c', 'd']
    expect(names).toHaveLength(PREVIEW_MEMBER_CAP)
    expect(previewMemberLabels(names)).toEqual(names)
  })

  it('超过上限时保留前几个，其余合成「+N」，节点总数等于上限', () => {
    const labels = previewMemberLabels(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(labels).toEqual(['a', 'b', 'c', '+4'])
    expect(labels).toHaveLength(PREVIEW_MEMBER_CAP)
  })
})

describe('buildPreviewTopology', () => {
  it('与聊天页 Workflow 图同一套结构：顺序是单链，并行有汇总，智能路由有路由节点', () => {
    const labels = ['A', 'B']
    expect(buildPreviewTopology('sequential', labels).edges.map((edge) => edge.id)).toEqual([
      'e-start-m0', 'e-m0-m1', 'e-m1-end',
    ])
    expect(buildPreviewTopology('parallel', labels).nodes.map((node) => node.id)).toEqual([
      'start', 'm0', 'm1', 'join', 'end',
    ])
    expect(buildPreviewTopology('llm_routing', labels).nodes.map((node) => node.id)).toEqual([
      'start', 'router', 'm0', 'm1', 'end',
    ])
  })

  it('成员节点用传入的文案，「+N」也是一个成员节点', () => {
    const topo = buildPreviewTopology('sequential', previewMemberLabels(['a', 'b', 'c', 'd', 'e']))
    const members = topo.nodes.filter((node) => node.data.kind === 'member')
    expect(members.map((node) => node.data.label)).toEqual(['a', 'b', 'c', '+2'])
  })
})

describe('previewFrame: 顺序执行', () => {
  it('开始 → A 运行 → A 完成、B 运行 → … → 结束，停顿后回到空闲再重播', () => {
    const at = (frame: number) => previewFrame('sequential', 3, frame)

    expect(at(0).nodes).toEqual({ m0: 'running', m1: 'pending', m2: 'pending' })
    expect(activeEdges(at(0))).toEqual(['e-start-m0'])
    expect(animatedEdges(at(0))).toEqual(['e-start-m0'])

    expect(at(1).nodes).toEqual({ m0: 'completed', m1: 'running', m2: 'pending' })
    expect(activeEdges(at(1))).toEqual(['e-m0-m1', 'e-start-m0'])
    expect(animatedEdges(at(1))).toEqual(['e-m0-m1'])

    expect(at(2).nodes).toEqual({ m0: 'completed', m1: 'completed', m2: 'running' })

    // 走到结束：全部完成，含 m2→end 的整条链点亮，且没有流动的边
    expect(at(3).nodes).toEqual({ m0: 'completed', m1: 'completed', m2: 'completed' })
    expect(activeEdges(at(3))).toEqual(['e-m0-m1', 'e-m1-m2', 'e-m2-end', 'e-start-m0'])
    expect(animatedEdges(at(3))).toEqual([])
    // 停顿一帧
    expect(at(4)).toEqual(at(3))
    // 空闲一帧后重播
    expect(at(5)).toEqual(idlePreviewFrame('sequential', 3))
    expect(at(6)).toEqual(at(0))
  })

  it('一轮的长度随成员数变化', () => {
    expect(previewFrame('sequential', 4, 3).nodes.m3).toBe('running')
    expect(previewFrame('sequential', 4, 7)).toEqual(previewFrame('sequential', 4, 0))
  })
})

describe('previewFrame: 并行执行', () => {
  it('所有成员同时运行 → 汇总 → 结束', () => {
    const at = (frame: number) => previewFrame('parallel', 3, frame)

    expect(at(0).nodes).toEqual({ m0: 'running', m1: 'running', m2: 'running', join: 'pending' })
    expect(activeEdges(at(0))).toEqual(['e-start-m0', 'e-start-m1', 'e-start-m2'])

    expect(at(1).nodes).toEqual({ m0: 'completed', m1: 'completed', m2: 'completed', join: 'running' })
    expect(animatedEdges(at(1))).toEqual(['e-m0-join', 'e-m1-join', 'e-m2-join'])
    expect(activeEdges(at(1))).not.toContain('e-join-end')

    expect(at(2).nodes.join).toBe('completed')
    expect(activeEdges(at(2))).toContain('e-join-end')
    expect(Object.values(at(2).edges).every((state) => state.active)).toBe(true)

    expect(at(4)).toEqual(idlePreviewFrame('parallel', 3))
    expect(at(5)).toEqual(at(0))
  })
})

describe('previewFrame: 智能路由', () => {
  it('路由运行 → 只有一个成员被选中，其余分支保持未走 → 结束', () => {
    const at = (frame: number) => previewFrame('llm_routing', 3, frame)

    expect(at(0).nodes).toEqual({ router: 'running', m0: 'pending', m1: 'pending', m2: 'pending' })
    expect(activeEdges(at(0))).toEqual(['e-start-router'])

    expect(at(1).nodes).toEqual({ router: 'completed', m0: 'running', m1: 'pending', m2: 'pending' })
    expect(activeEdges(at(1))).toEqual(['e-router-m0', 'e-start-router'])

    expect(at(2).nodes.m0).toBe('completed')
    expect(activeEdges(at(2))).toEqual(['e-m0-end', 'e-router-m0', 'e-start-router'])
    // 未选中的分支始终未走
    for (const id of ['e-router-m1', 'e-router-m2', 'e-m1-end', 'e-m2-end']) {
      expect(at(2).edges[id]).toEqual({ active: false, animated: false })
    }
  })

  it('每一轮换一个成员，轮完一圈回到第一个', () => {
    const chosen = (round: number) => {
      const frame = previewFrame('llm_routing', 3, round * 5 + 2)
      return Object.entries(frame.nodes).filter(([id, status]) => id !== 'router' && status === 'completed').map(([id]) => id)
    }
    expect(chosen(0)).toEqual(['m0'])
    expect(chosen(1)).toEqual(['m1'])
    expect(chosen(2)).toEqual(['m2'])
    expect(chosen(3)).toEqual(['m0'])
  })

  it('成员超过上限时在可见的槽位（含「+N」）间轮换', () => {
    const slots = previewMemberLabels(['a', 'b', 'c', 'd', 'e', 'f']).length
    expect(slots).toBe(PREVIEW_MEMBER_CAP)
    expect(previewFrame('llm_routing', slots, 3 * 5 + 1).nodes.m3).toBe('running')
    expect(previewFrame('llm_routing', slots, 4 * 5 + 1).nodes.m0).toBe('running')
  })
})

describe('idlePreviewFrame', () => {
  it('静态完整图：节点全部未开始，边全部未走', () => {
    const frame = idlePreviewFrame('parallel', 2)
    expect(Object.values(frame.nodes).every((status) => status === 'pending')).toBe(true)
    expect(Object.keys(frame.edges)).toHaveLength(buildPreviewTopology('parallel', ['a', 'b']).edges.length)
    expect(Object.values(frame.edges).every((state) => !state.active && !state.animated)).toBe(true)
  })

  it('没有成员时为空', () => {
    expect(idlePreviewFrame('sequential', 0)).toEqual({ nodes: {}, edges: {} })
    expect(previewFrame('sequential', 0, 3)).toEqual({ nodes: {}, edges: {} })
  })
})
