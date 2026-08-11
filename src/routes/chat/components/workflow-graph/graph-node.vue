<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import { STATUS_LABEL } from './runtime'
import type { WfNodeData } from './types'

defineOptions({ name: 'WorkflowGraphNode', inheritAttrs: false })

const props = defineProps<NodeProps<WfNodeData>>()

const emit = defineEmits<{ focusNode: [runId: string] }>()

/** 起点/终点画成"空心圆 + 内实心点"，其余三种画图标。 */
const isAnchor = computed(
  () => props.data.kind === 'anchor-start' || props.data.kind === 'anchor-end',
)

/** 图标沿用旧实现的选型：成员 bot、路由判定 brain-circuit、结果汇聚 zap。
 *  类名走项目既有的 lucide-static 字体约定（`icon icon-*`），
 *  字形由 CSS 的 ::before content 注入，尺寸只认 font-size。 */
const iconClass = computed(() => {
  switch (props.data.kind) {
    case 'router':
      return 'icon icon-brain-circuit'
    case 'join':
      return 'icon icon-zap'
    default:
      return 'icon icon-bot'
  }
})

/** 结构节点没有运行时状态，配色恒定，不参与状态类切换。 */
const statusClass = computed(() =>
  props.data.kind === 'member' ? `node-${props.data.status}` : null,
)

const stateText = computed(() =>
  props.data.disabled ? '成员已停用' : STATUS_LABEL[props.data.status],
)

/** 结构节点的提示只有名字，成员才带状态。 */
const tipText = computed(() =>
  props.data.kind === 'member' ? `${props.data.label} · ${stateText.value}` : props.data.label,
)

/** 有 runId 才可点：未跑过的节点没有流可看。是否真的存在该流由父组件判定。 */
const clickable = computed(() => props.data.kind === 'member' && !!props.data.runId)

/** 鼠标点击由父组件的 VueFlow @node-click 统一接管（那里还兼任打开 pointer-events
 *  的开关），这里只留键盘触发，避免同一次点击被处理两遍。 */
function onActivate() {
  if (props.data.runId) emit('focusNode', props.data.runId)
}
</script>

<template>
  <div
    :class="[
      $style.node,
      statusClass ? $style[statusClass] : null,
      {
        [$style['node-anchor']]: isAnchor,
        [$style['node-clickable']]: clickable,
        [$style['node-disabled']]: data.disabled,
      },
    ]"
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    :aria-label="tipText"
    @keydown.enter.prevent="onActivate"
    @keydown.space.prevent="onActivate"
  >
    <!-- 连接点不可见，只作为边的锚。上下走主流程，右侧留给 loop 回环 -->
    <Handle type="target" :position="Position.Top" :class="$style.handle" />
    <Handle type="source" :position="Position.Bottom" :class="$style.handle" />
    <Handle
      v-if="data.kind === 'member'"
      id="loop-in"
      type="target"
      :position="Position.Right"
      :class="$style.handle"
    />
    <Handle
      v-if="data.kind === 'member'"
      id="loop-out"
      type="source"
      :position="Position.Right"
      :class="$style.handle"
    />

    <span v-if="isAnchor" :class="$style['node-dot']"></span>
    <span v-else :class="[$style['node-icon'], iconClass]"></span>

    <!-- 名字不常驻画布，只在悬停/聚焦时浮出。宽度由浏览器排版，不再估算像素 -->
    <span :class="$style.tip">{{ tipText }}</span>
  </div>
</template>

<style module src="./graph-node.module.css"></style>
