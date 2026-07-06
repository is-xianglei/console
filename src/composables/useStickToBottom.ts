import { ref, type Ref } from 'vue'
import { useEventListener, useResizeObserver } from '@vueuse/core'

/**
 * 让一个可滚动容器在内容增长时“吸附到底部”。
 *
 * 设计要点:
 * - 用 VueUse 的 useResizeObserver 监听内部内容高度变化,覆盖“流式文本累加 /
 *   新增块 / 图片加载”等所有导致高度变化的情况(仅靠 watch 数组长度会漏掉
 *   text += delta 这种高度变了但长度没变的场景)。生命周期(observe / 卸载
 *   清理 / target 从 null 变为就绪)全部交给 VueUse,不自己管。
 * - stick-to-bottom 语义:内容变高时若当前贴在底部则跟随;一旦用户手动向上
 *   滚动则暂停跟随,待其滚回底部再自动恢复。
 * - 吸底动作用 requestAnimationFrame 合并,避免流式高频回调触发多余 reflow。
 *
 * @param scroller 滚动容器(overflow-y:auto 的元素)
 * @param content  内容包裹元素 ref;监听它的尺寸变化。可为条件渲染(初次 null),
 *                 VueUse 会在其就绪后自动开始观察。省略时监听 scroller 自身。
 */
export function useStickToBottom(
  scroller: Ref<HTMLElement | null>,
  content?: Ref<HTMLElement | null>,
) {
  // 是否处于“跟随底部”状态;用户上滚会置 false,滚回底部恢复 true
  const stick = ref(true)
  // 距底部多少像素以内都算“在底部”,容忍亚像素与惯性滚动的抖动
  const THRESHOLD = 32

  let raf = 0

  function atBottom(el: HTMLElement): boolean {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= THRESHOLD
  }

  function scrollToBottom() {
    const el = scroller.value
    if (el) el.scrollTop = el.scrollHeight
  }

  // rAF 合并:一帧内多次内容增长只滚一次
  function scheduleScroll() {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      if (stick.value) scrollToBottom()
    })
  }

  // 用户滚动时更新跟随意图:贴底则恢复跟随,离开底部则暂停
  useEventListener(scroller, 'scroll', () => {
    const el = scroller.value
    if (el) stick.value = atBottom(el)
  })

  // 内容尺寸变化即尝试吸底;target 可为条件渲染元素,VueUse 自动处理就绪时机
  useResizeObserver(content ?? scroller, () => scheduleScroll())

  return { stick, scrollToBottom }
}
