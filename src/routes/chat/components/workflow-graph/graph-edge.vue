<script setup lang="ts">
import { computed } from 'vue'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@vue-flow/core'
import type { WfEdgeData } from './types'

defineOptions({ name: 'WorkflowGraphEdge', inheritAttrs: false })

const props = defineProps<EdgeProps<WfEdgeData>>()

const isLoopback = computed(() => props.data?.kind === 'loopback')

/** 回环边两端都挂在节点右侧，默认曲率会把它压成一条贴着节点的窄弧。
 *  加大曲率让它向右鼓出去，走主轴右边的空白列，与旧实现的走线一致。 */
const path = computed(() =>
  getBezierPath({ ...props, curvature: isLoopback.value ? 1.1 : 0.25 }),
)

const edgeClass = computed(() => {
  if (isLoopback.value) return 'edge-loop'
  return props.data?.active ? 'edge-active' : 'edge-idle'
})
</script>

<template>
  <BaseEdge
    :id="id"
    :path="path[0]"
    :marker-end="markerEnd"
    :class="[$style.edge, $style[edgeClass]]"
  />

  <!-- 分支标签用 HTML 渲染：宽度交给浏览器排版，
       不必再按字符类别估算像素，也不必手动挖空底下的连线 -->
  <EdgeLabelRenderer v-if="data?.routeKey">
    <div
      :class="$style['edge-label']"
      :style="{ transform: `translate(-50%, -50%) translate(${path[1]}px, ${path[2]}px)` }"
    >
      {{ data.routeKey }}
    </div>
  </EdgeLabelRenderer>
</template>

<style module src="./graph-edge.module.css"></style>
