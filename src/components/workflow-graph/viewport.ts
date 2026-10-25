import type { LayoutBBox } from './types'

/** 画布四周留白（px），对齐旧实现 .graph-canvas 的 padding: 16px，组件层复用同一个数。 */
export const CANVAS_PADDING = 16

/** 缩放下限，与组件上的 :min-zoom="0.1" 保持一致，避免极窄容器把图缩成一个点。 */
export const MIN_ZOOM = 0.1

/** setViewport 的入参。x/y 是内容原点在容器坐标系里的平移量（不是内容中心），zoom 是缩放倍数。 */
export interface Viewport {
  x: number
  y: number
  zoom: number
}

/**
 * 复刻旧 SVG 实现（viewBox + max-width + flex 居中）的视口语义：
 * 优先按宽度贴合、水平居中、顶部对齐。不用 Vue Flow 自带的 fitView，
 * 因为它会同时贴合宽高并**竖向居中**，而这里要的是顶部对齐。
 *
 * 与旧实现的唯一差异：竖向放不下时旧版靠原生滚动，Vue Flow 的画布是绝对定位的
 * 平移容器，滚动不会发生，内容会被直接裁掉。所以这里在高度不够时按高度再贴合一次，
 * 取两者中更小的缩放，保证整图始终可见；高度有富余时则上下居中。
 */
export function fitViewport(bbox: LayoutBBox, size: { width: number; height: number }): Viewport {
  // 面板刚出现、过渡动画没跑完时容器宽度真的会是 0，除零会产出 NaN/Infinity，
  // 这里直接兜底成 1:1 顶部对齐，等尺寸就绪后再重算一次即可。
  if (bbox.width <= 0 || size.width <= 0) {
    return { x: 0, y: CANVAS_PADDING, zoom: 1 }
  }

  const availableWidth = size.width - CANVAS_PADDING * 2
  const availableHeight = size.height - CANVAS_PADDING * 2
  // 封顶 1×：容器比图宽时保持 1:1 绝不放大，放大会把 1.25px 的描边糊成粗边
  let zoom = Math.min(availableWidth / bbox.width, 1)
  // 高度兜底：内容比容器高时按高度再收一次，否则底部节点会被裁掉
  if (bbox.height > 0 && availableHeight > 0) {
    zoom = Math.min(zoom, availableHeight / bbox.height)
  }
  // 夹住 MIN_ZOOM：容器窄到极限时不再继续缩，剩下的交给溢出
  zoom = Math.max(zoom, MIN_ZOOM)

  // 横竖都居中。内容比容器高时 (size.height - 内容高) / 2 会转负，
  // 用 CANVAS_PADDING 兜住，保证顶部始终留边距而不是被顶出画布
  return {
    x: (size.width - bbox.width * zoom) / 2,
    y: Math.max(CANVAS_PADDING, (size.height - bbox.height * zoom) / 2),
    zoom,
  }
}
