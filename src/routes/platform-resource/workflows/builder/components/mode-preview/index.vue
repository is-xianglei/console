<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, ref, shallowRef, useId, watch } from 'vue'
import { MarkerType, Position, VueFlow, useVueFlow, type Edge, type Node } from '@vue-flow/core'
import { usePreferredReducedMotion, useResizeObserver } from '@vueuse/core'
import GraphEdge from '@/components/workflow-graph/graph-edge.vue'
import GraphNode from '@/components/workflow-graph/graph-node.vue'
import { layoutTopology } from '@/components/workflow-graph/layout'
import { NODE_SIZE, type WfEdgeData, type WfNodeData } from '@/components/workflow-graph/types'
import type { WorkflowMode } from '@/interfaces/workflow/api'
import {
  PREVIEW_TICK_MS,
  buildPreviewTopology,
  idlePreviewFrame,
  previewFrame,
  previewMemberLabels,
  type PreviewFrame,
} from './frames'

/** 编排模式的运行图预览：横向画出该模式的结构，playing 时循环演示流转轨迹。只展示，不可交互。 */
defineOptions({ name: 'WorkflowModePreview' })

const props = defineProps<{
  mode: WorkflowMode
  /** 表单里已选成员的名字，按排列顺序；为空时用占位成员 */
  memberNames: readonly string[]
  playing: boolean
}>()

/** 兄弟节点空隙：名字占节点下方 22px（6 间隙 + 16 行高），剩 14px 给名字与下一个节点之间，
 *  窄屏缩到 0.6 倍时仍有 8px 以上 */
const NODE_SEP = 36
/** rank 空隙。顺序执行只有水平边：中心距 100 刚好容下两侧各 46px 的名字（.caption max-width 92px）。
 *  并行/路由有扇出边：Vue Flow 的贝塞尔在两个 rank 中间才拐弯，间距太近时弯段会扫过
 *  上下兄弟节点的名字，加到 76 后弯段在名字左缘之前基本走完。 */
const RANK_SEP = { chain: 56, fan: 76 } as const
/** fitView 留白（px）：名字挂在节点框外（下方 22px、左右各伸出 24px），留白要把它包进来 */
const FIT_PADDING = { top: 12, bottom: 34, left: 32, right: 32 }
/** Vue Flow 把纯数字 padding 当比例，像素值必须写成 '12px' */
const FIT_PADDING_PX = {
  top: `${FIT_PADDING.top}px`,
  bottom: `${FIT_PADDING.bottom}px`,
  left: `${FIT_PADDING.left}px`,
  right: `${FIT_PADDING.right}px`,
} as const

/** 全部关掉：不拖、不缩放、不平移、不选中、不连线，也不注册键盘监听。 */
const STATIC_VIEW = {
  nodesDraggable: false,
  nodesConnectable: false,
  nodesFocusable: false,
  edgesFocusable: false,
  edgesUpdatable: false,
  elementsSelectable: false,
  selectNodesOnDrag: false,
  connectOnClick: false,
  autoConnect: false,
  panOnDrag: false,
  panOnScroll: false,
  zoomOnScroll: false,
  zoomOnPinch: false,
  zoomOnDoubleClick: false,
  preventScrolling: false,
  disableKeyboardA11y: true,
  deleteKeyCode: null,
  selectionKeyCode: null,
  multiSelectionKeyCode: null,
  zoomActivationKeyCode: null,
  panActivationKeyCode: null,
} as const

const nodeTypes = { wf: markRaw(GraphNode) }
const edgeTypes = { wf: markRaw(GraphEdge) }

/** 同页三张图各用一个独立的 store；useId 在组件实例间唯一，换掉 SSR 风格的冒号免得进 DOM id。 */
const flowId = `wf-mode-preview-${useId().replace(/[^\w-]/g, '')}`
const { findNode, findEdge, fitView } = useVueFlow(flowId)

const canvasRef = ref<HTMLElement | null>(null)

const labels = computed(() => previewMemberLabels(props.memberNames))
const slotCount = computed(() => labels.value.length)

const layouted = computed(() =>
  layoutTopology(buildPreviewTopology(props.mode, labels.value), {
    direction: 'LR',
    nodeSep: NODE_SEP,
    rankSep: props.mode === 'sequential' ? RANK_SEP.chain : RANK_SEP.fan,
  }),
)

/** 每种模式按自己的内容定高：顺序执行只有一排节点；并行/路由按成员槽位的扇出高度算，名字按 1× 排得下。 */
const canvasHeight = computed(() => {
  const rows = props.mode === 'sequential' ? 1 : slotCount.value
  return rows * NODE_SIZE + (rows - 1) * NODE_SEP + FIT_PADDING.top + FIT_PADDING.bottom
})

const flowNodes = shallowRef<Node<WfNodeData>[]>([])
const flowEdges = shallowRef<Edge<WfEdgeData>[]>([])

watch(
  layouted,
  (result) => {
    flowNodes.value = result.nodes.map((node) => ({
      id: node.id,
      type: 'wf',
      position: node.position,
      width: node.width,
      height: node.height,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { ...node.data },
    }))
    flowEdges.value = result.edges.map((edge) => ({
      id: edge.id,
      type: 'wf',
      source: edge.source,
      target: edge.target,
      // 对象写法的 marker id 带 flow id 前缀；字符串写法三张图会共用同一个 <marker id>
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { ...edge.data },
    }))
  },
  { immediate: true },
)

// ===== 流转动画 =====
const reducedMotion = usePreferredReducedMotion()
const animating = computed(() => props.playing && reducedMotion.value !== 'reduce')
const frame = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function stopTimer() {
  if (timer != null) clearInterval(timer)
  timer = null
}

watch(
  animating,
  (value) => {
    stopTimer()
    frame.value = 0
    if (!value) return
    timer = setInterval(() => {
      frame.value += 1
    }, PREVIEW_TICK_MS)
  },
  { immediate: true },
)

const current = computed<PreviewFrame>(() =>
  animating.value
    ? previewFrame(props.mode, slotCount.value, frame.value)
    : idlePreviewFrame(props.mode, slotCount.value),
)

function applyFrame(next: PreviewFrame) {
  for (const [id, status] of Object.entries(next.nodes)) {
    const node = findNode<WfNodeData>(id)
    if (node && node.data.status !== status) node.data = { ...node.data, status }
  }
  for (const [id, state] of Object.entries(next.edges)) {
    const edge = findEdge<WfEdgeData>(id)
    if (!edge) continue
    if (edge.data?.active !== state.active) edge.data = { ...(edge.data as WfEdgeData), active: state.active }
    edge.animated = state.animated
  }
}

watch(current, applyFrame, { flush: 'post' })

// ===== 视口 =====
let rafId = 0
function syncViewport() {
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    void fitView({ padding: FIT_PADDING_PX, maxZoom: 1, minZoom: 0.2 })
  })
}

function onNodesInitialized() {
  applyFrame(current.value)
  syncViewport()
}

// 换成员后 Vue Flow 重建节点，补一次状态与视口
watch(layouted, () => {
  void nextTick(() => applyFrame(current.value))
  syncViewport()
}, { flush: 'post' })

useResizeObserver(canvasRef, syncViewport)

onBeforeUnmount(() => {
  stopTimer()
  cancelAnimationFrame(rafId)
})
</script>

<template>
  <div ref="canvasRef" :class="$style['mode-preview']" :style="{ height: `${canvasHeight}px` }" aria-hidden="true">
    <VueFlow
      :id="flowId"
      :nodes="flowNodes"
      :edges="flowEdges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :min-zoom="0.2"
      :max-zoom="1"
      v-bind="STATIC_VIEW"
      :class="$style['mode-preview-flow']"
      @nodes-initialized="onNodesInitialized"
    >
      <template #node-wf="nodeProps">
        <GraphNode v-bind="nodeProps" preview />
      </template>
      <template #edge-wf="edgeProps">
        <GraphEdge v-bind="edgeProps" />
      </template>
    </VueFlow>
  </div>
</template>

<style module src="./index.module.css"></style>
