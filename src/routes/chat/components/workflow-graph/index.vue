<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { MarkerType, VueFlow, useVueFlow, type Edge, type Node, type NodeMouseEvent } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { getPlanDetail } from '@/http/orchestration-plan'
import { PLAN_MODE_LABEL } from '@/hooks/useOrchestrationPlanManager'
import { WORKFLOW_MODE_LABEL } from '@/constants/workflow'
import type { PlanResponse } from '@/interfaces/orchestration-plan/api'
import type { WorkflowResponse } from '@/interfaces/workflow/api'
import { useConsoleStore } from '@/stores/console'
import { useWorkflowsStore } from '@/stores/workflows'
import GraphEdge from '@/components/workflow-graph/graph-edge.vue'
import GraphNode from '@/components/workflow-graph/graph-node.vue'
import { buildTopology, buildWorkflowTopology } from '@/components/workflow-graph/topology'
import { layoutTopology } from '@/components/workflow-graph/layout'
import { MIN_ZOOM, fitViewport } from '@/components/workflow-graph/viewport'
import {
  deriveEdgeActive,
  deriveHitRoute,
  deriveIterationBadge,
  deriveStatusText,
  deriveWorkflowEdgeActive,
  deriveWorkflowStatusText,
  deriveWorkflowStepBadge,
  findRootState,
  resolveMemberRuntime,
  resolveWorkflowRuntime,
} from '@/components/workflow-graph/runtime'
import type { WfEdgeData, WfNodeData } from '@/components/workflow-graph/types'

defineOptions({ name: 'WorkflowGraph' })

const props = defineProps<{
  /** 当前会话绑定的编排方案 ID */
  planId?: number | null
  /** 当前会话绑定的 Workflow ID；与 planId 二选一，同时给时 Workflow 优先 */
  workflowId?: number | null
}>()

const store = useConsoleStore()
const workflowsStore = useWorkflowsStore()

/** 只读视图：关掉全部编辑能力。未来开放拖拽编辑只需改这一处。 */
const READONLY = {
  nodesDraggable: false,
  nodesConnectable: false,
  nodesFocusable: true,
  edgesFocusable: false,
  edgesUpdatable: false,
  elementsSelectable: false,
  selectionKeyCode: null,
  panOnDrag: false,
  panOnScroll: false,
  zoomOnScroll: false,
  zoomOnPinch: false,
  zoomOnDoubleClick: false,
  preventScrolling: false,
  autoConnect: false,
} as const

const nodeTypes = { wf: markRaw(GraphNode) }
const edgeTypes = { wf: markRaw(GraphEdge) }

const plan = ref<PlanResponse | null>(null)
const workflow = ref<WorkflowResponse | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const canvasRef = ref<HTMLElement | null>(null)

const { findNode, findEdge, setViewport } = useVueFlow()

/** 静态布局。依赖里只有 plan，没有 graphNodes —— 这是全组件最关键的一行：
 *  Vue 的依赖追踪由此保证 SSE 事件涌进来时 dagre 一次都不会重跑。
 *  一旦在这条链路里读了 graphNodes，每个事件都会触发一次全图重排。 */
const layouted = computed(() => {
  if (workflow.value) return layoutTopology(buildWorkflowTopology(workflow.value))
  return plan.value ? layoutTopology(buildTopology(plan.value)) : null
})

/** 灌给 Vue Flow 的初始节点/边。用 shallowRef 存，避免深层响应式在打补丁时反复触发。 */
const flowNodes = shallowRef<Node<WfNodeData>[]>([])
const flowEdges = shallowRef<Edge<WfEdgeData>[]>([])

watch(
  layouted,
  (result) => {
    if (!result) {
      flowNodes.value = []
      flowEdges.value = []
      return
    }
    flowNodes.value = result.nodes.map((node) => ({
      id: node.id,
      type: 'wf',
      position: node.position,
      width: node.width,
      height: node.height,
      data: { ...node.data },
    }))
    flowEdges.value = result.edges.map((edge) => ({
      id: edge.id,
      type: 'wf',
      source: edge.source,
      target: edge.target,
      // 回环边挂在节点右侧的专用把手上，走主轴右边的空白列
      sourceHandle: edge.data.kind === 'loopback' ? 'loop-out' : undefined,
      targetHandle: edge.data.kind === 'loopback' ? 'loop-in' : undefined,
      markerEnd: MarkerType.ArrowClosed,
      data: { ...edge.data },
    }))
  },
  { immediate: true },
)

/** 运行时补丁：只算"该改成什么"，不重建节点数组。 */
const runtimePatch = computed(() => {
  const result = layouted.value
  if (!result) return null
  const flowOnly = result.edges.filter((edge) => edge.data.kind === 'flow')
  if (workflow.value) {
    // Workflow 图：数据源是 workflow_progress 归并结果 + 右栏面板（反查 run_id）
    const progress = store.state.workflowProgress
    const runtime = resolveWorkflowRuntime(result.nodes, progress, store.state.agents)
    const active = deriveWorkflowEdgeActive(result.nodes, flowOnly, runtime, progress.routedAgentId)
    return { runtime, active, nodes: result.nodes, edges: result.edges }
  }
  const runtime = resolveMemberRuntime(result.nodes, store.state.graphNodes)
  const active = deriveEdgeActive(result.nodes, flowOnly, runtime)
  return { runtime, active, nodes: result.nodes, edges: result.edges }
})

function applyPatch(patch: NonNullable<typeof runtimePatch.value> | null) {
  if (!patch) return
  for (const node of patch.nodes) {
    const runtime = patch.runtime[node.id]
    if (!runtime) continue
    const target = findNode<WfNodeData>(node.id)
    if (!target) continue
    target.data = { ...target.data, status: runtime.status, runId: runtime.runId }
  }
  for (const edge of patch.edges) {
    const target = findEdge<WfEdgeData>(edge.id)
    if (!target) continue
    const isActive = patch.active[edge.id] ?? false
    target.data = { ...target.data, active: isActive }
    // 目标节点正在执行时让虚线流动起来；回环边与执行进度无关，不参与
    target.animated =
      edge.data.kind === 'flow' && patch.runtime[edge.target]?.status === 'running'
  }
}

watch(runtimePatch, applyPatch)
// 换方案时 layouted 重建，要等 Vue Flow 吃进新节点后再补一次状态
watch(layouted, () => applyPatch(runtimePatch.value), { flush: 'post' })

// ===== 头部角标与底部状态条 =====
/** 顺序 Workflow 的步骤角标；方案图不用它。 */
const stepBadge = computed(() =>
  workflow.value?.mode === 'sequential' ? deriveWorkflowStepBadge(store.state.workflowProgress) : null,
)

const iterationBadge = computed(() => {
  if (workflow.value || plan.value?.mode !== 'loop' || !layouted.value) return null
  return deriveIterationBadge(
    layouted.value.nodes,
    store.state.graphNodes,
    plan.value.config.max_iterations,
  )
})

const hitRoute = computed(() =>
  layouted.value && !workflow.value ? deriveHitRoute(layouted.value.nodes, store.state.graphNodes) : null,
)

/** llm_routing 命中的成员名，作头部角标。 */
const routedMemberName = computed(() => {
  const agentId = store.state.workflowProgress.routedAgentId
  if (!workflow.value || agentId == null) return null
  const member = workflow.value.agents.find((item) => item.agent_id === agentId)
  return member?.agent_name ?? store.state.workflowProgress.members[agentId]?.memberName ?? null
})

const statusText = computed(() => {
  if (loading.value) return workflow.value || props.workflowId != null ? '正在加载 Workflow 定义…' : '正在加载方案拓扑…'
  if (loadError.value) return loadError.value
  const patch = runtimePatch.value
  if (!patch) return '等待开始'
  if (workflow.value) {
    return deriveWorkflowStatusText(patch.nodes, patch.runtime, store.state.workflowProgress)
  }
  return deriveStatusText(patch.nodes, patch.runtime, findRootState(store.state.graphNodes))
})

const isEmpty = computed(() => !layouted.value || layouted.value.nodes.length === 0)

// ===== 视口 =====
/** 不用 fitView：它同时贴合宽高并竖向居中，而旧实现是"按宽度贴合、封顶 1×、顶部对齐"。 */
let rafId = 0
function syncViewport() {
  const el = canvasRef.value
  const result = layouted.value
  if (!el || !result) return
  cancelAnimationFrame(rafId)
  // 侧栏带 width 过渡，面板刚出现时容器宽度还是 0，同帧读尺寸会算出错误 zoom
  rafId = requestAnimationFrame(() => {
    const viewport = fitViewport(result.bbox, {
      width: el.clientWidth,
      height: el.clientHeight,
    })
    void setViewport(viewport)
  })
}

let observer: ResizeObserver | null = null
watch(canvasRef, (el) => {
  observer?.disconnect()
  if (!el) return
  observer = new ResizeObserver(syncViewport)
  observer.observe(el)
})
watch(layouted, syncViewport, { flush: 'post' })

onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(rafId)
})

// ===== 交互 =====
/** 点节点切右栏：面板键就是事件里的 actor.run_id，未跑过的节点没有流可看。 */
function onFocusNode(runId: string) {
  if (!store.state.agents.some((agent) => agent.id === runId)) return
  store.selectAgent(runId)
}

/**
 * 点击必须由 VueFlow 的 node-click 接管，不能只写在节点组件内部：
 * Vue Flow 的 hasPointerEvents = 可选中 || 可拖拽 || 挂了 node 鼠标事件监听，
 * 三者全无时它会给每个节点套上 pointer-events: none，
 * 于是节点内部的 click 和 :hover 全部收不到事件 —— 悬停浮标也跟着失踪。
 * 这个只读视图前两项都是 false，所以这个监听同时兼任「打开指针事件」的开关。
 */
function onNodeClick({ node }: NodeMouseEvent) {
  const data = node.data as WfNodeData | undefined
  if (data?.kind === 'member' && data.runId) onFocusNode(data.runId)
}

// ===== 数据加载 =====
/** 拉方案静态拓扑；未跑的节点、routing 未命中分支全靠它补齐。 */
async function loadPlan(planId: number) {
  loading.value = true
  loadError.value = null
  try {
    const detail = await getPlanDetail(planId)
    // 请求返回时 props 可能已切到别的方案,丢弃过期结果
    if (props.planId !== planId) return
    plan.value = detail
  } catch (error) {
    if (props.planId !== planId) return
    plan.value = null
    loadError.value = error instanceof Error ? error.message : '方案拓扑加载失败'
  } finally {
    if (props.planId === planId) loading.value = false
  }
}

/** 拉 Workflow 定义；成员顺序与模式全靠它，进度事件只带 agent_id。 */
async function loadWorkflow(workflowId: number) {
  loading.value = true
  loadError.value = null
  const detail = await workflowsStore.loadWorkflowDetail(workflowId)
  // 请求返回时 props 可能已切到别的 Workflow；undefined 表示工作区已切换，同样丢弃
  if (props.workflowId !== workflowId || detail === undefined) return
  loading.value = false
  if (detail === null) {
    workflow.value = null
    loadError.value = 'Workflow 定义加载失败'
    return
  }
  workflow.value = detail
}

/** Workflow 与方案二选一，Workflow 优先：两者互斥由后端保证，这里只做兜底。 */
watch(
  () => [props.workflowId, props.planId] as const,
  ([workflowId, planId]) => {
    if (workflowId != null) {
      plan.value = null
      void loadWorkflow(workflowId)
      return
    }
    workflow.value = null
    if (planId == null) {
      plan.value = null
      loadError.value = null
      loading.value = false
      return
    }
    void loadPlan(planId)
  },
  { immediate: true },
)
</script>

<template>
  <section :class="$style['workflow-graph']" aria-label="编排执行图">
    <header :class="$style['graph-head']">
      <span :class="$style['graph-title']">{{ workflow?.name ?? plan?.name ?? '编排执行图' }}</span>
      <span v-if="workflow" :class="$style['graph-mode']">{{ WORKFLOW_MODE_LABEL[workflow.mode] }}</span>
      <span v-else-if="plan" :class="$style['graph-mode']">{{ PLAN_MODE_LABEL[plan.mode] }}</span>
      <span :class="$style['graph-spacer']"></span>
      <span v-if="stepBadge" :class="$style['graph-badge']">第 {{ stepBadge }} 步</span>
      <span v-if="iterationBadge" :class="$style['graph-badge']">第 {{ iterationBadge }} 轮</span>
      <span v-if="hitRoute" :class="$style['graph-badge']">命中分支 {{ hitRoute }}</span>
      <span v-if="routedMemberName" :class="$style['graph-badge']">路由至 {{ routedMemberName }}</span>
    </header>

    <div ref="canvasRef" :class="$style['graph-canvas']">
      <p v-if="loadError" :class="$style['graph-empty']">{{ loadError }}</p>
      <p v-else-if="loading" :class="$style['graph-empty']">{{ workflowId != null ? '正在加载 Workflow 定义…' : '正在加载方案拓扑…' }}</p>
      <p v-else-if="isEmpty" :class="$style['graph-empty']">{{ workflowId != null ? '该 Workflow 暂无成员' : '该方案暂无成员' }}</p>
      <VueFlow
        v-else
        :nodes="flowNodes"
        :edges="flowEdges"
        :node-types="nodeTypes"
        :edge-types="edgeTypes"
        :min-zoom="MIN_ZOOM"
        :max-zoom="1"
        v-bind="READONLY"
        :class="$style['graph-flow']"
        @node-click="onNodeClick"
      >
        <Background :gap="16" :size="1" pattern-color="var(--ui-border-accented)" />
        <template #node-wf="nodeProps">
          <GraphNode v-bind="nodeProps" @focus-node="onFocusNode" />
        </template>
        <template #edge-wf="edgeProps">
          <GraphEdge v-bind="edgeProps" />
        </template>
      </VueFlow>
    </div>

    <footer :class="$style['graph-status']">
      <span :class="$style['graph-status-mark']">&gt;</span>
      <span>{{ statusText }}</span>
    </footer>
  </section>
</template>

<style module src="./index.module.css"></style>
