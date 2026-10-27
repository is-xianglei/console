/**
 * 流式正文的逐字揭示节奏(纯函数，组件只负责用 rAF 驱动)。
 *
 * 游标 cursor 按真实经过的时间推进：基准是 AICSS 演示的每 9ms 2 字(约 222 字/秒)；
 * 积压过多时临时提速，保证剩余内容在 CATCH_UP_MS 内追平，长回复不会越落越远。
 */

/** 基准揭示速度(字/ms) */
export const BASE_RATE = 2 / 9
/** 积压追平的上限时间(ms) */
export const CATCH_UP_MS = 1000

export interface PacerState {
  /** 已揭示字数，带小数，渲染时向下取整 */
  cursor: number
  /** 已收到的字数 */
  target: number
  /** 当前揭示速度(字/ms)，每次收到新内容时按积压重算 */
  rate: number
}

/** 积压对应的揭示速度：不低于基准，积压越多越快 */
function rateFor(backlog: number): number {
  return Math.max(BASE_RATE, backlog / CATCH_UP_MS)
}

/** 内容全部显示、没有待揭示的字 */
export function createPacer(initialLength: number): PacerState {
  return { cursor: initialLength, target: initialLength, rate: BASE_RATE }
}

/**
 * 挂载时的起点：流式中挂载的从头揭示，已结束的(历史消息)直接全部显示。
 * 后端常把块开始和首段文字放在同一个数据块里推来，组件挂载时就已有字；
 * 若挂载即全部显示，整段一次到达的短回复会完全看不到打字效果。
 * 流式中途切回来的会话也会从头揭示，积压由追赶速度在 CATCH_UP_MS 内追平。
 */
export function initialPacer(length: number, replay: boolean): PacerState {
  return replay ? retargetPacer(createPacer(0), length) : createPacer(length)
}

/** 收到新内容：更新目标长度并按新的积压重算速度；文本被整体替换变短时游标随之回落 */
export function retargetPacer(state: PacerState, length: number): PacerState {
  const cursor = Math.min(state.cursor, length)
  return { cursor, target: length, rate: rateFor(length - cursor) }
}

/** 推进 elapsed 毫秒，游标不会超过目标长度 */
export function advancePacer(state: PacerState, elapsed: number): PacerState {
  if (state.cursor >= state.target || elapsed <= 0) return state
  return { ...state, cursor: Math.min(state.target, state.cursor + state.rate * elapsed) }
}

/** 已揭示的整数字数；不在代理对中间截断，免得 emoji 半个字符显示成乱码 */
export function revealedLength(text: string, cursor: number): number {
  let end = Math.min(text.length, Math.floor(cursor))
  const code = text.charCodeAt(end - 1)
  if (end > 0 && end < text.length && code >= 0xd800 && code <= 0xdbff) end -= 1
  return end
}
