<script setup lang="ts">
import { computed } from 'vue'
import { BaseEdge, getBezierPath, type EdgeProps } from '@vue-flow/core'
import type { WfEdgeData } from './types'

defineOptions({ name: 'WorkflowGraphEdge', inheritAttrs: false })

const props = defineProps<EdgeProps<WfEdgeData>>()

const path = computed(() => getBezierPath({ ...props, curvature: 0.25 }))

const edgeClass = computed(() => (props.data?.active ? 'edge-active' : 'edge-idle'))
</script>

<template>
  <BaseEdge
    :id="id"
    :path="path[0]"
    :marker-end="markerEnd"
    :class="[$style.edge, $style[edgeClass]]"
  />
</template>

<style module src="./graph-edge.module.css"></style>
