import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'
import {
  getSessionTeamActivationList,
  getSessionTeamMemberList,
  getSessionTeamMessageList,
  subscribeTeamActivation,
  subscribeTeamStream,
} from '@/http/session-runtime'
import type { ChatMessage, SseEvent, SubAgent } from '@/interfaces/console/model'
import type {
  TeamActivationResponse,
  TeamMemberResponse,
  TeamMessageResponse,
  TeamNotification,
} from '@/interfaces/console/runtime'
import { createSseReducer, createStreamCursor, replaySnapshot } from '@/utils/sse-reducer'
import { latestActivation } from '@/utils/team-runtime'

/** 还有成员 working 时的兜底轮询间隔：成员状态变化和新消息没有推送。 */
export const TEAM_POLL_INTERVAL = 10_000
/** 多个刷新时机（通知、run_end、工具结果）挨得很近，合并成一次请求。 */
const REFRESH_DEBOUNCE = 300
/** 团队通知流断开后的重连等待，逐次翻倍，封顶 10 秒。 */
const RECONNECT_BASE = 1_000
const RECONNECT_MAX = 10_000
/** 还没结束、要订阅跟随的激活：排队等认领的也要订阅，开始执行后才有 run_started。 */
const LIVE_ACTIVATION_STATUSES = new Set(['queued', 'running'])

interface TeamRuntimeState {
  /** 当前跟随的后端会话；没有时为 null。 */
  sessionId: string | null
  members: TeamMemberResponse[]
  messages: TeamMessageResponse[]
  activations: TeamActivationResponse[]
  /** 按成员名的面板（id 即成员名），跨激活保留，只放最近一次激活的输出。 */
  panels: SubAgent[]
  /** 面板当前展示的是哪次激活。 */
  panelActivation: Record<string, string>
}

export interface OpenTeamSessionOptions {
  /** 建会话时选了 Team：即使成员还没拉到也要订阅通知流。 */
  teamSession: boolean
  /** 后端发起了 lead 自动回合；由控制台 store 决定是否订阅这个回合。 */
  onLeadTurn: (turnId: string) => void
}

/**
 * 会话的队友运行时：成员、团队消息、激活，以及各激活的事件流和会话团队通知流。
 * 队友的执行不属于 lead 回合，这里的状态不随 lead 回合派发而清空，只在切换会话时重置。
 */
export const useTeamRuntimeStore = defineStore('team-runtime', () => {
  const state = reactive<TeamRuntimeState>({
    sessionId: null,
    members: [],
    messages: [],
    activations: [],
    panels: [],
    panelActivation: {},
  })

  let generation = 0
  let options: OpenTeamSessionOptions | null = null
  let cursor: string | null = null
  let streamAbort: (() => void) | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectDelay = RECONNECT_BASE
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  /** activation_id → 断开函数；一个激活只订阅一次。 */
  const activationStreams = new Map<string, () => void>()
  /** 已经读到 run_end 的激活，不再重复订阅。 */
  const finishedActivations = new Set<string>()

  /** 会话里有队友（或是 Team 会话）时右栏才出现团队视图。 */
  const hasTeam = computed(() => state.members.length > 0 || state.messages.length > 0)
  const workingCount = computed(() => state.members.filter((member) => member.status === 'working').length)

  function clearTimers() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (refreshTimer) clearTimeout(refreshTimer)
    if (pollTimer) clearInterval(pollTimer)
    reconnectTimer = null
    refreshTimer = null
    pollTimer = null
  }

  /** 断开全部订阅、清空状态；离开会话或切换身份时调用。 */
  function close() {
    generation += 1
    clearTimers()
    streamAbort?.()
    streamAbort = null
    for (const abort of activationStreams.values()) abort()
    activationStreams.clear()
    finishedActivations.clear()
    options = null
    cursor = null
    reconnectDelay = RECONNECT_BASE
    state.sessionId = null
    state.members = []
    state.messages = []
    state.activations = []
    state.panels = []
    state.panelActivation = {}
  }

  /** 打开会话：已经在跟随同一会话时只刷新一次。 */
  async function open(sessionId: string, openOptions: OpenTeamSessionOptions) {
    if (state.sessionId === sessionId) {
      options = openOptions
      scheduleRefresh()
      return
    }
    close()
    state.sessionId = sessionId
    options = openOptions
    await refresh()
  }

  /** 面板按成员名建，名单成员在会话建好时就存在，先放一个空面板。 */
  function ensurePanel(name: string): SubAgent {
    const existing = state.panels.find((panel) => panel.id === name)
    if (existing) return existing
    state.panels.push({ id: name, pid: name, name, icon: 'users', status: 'queued', progress: 0, stream: [] })
    return state.panels[state.panels.length - 1]!
  }

  /**
   * 拉成员；有成员或是 Team 会话时再拉消息、激活，订阅通知流，补订运行中的激活。
   * 普通会话里 lead 用 TeamSpawn 派生队友后，下一次刷新会把这些都接上。
   */
  async function refresh() {
    const sessionId = state.sessionId
    if (!sessionId) return
    const current = generation
    let members: TeamMemberResponse[]
    try {
      members = await getSessionTeamMemberList(sessionId)
    } catch {
      return
    }
    if (current !== generation) return
    state.members = members
    for (const member of members) ensurePanel(member.name)
    if (!members.length && !options?.teamSession) {
      syncPolling()
      return
    }
    const [messagesResult, activationsResult] = await Promise.allSettled([
      getSessionTeamMessageList(sessionId),
      getSessionTeamActivationList(sessionId),
    ])
    if (current !== generation) return
    if (messagesResult.status === 'fulfilled') state.messages = messagesResult.value
    if (activationsResult.status === 'fulfilled') state.activations = activationsResult.value
    if (!streamAbort && !reconnectTimer) startStream()
    followActivations()
    syncPolling()
  }

  function scheduleRefresh() {
    if (!state.sessionId) return
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      void refresh()
    }, REFRESH_DEBOUNCE)
  }

  /** 排队或运行中的激活逐个订阅；成员最近一次已结束的激活也订阅一次，面板据快照显示它的输出。 */
  function followActivations() {
    for (const member of state.members) {
      const activation = latestActivation(member, state.activations)
      const activationId = activation?.id ?? member.activation_id
      if (!activationId) continue
      if (state.panelActivation[member.name] === activationId && !LIVE_ACTIVATION_STATUSES.has(activation?.status ?? '')) continue
      subscribeActivation(activationId, member.name)
    }
  }

  /** 只要还有成员 working，就低频轮询兜底。 */
  function syncPolling() {
    const needed = workingCount.value > 0
    if (needed && !pollTimer) {
      pollTimer = setInterval(() => { void refresh() }, TEAM_POLL_INTERVAL)
    } else if (!needed && pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  /**
   * 订阅一次激活：快照先重置面板再重放，增量用现有 reducer 写进该成员的面板。
   * 帧按 sequence 去重；续跑（run_resumed）时按水位丢掉已显示的半截内容。
   * 新激活开始时面板换成新激活的输出；读到 run_end 后刷新成员和消息。
   */
  function subscribeActivation(activationId: string, memberName: string) {
    const sessionId = state.sessionId
    if (!sessionId || activationStreams.has(activationId) || finishedActivations.has(activationId)) return
    const current = generation
    const panel = ensurePanel(memberName)
    if (state.panelActivation[memberName] !== activationId) {
      state.panelActivation[memberName] = activationId
      panel.stream.splice(0)
    }
    // 激活流只有主线，产出者就是该队友：主线内容写进它的面板，ai 只是 reducer 必需的占位。
    const placeholder: ChatMessage = { id: `activation-${activationId}`, role: 'ai', time: '', blocks: [] }
    const buildReducer = () => createSseReducer({
      ai: placeholder,
      agents: [],
      selectAgent: () => {},
      mainPanel: panel,
    })
    let reducer = buildReducer()
    const cursor = createStreamCursor(activationId)
    const live = () => current === generation && state.panelActivation[memberName] === activationId
    const stop = () => {
      activationStreams.get(activationId)?.()
      activationStreams.delete(activationId)
    }
    const handle = (event: SseEvent) => {
      if (current !== generation) return
      if (!cursor.accept(event)) return
      // 面板已换成更新的激活时，旧激活只需收尾，不再写面板。
      if (event.type === 'run_end') {
        if (live()) reducer.settleStreams()
        finishedActivations.add(activationId)
        stop()
        scheduleRefresh()
        return
      }
      if (!live()) return
      if (event.type === 'run_snapshot') {
        const snapshot = event.state
        panel.stream.splice(0)
        reducer = buildReducer()
        if (snapshot && typeof snapshot === 'object') {
          // 激活流只有主线，快照读 main；sub_runs 不会有内容。
          replaySnapshot(snapshot as Record<string, unknown>, reducer.handle, Number(sessionId), activationId)
        }
        return
      }
      if (event.type === 'run_resumed') {
        reducer.fold(cursor.runStartedAt ?? event.sequence ?? 0, event.watermark ?? 0, event.sub_run_watermarks ?? {})
        return
      }
      reducer.handle(event)
    }
    activationStreams.set(activationId, subscribeTeamActivation(sessionId, activationId, {
      onEvent: handle,
      // 断流（没读到 run_end）：放掉这次订阅，刷新时若激活仍在运行会重新订阅并从快照续上。
      onError: () => {
        if (current !== generation) return
        reducer.settleStreams()
        stop()
        scheduleRefresh()
      },
      onDone: () => {
        if (current !== generation || finishedActivations.has(activationId)) return
        reducer.settleStreams()
        stop()
        scheduleRefresh()
      },
    }))
  }

  function onNotification(notification: TeamNotification) {
    if (notification.cursor) cursor = notification.cursor
    reconnectDelay = RECONNECT_BASE
    if (notification.type === 'team_activation') {
      if (notification.activation_id && notification.member) {
        subscribeActivation(notification.activation_id, notification.member)
      }
      scheduleRefresh()
    } else if (notification.type === 'team_lead_turn') {
      if (notification.turn_id) options?.onLeadTurn(notification.turn_id)
      scheduleRefresh()
    } else if (notification.type === 'stream_error') {
      reconnect()
    }
  }

  /** 订阅会话团队通知流；有 cursor 时从它之后续订，没有时从流里现存的第一条开始（会重放最近的通知）。 */
  function startStream() {
    const sessionId = state.sessionId
    if (!sessionId) return
    const current = generation
    streamAbort = subscribeTeamStream(sessionId, cursor, {
      onEvent: (notification) => {
        if (current === generation) onNotification(notification)
      },
      onError: () => {
        if (current === generation) reconnect()
      },
      onDone: () => {
        if (current === generation) reconnect()
      },
    })
  }

  function reconnect() {
    streamAbort?.()
    streamAbort = null
    if (reconnectTimer || !state.sessionId) return
    const delay = reconnectDelay
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX)
    const current = generation
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (current !== generation) return
      startStream()
      // 断线期间可能错过激活或消息，重连后补一次。
      scheduleRefresh()
    }, delay)
  }

  return {
    state,
    hasTeam,
    workingCount,
    open,
    close,
    refresh,
    scheduleRefresh,
  }
})
