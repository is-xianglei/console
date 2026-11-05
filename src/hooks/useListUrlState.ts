import { computed, reactive, watch, type ComputedRef } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'

export type ListUrlValue = string | number | boolean | string[] | null

/**
 * 字段级编解码器。缺省规则：
 * - string：原样；trim 后为空不写
 * - number：str(v)；读回 Number()，NaN 回退默认
 * - boolean：'1' / '0'；读回 '1' / '0' 映射，其余回退默认
 * - string[]：逗号拼接；空数组不写；读回 split(',')
 */
export interface ListUrlCodec<V = unknown> {
  encode(value: V): string | undefined
  decode(raw: string): V
  /** 该值是否等于默认值（决定是否写入 query / 重置按钮是否禁用）。 */
  isDefault(value: V, def: V): boolean
}

export interface ListUrlStateOptions<T extends Record<string, unknown>> {
  /** 各字段默认值；等于默认值的字段不写入 query。page/pageSize 为保留字段名。 */
  defaults: T
  /** 字段级编解码；缺省按值类型自动推断。 */
  codecs?: Partial<{ [K in keyof T]: ListUrlCodec<T[K]> }>
  /** page / pageSize 对应的 query key 名。 */
  pageKeys?: { page?: string; pageSize?: string }
  /** 这些字段变化时把 page 复位为 1；缺省为非 page/pageSize 的所有字段。pageSize 变化总会复位 page。 */
  resetPageOn?: (keyof T)[]
}

export interface ListUrlState<T extends Record<string, unknown>> {
  /** 与 route.query 双向绑定的 reactive 状态，manager hook 用它替代零散的 ref。 */
  state: T
  /** 批量写入（筛选卡「搜索」按钮）；命中的非分页字段会触发 page 复位。 */
  apply(patch: Partial<T>): void
  /** 回到 defaults（「重置」按钮）。 */
  reset(): void
  /** 全部字段是否等于默认值；供「重置」按钮禁用。 */
  isDefault: ComputedRef<boolean>
  /** 当前 state 对应的 query（不含等于默认值的键）。 */
  toQuery(): LocationQueryRaw
}

function isPlainDefault(value: unknown, def: unknown): boolean {
  if (value == null) return def == null
  if (Array.isArray(value)) return value.length === 0
  return value === def
}

function inferCodec(def: ListUrlValue): ListUrlCodec {
  const c: ListUrlCodec = {
    encode(value) {
      if (value == null) return undefined
      if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed ? trimmed : undefined
      }
      if (Array.isArray(value)) return value.length ? value.join(',') : undefined
      // 布尔必须写 '1'/'0'：decode 只认这两个字面量，其余一律回落默认值。
      // 早先这里走 String(value) 写出 'true'，写进 URL 后被 query watcher 回读成
      // 默认值，表现为布尔筛选「点了就弹回去」（部门页「全部展开/折叠」永久失效）。
      if (typeof value === 'boolean') return value ? '1' : '0'
      return String(value)
    },
    decode(raw) {
      if (typeof def === 'number') {
        const parsed = Number(raw)
        return Number.isFinite(parsed) ? parsed : def
      }
      if (typeof def === 'boolean') return raw === '1' ? true : raw === '0' ? false : def
      if (Array.isArray(def)) return raw ? raw.split(',') : []
      return typeof def === 'string' ? raw : def
    },
    isDefault: isPlainDefault,
  }
  return c
}

/** 供单测直接断言的默认编解码（包一层转成泛型避免类型噪音）。 */
export const listUrlCodec = <V extends ListUrlValue>(def: V): ListUrlCodec<V> => inferCodec(def) as ListUrlCodec<V>

/** created_at(ISO) 是否落在 [start, end] 两个日期字符串范围内（同天视为命中）。 */
export function inDateRange(iso: string, start: string, end: string): boolean {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return false
  const [s, e] = [Date.parse(start), Date.parse(end)]
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false
  return at >= s && at <= e + 86_399_000
}
/**
 * 把一组筛选字段与 route.query 双向绑定（R1）。
 *
 * 规则：
 * - 空串 / null / 等于默认值不写入 query；
 * - 数组用逗号拼接；数字回读 `Number()`，NaN 回退默认；
 * - 筛选变化用 `router.replace`（不制造历史），`page` 变化用 `router.push`（后退可回上一页）；
 * - 初始化先从 query 读入再开始 watch，避免首帧把 query 清空；
 * - 路由变化时只回读 state、不写回 URL；组件卸载自动停止。
 */
export function useListUrlState<T extends Record<string, unknown>>(
  options: ListUrlStateOptions<T>,
): ListUrlState<T> {
  const route = useRoute()
  const router = useRouter()
  const defaults = options.defaults
  const pageKey = options.pageKeys?.page ?? 'page'
  const pageSizeKey = options.pageKeys?.pageSize ?? 'pageSize'
  const resetPageOn = options.resetPageOn
    ?? (Object.keys(defaults).filter((k) => k !== pageKey && k !== pageSizeKey) as (keyof T)[])

  const codecs = {} as Record<keyof T, ListUrlCodec<unknown>>
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    codecs[key] = (options.codecs?.[key] ?? inferCodec(defaults[key] as ListUrlValue)) as ListUrlCodec<unknown>
  }

  // 状态源：reactive 值对象，与 URL 互相同步。
  const state = reactive({ ...defaults }) as T

  function decodeRaw(raw: unknown, key: keyof T): T[keyof T] {
    if (Array.isArray(raw)) {
      if (!raw.length) return defaults[key]
      return codecs[key].decode(String(raw[raw.length - 1])) as T[keyof T]
    }
    if (raw == null || raw === '') return defaults[key]
    return codecs[key].decode(String(raw)) as T[keyof T]
  }

  /** 从当前 route.query 一次性读入所有字段（初始化 / 路由参数切换时用）。 */
  function syncFromQuery() {
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      state[key] = decodeRaw(route.query[key as string], key)
    }
  }

  /** 当前 state 应写入的 query（= 过滤掉默认值键后的编码结果）。 */
  function estimateQuery(overrides?: Partial<{ [K in keyof T]: T[K] }>): LocationQueryRaw {
    const query: LocationQueryRaw = {}
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const value = overrides && key in overrides ? overrides[key] : state[key]
      if (codecs[key].isDefault(value, defaults[key])) continue
      const encoded = codecs[key].encode(value)
      if (encoded === undefined) continue
      query[key as string] = encoded
    }
    return query
  }

  /** 与即将生效的 query 逐键比较，相同则不写，切断「写 query → watch → 再写」回环。 */
  function queryEquals(next: LocationQueryRaw, current: LocationQueryRaw): boolean {
    const nextKeys = Object.keys(next)
    if (nextKeys.length !== Object.keys(current).length) return false
    for (const key of nextKeys) {
      const cur = current[key]
      const nxt = next[key]
      const curStr = Array.isArray(cur) ? cur[cur.length - 1] : cur
      if (String(curStr) !== String(nxt)) return false
    }
    return true
  }

  // 初始化：先读入 query，再开始 watch，避免首帧把 query 清空。
  syncFromQuery()

  let prevState: Record<string, unknown> = snapshotState(state)
  // hook 自己改 state 时置位（page 复位、从 URL 回读），让 state watcher 跳过这次变化；
  // 「写 query → watch → 再写」的回环由 queryEquals / round-trip 稳定性保证。
  let internalMutation = false
  // 本 hook 已发出、还没落地的导航 query。push / replace 是异步的，落地前 route.query 仍是旧值，
  // 同一 tick 内的下一次写入要和它比较，否则会误判「无需写入」，让先发的导航把旧值写回 URL。
  let pendingQuery: LocationQueryRaw | null = null

  watch(
    () => ({ ...state }),
    () => {
      if (internalMutation) return
      onStateChanged()
    },
    { flush: 'sync', deep: true },
  )

  function onStateChanged() {
    // 计算与上一快照差异的键。
    const changedKeys = diffKeys(prevState, state)
    if (!changedKeys.length) { prevState = snapshotState(state); return }

    // page 复位：pageSize 变化，或 resetPageOn 里的非分页字段变化时 page 归 1。
    // pageSize 变了，原页码对应的数据范围也变了，停在原页码没有意义。
    const pageResetTriggered = changedKeys.some((key) => {
      if (key === pageSizeKey) return true
      return key !== pageKey && resetPageOn.includes(key as keyof T)
    })
    // 仅当调用方确实声明了 page 字段时才复位；否则 defaults[pageKey] 是 undefined，
    // 会在 state 上凭空长出一个 page: undefined 键污染快照。
    if (pageResetTriggered && Object.prototype.hasOwnProperty.call(defaults, pageKey)) {
      const pageField = pageKey as keyof T
      internalMutation = true
      state[pageField] = defaults[pageField]
      internalMutation = false
    }

    // 更新快照，供下一次 diff。
    prevState = snapshotState(state)

    const next = estimateQuery()
    // 以「即将生效的 query」为准：有还没落地的导航就用它，否则用 route.query。
    const currentQuery: LocationQueryRaw = pendingQuery ?? route.query
    // 合并保留非本组件管理的 query 键（如 highlight），仅覆盖托管字段。
    const merged: LocationQueryRaw = { ...currentQuery }
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const name = key as string
      if (Object.prototype.hasOwnProperty.call(next, name)) merged[name] = next[name]
      else delete merged[name]
    }
    if (queryEquals(merged, currentQuery)) return

    // 只有 page 本身变化且未触发筛选复位时，才视为「翻页」，用 push。
    const isPageWrite = changedKeys.length === 1 && changedKeys[0] === pageKey && !pageResetTriggered
    pendingQuery = merged
    let navigation: Promise<unknown>
    if (isPageWrite) {
      navigation = router.push({ query: merged })
    } else {
      navigation = router.replace({ query: merged })
    }
    // 导航结束（落地、被后发的导航取消或被守卫拦截）后不再算「未落地」；只清自己这次，不误清后发的。
    void navigation.finally(() => {
      if (pendingQuery === merged) pendingQuery = null
    })
  }

  // route.query / params 变化（后退 / 前进 / 外部 push / 路由参数切换）→ 回读 state。
  // 同一 hook 复用于 /platform/:module/:resource 等不同资源页时，也按新路由的 query 回读。
  watch(
    () => ({ name: route.name, params: route.params, query: route.query }),
    () => {
      // 有导航落地了（本 hook 发起的或外部的），此后以 route.query 为准。
      pendingQuery = null
      // 回读是逐个字段赋值的，中途 state 新旧混杂，这期间不能写回 URL：
      // 否则后退时会把「新页码 + 旧每页条数」写回去；切换路由时，还没卸载的旧页面
      // 会把自己的每页条数写进新路由。回读完再更新快照，下次 diff 才不会把回读当成用户修改。
      internalMutation = true
      syncFromQuery()
      internalMutation = false
      prevState = snapshotState(state)
    },
    { deep: true, flush: 'sync' },
  )

  function apply(patch: Partial<T>) {
    for (const key of Object.keys(patch) as (keyof T)[]) {
      const value = patch[key]
      if (value === undefined) continue
      state[key] = value
    }
  }

  function reset() {
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      state[key] = defaults[key]
    }
  }

  const isDefault = computed(() => {
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      if (!codecs[key].isDefault(state[key], defaults[key])) return false
    }
    return true
  })

  return { state, apply, reset, isDefault, toQuery: () => estimateQuery() }
}

/** 等值快照当前 reactive 状态；用于相邻两次变更之间 diff。 */
function snapshotState<T extends Record<string, unknown>>(state: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(state)) out[key] = state[key]
  return out
}

/** 比较两个快照，返回值发生变化的键。 */
function diffKeys<T extends Record<string, unknown>>(
  prev: Record<string, unknown> | null,
  state: T,
): (keyof T)[] {
  const changed: (keyof T)[] = []
  for (const key of Object.keys(state) as (keyof T)[]) {
    const a = prev ? prev[key as string] : undefined
    const b = state[key]
    if (!looseEqual(a, b)) changed.push(key)
  }
  return changed
}

function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i])
  return false
}
