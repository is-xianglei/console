import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { getWorkbenchApp } from '../constants/app-registry'
import { SESSIONS } from '../constants/seed'
import {
  deleteSession,
  deleteSessionList,
  getHealthDetail,
  getSessionList,
  getSessionMessageList,
  respondApproval,
  sendMessage,
  updateSession,
} from '../http/console'
import type { SseHandlers } from '../interfaces/console/api'
import type {
  ApprovalDecision,
  ChatBlock,
  ChatMessage,
  MsgContentBlock,
  Session,
  SessionMessageResponse,
  SessionResponse,
  SubAgent,
  Task,
  TaskResponse,
  TaskState,
  WorkbenchMode,
} from '../interfaces/console/model'
import { createSseReducer, fmtToolCall } from '@/utils/sse-reducer'
import { usePermissionsStore } from './permissions'
import { useSkillsStore } from './skills'

// ===== 工具函数 =====
const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })
const uid = (p: string) => `${p}-${Math.random().toString(16).slice(2, 8)}`

/** 把 ISO 时间戳格式化为列表展示用的相对/简短时间 */
function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const yest = new Date(today)
  yest.setDate(today.getDate() - 1)
  if (sameDay) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (d.toDateString() === yest.toDateString()) return '昨天'
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

/** 后端 SessionResponse → 前端 Session 视图模型 */
function mapSession(s: SessionResponse): Session {
  const metadataAppId = s.metadata.app_id ?? s.metadata.appId
  const appId = typeof metadataAppId === 'string'
    ? metadataAppId.trim() || undefined
    : typeof metadataAppId === 'number'
      ? String(metadataAppId)
      : undefined
  return {
    id: String(s.id),
    title: s.title || '未命名会话',
    time: formatTime(s.last_active_at),
    count: 0,
    appId,
  }
}

/** 把后端 content 归一化为内容块数组:
 *  数组原样;单个块对象({type:...})包成单元素数组;其它(字符串/空)→ 空数组。
 *  避免"裸对象 content"被 Array.isArray 判否而误当空消息。 */
function normalizeBlocks(content: unknown): MsgContentBlock[] {
  if (Array.isArray(content)) return content as MsgContentBlock[]
  if (content && typeof content === 'object' && 'type' in content) {
    return [content as MsgContentBlock]
  }
  return []
}

/** tool_result 的 content 提取为可展示文本(字符串/Anthropic 文本块数组/对象兜底 JSON)。 */
function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        c && typeof c === 'object' && 'text' in c
          ? String((c as { text: unknown }).text ?? '')
          : typeof c === 'string'
            ? c
            : '',
      )
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content === 'object') return JSON.stringify(content)
  return ''
}

/** 后端历史消息列表 → 前端 ChatMessage 列表(有状态,跨消息合并)。
 *  相对逐条 map 的关键差异,均为消除"只有标题、无正文"的空行:
 *  - tool_result 块 / role:"tool" 独立消息:按 tool_use_id 回填到对应工具卡(与实时 SSE 一致),不再丢弃或单独成行
 *  - content 为裸对象/字符串时先归一化,避免误判为空
 *  - 最终过滤掉没有任何可渲染块的 ai 消息 */
function mapMessages(list: SessionMessageResponse[]): ChatMessage[] {
  const out: ChatMessage[] = []
  // tool_use.id → 对应工具卡引用(引用共享:即便卡片所在消息已入列,回填仍会反映到视图)
  const toolCards = new Map<string, Extract<ChatBlock, { kind: 'tool' }>>()

  /** 把一个 tool_result 块回填到已存在的工具卡;命中返回 true */
  function fillToolResult(b: MsgContentBlock): boolean {
    const card = b.tool_use_id ? toolCards.get(b.tool_use_id) : undefined
    if (!card) return false
    card.done = true
    card.tag = b.is_error ? 'ERROR' : 'RESULT'
    card.body = toolResultText(b.content)
    return true
  }

  for (const m of list) {
    const time = formatTime(m.created_at)

    if (m.role === 'user') {
      const text = typeof m.content === 'string' ? m.content : ''
      if (text) out.push({ id: 'm-' + m.id, role: 'user', time, text })
      continue
    }

    // role:"tool":独立的工具结果消息,并入已有工具卡,自身不单独成行(否则就是空标题行)
    if (m.role === 'tool') {
      for (const b of normalizeBlocks(m.content)) {
        if (b.type === 'tool_result') fillToolResult(b)
      }
      continue
    }

    // assistant / 其它:内容块数组 → think/answer/tool,内联 tool_result 就地合并
    const blocks: ChatBlock[] = []
    for (const b of normalizeBlocks(m.content)) {
      if (b.type === 'thinking' && b.thinking) {
        blocks.push({ kind: 'think', text: b.thinking, duration: '推理完成', collapsed: true })
      } else if (b.type === 'text' && b.text) {
        blocks.push({ kind: 'answer', text: b.text, streaming: false })
      } else if (b.type === 'tool_use') {
        const card: Extract<ChatBlock, { kind: 'tool' }> = {
          kind: 'tool',
          tag: b.name === 'Agent' || b.name === 'TeamSpawn' ? 'SPAWN' : 'TOOL',
          fn: fmtToolCall(b.name ?? 'tool', b.input),
          body: '',
          done: false,
        }
        blocks.push(card)
        if (b.id) toolCards.set(b.id, card)
      } else if (b.type === 'tool_result') {
        fillToolResult(b)
      }
    }

    if (blocks.length) out.push({ id: 'm-' + m.id, role: 'ai', time, blocks })
  }

  // 收尾:历史中被中断、始终没等到 tool_result 的工具卡,置为完成态,避免前端一直转圈
  for (const card of toolCards.values()) {
    if (!card.done) card.done = true
  }

  return out
}

/** 后端任务状态 → 前端 TaskState。未知值兜底为 queued。 */
function mapTaskState(status: string): TaskState {
  switch (status) {
    case 'in_progress':
    case 'active':
      return 'active'
    case 'completed':
    case 'done':
      return 'done'
    case 'error':
    case 'failed':
      return 'error'
    default:
      return 'queued'
  }
}

/** 后端 TaskResponse → 前端 Task 视图模型。deleted 状态由调用方过滤。 */
function mapTask(t: TaskResponse): Task {
  return {
    id: String(t.id),
    name: t.subject || t.description || `任务 #${t.id}`,
    state: mapTaskState(t.status),
    description: t.description || undefined,
    blockedBy: (t.blocked_by ?? []).map(Number).filter((n) => !Number.isNaN(n)),
    owner: t.owner || undefined,
  }
}

// ===== 状态形状 =====
interface ConsoleState {
  leftCollapsed: boolean
  rightCollapsed: boolean
  /** 后端健康状态:unknown=未探测/探测失败,其余为后端返回的 status(如 ok) */
  health: string
  sessionsLoading: boolean
  sessions: Session[]
  activeSessionId: string
  /** 当前打开的制造应用；普通对话时为空 */
  activeAppId: string | null
  /** 中央工作台展示对话、应用，或两者分屏 */
  workbenchMode: WorkbenchMode
  search: string
  messages: ChatMessage[]
  agents: SubAgent[]
  selectedAgentId: string | null
  tasks: Task[]
  busy: boolean
  theme: 'dark' | 'light'
}

/**
 * 控制台中央 store(Pinia setup store)。
 * 状态集中在一个 reactive 容器 `state` 中,组件通过 `store.state.xxx` 访问,
 * 所有变更必须经由下面的 action。接入真实后端时,只需把 runSubAgent / dispatch
 * 内的 sleep 模拟替换为对 `/api` 的 SSE 订阅,逐事件 push 到对应数组即可,
 * 渲染层(组件)无需改动。
 */
export const useConsoleStore = defineStore('console', () => {
  const permissionsStore = usePermissionsStore()
  const skillsStore = useSkillsStore()
  let activeStreamAbort: (() => void) | null = null
  let dataGeneration = 0

  const state = reactive<ConsoleState>({
    leftCollapsed: false,
    rightCollapsed: false,
    health: 'unknown',
    sessionsLoading: false,
    sessions: [...SESSIONS],
    activeSessionId: SESSIONS[0].id,
    activeAppId: SESSIONS[0].appId ?? null,
    workbenchMode: SESSIONS[0].appId ? 'split' : 'chat',
    search: '',
    messages: [],
    agents: [],
    selectedAgentId: null,
    tasks: [],
    busy: false,
    theme: 'dark',
  })

  // ===== 侧栏收缩 =====
  function toggleLeft() {
    state.leftCollapsed = !state.leftCollapsed
  }
  function toggleRight() {
    state.rightCollapsed = !state.rightCollapsed
  }

  // ===== 后端接入:健康检查 & 会话列表 =====
  /** 拉取后端健康状态;失败时置 'error',不抛出(避免打断启动) */
  async function loadHealth() {
    const generation = dataGeneration
    try {
      const h = await getHealthDetail()
      if (generation === dataGeneration) state.health = h.status
    } catch {
      if (generation === dataGeneration) state.health = 'error'
    }
  }

  /** 拉取真实会话列表;可优先恢复 URL 指定会话,成功返回 true。 */
  async function loadSessions(preferredSessionId?: string): Promise<boolean> {
    const generation = dataGeneration
    state.sessionsLoading = true
    try {
      const list = await getSessionList()
      if (generation !== dataGeneration) return false

      state.sessions = list.map(mapSession)
      const preferred = preferredSessionId
        ? state.sessions.find((session) => session.id === preferredSessionId)?.id
        : undefined
      state.activeSessionId = preferred ?? state.sessions[0]?.id ?? ''
      const activeSession = state.sessions.find((session) => session.id === state.activeSessionId)
      state.activeAppId = activeSession?.appId ?? null
      state.workbenchMode = getWorkbenchApp(state.activeAppId) ? 'split' : 'chat'
      state.messages = []
      state.agents = []
      state.tasks = []
      state.selectedAgentId = null
      if (state.activeSessionId) await loadMessages(state.activeSessionId)
      return true
    } catch {
      // 失败时保留当前列表;reloadConsole 会先清理,因此不会泄漏旧工作区数据。
      return false
    } finally {
      if (generation === dataGeneration) state.sessionsLoading = false
    }
  }

  /** 后端会话 id 为纯数字字符串;种子/本地新建会话 id 形如 sess-xxxx */
  function isBackendSession(id: string): boolean {
    return /^\d+$/.test(id)
  }

  /** 加载某会话的历史消息(仅后端会话);失败时清空消息不阻断 */
  async function loadMessages(id: string) {
    const generation = dataGeneration
    if (!isBackendSession(id)) {
      if (id === state.activeSessionId) state.messages = []
      return
    }
    try {
      const list = await getSessionMessageList(id)
      if (generation === dataGeneration && id === state.activeSessionId) {
        state.messages = mapMessages(list)
      }
    } catch {
      if (generation === dataGeneration && id === state.activeSessionId) state.messages = []
    }
  }

  /**
   * 清空与用户/工作区绑定的全部数据,并终止仍在回填状态的 SSE。
   * 主题和侧栏布局属于本地界面偏好,切换身份时保留。
   */
  function resetConsole() {
    dataGeneration += 1
    activeStreamAbort?.()
    activeStreamAbort = null

    state.health = 'unknown'
    state.sessionsLoading = false
    state.sessions = []
    state.activeSessionId = ''
    state.activeAppId = null
    state.workbenchMode = 'chat'
    state.search = ''
    state.messages = []
    state.agents = []
    state.selectedAgentId = null
    state.tasks = []
    state.busy = false
    permissionsStore.resetPermissions()
    skillsStore.resetSkills()
  }

  /** 清理旧身份数据后,完整加载当前工作区数据。 */
  async function reloadConsole(preferredSessionId?: string): Promise<boolean> {
    resetConsole()
    const [, sessionsLoaded] = await Promise.all([loadHealth(), loadSessions(preferredSessionId)])
    return sessionsLoaded
  }

  // ===== 左侧:会话 =====
  function selectSession(id: string) {
    state.activeSessionId = id
    const session = state.sessions.find((item) => item.id === id)
    state.activeAppId = session?.appId ?? null
    state.workbenchMode = getWorkbenchApp(state.activeAppId) ? 'split' : 'chat'
    state.agents = []
    state.tasks = []
    state.selectedAgentId = null
    loadMessages(id)
  }
  function newSession(appId?: Session['appId']) {
    const s: Session = {
      id: uid('sess'),
      title: '新会话 ' + now().slice(0, 5),
      time: '刚刚',
      count: 0,
      appId,
    }
    state.sessions.unshift(s)
    state.activeSessionId = s.id
    state.activeAppId = appId ?? null
    state.workbenchMode = getWorkbenchApp(appId) ? 'split' : 'chat'
    state.messages = []
    state.agents = []
    state.tasks = []
    state.selectedAgentId = null
  }
  function setSearch(v: string) {
    state.search = v
  }

  /** 从左侧应用节点进入运行工作台；优先恢复该应用最近一条会话。 */
  function openApp(appId: string) {
    state.activeAppId = appId
    state.workbenchMode = 'split'
    const appSession = state.sessions.find((session) => session.appId === appId)
    if (!appSession || appSession.id !== state.activeSessionId) {
      state.activeSessionId = appSession?.id ?? ''
      state.messages = []
      state.agents = []
      state.tasks = []
      state.selectedAgentId = null
      if (appSession) void loadMessages(appSession.id)
    }
  }

  function setWorkbenchMode(mode: WorkbenchMode) {
    state.workbenchMode = getWorkbenchApp(state.activeAppId) ? mode : 'chat'
  }

  /** 重命名会话:后端会话(数字 id)同步 PATCH,本地占位会话仅改内存。
   *  关键:从 state.sessions 取回 reactive 代理再改 title,避免 Proxy 陷阱。 */
  async function renameSessionAction(id: string, title: string) {
    const next = title.trim()
    const target = state.sessions.find((s) => s.id === id)
    if (!next || !target || target.title === next) return
    target.title = next
    if (isBackendSession(id)) {
      try {
        await updateSession(id, next)
      } catch {
        // 失败静默:保留乐观更新,避免打断交互(后端不可用时仍可本地改名)
      }
    }
  }

  /** 批量删除会话:后端会话批量物理删除,本地会话仅从内存移除。
   *  删除后若命中当前会话,回退到剩余第一条或清空对话。 */
  async function deleteSessionsAction(ids: string[]) {
    if (!ids.length) return
    const generation = dataGeneration
    const backendIds = ids.filter((id) => isBackendSession(id)).map(Number)
    if (backendIds.length) {
      try {
        if (backendIds.length === 1) await deleteSession(backendIds[0])
        else await deleteSessionList(backendIds)
      } catch {
        // 后端删除失败则中止,不动前端列表,避免前后端不一致
        return
      }
    }
    if (generation !== dataGeneration) return
    const removing = new Set(ids)
    const hitActive = removing.has(state.activeSessionId)
    state.sessions = state.sessions.filter((s) => !removing.has(s.id))
    if (hitActive) {
      const nextId = state.sessions[0]?.id
      if (nextId) {
        selectSession(nextId)
      } else {
        state.activeSessionId = ''
        state.messages = []
        state.agents = []
        state.tasks = []
        state.selectedAgentId = null
      }
    }
  }

  // ===== 右侧:子代理选择 =====
  function selectAgent(id: string) {
    state.selectedAgentId = id
  }

  // ===== 主题 =====
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', state.theme)
    document.documentElement.classList.toggle('dark', state.theme === 'dark')
  }

  // ===== 编排引擎(真实 SSE) =====
  /** 从应用中心启动一个应用:切回对话视图,可选预填一段提示词并派发 */
  function launchApp(prompt?: string): boolean {
    return prompt ? dispatch(prompt) : false
  }

  /** 为一条 AI 消息构造 SSE 归约器(dispatch 与 respondApproval 共用)。 */
  function buildReducer(ai: ChatMessage) {
    return createSseReducer({
      ai,
      agents: state.agents,
      selectAgent: (id) => {
        state.selectedAgentId = id
      },
      onSessionId: (sid) => {
        const idStr = String(sid)
        // 新建会话:把本地占位会话替换成后端真实 id
        if (state.activeSessionId !== idStr) {
          const cur = state.sessions.find((s) => s.id === state.activeSessionId)
          if (cur && !/^\d+$/.test(cur.id)) {
            cur.id = idStr
          } else if (!cur) {
            const latestPrompt = [...state.messages].reverse().find((message) => message.role === 'user')?.text?.trim()
            state.sessions.unshift({
              id: idStr,
              title: latestPrompt ? latestPrompt.slice(0, 28) : `新会话 ${now().slice(0, 5)}`,
              time: '刚刚',
              count: 0,
              appId: state.activeAppId ?? undefined,
            })
          }
          state.activeSessionId = idStr
        }
      },
      // 任务全量快照:随 SSE 流实时到达,直接整体替换任务面板
      onTaskSnapshot: (tasks) => {
        state.tasks = tasks.filter((t) => t.status !== 'deleted').map(mapTask)
      },
    })
  }

  /** 为一条 AI 消息构造 SSE 回调(错误块 + 收尾停流式;dispatch 与 respondApproval 共用)。 */
  function streamHandlers(ai: ChatMessage): SseHandlers {
    const reducer = buildReducer(ai)
    const generation = dataGeneration
    return {
      onEvent: (ev) => {
        if (generation === dataGeneration) reducer.handle(ev)
      },
      onError: (err) => {
        if (generation !== dataGeneration) return
        ai.blocks!.push({
          kind: 'tool',
          tag: 'ERROR',
          fn: '连接错误',
          body: err.message,
          done: true,
        })
        state.busy = false
        activeStreamAbort = null
      },
      onDone: () => {
        if (generation !== dataGeneration) return
        // 收尾:未结束的回答块停止流式光标
        for (const b of ai.blocks!) {
          if (b.kind === 'answer') b.streaming = false
        }
        state.busy = false
        activeStreamAbort = null
      },
    }
  }

  /** 派发一次任务:POST /api/sessions/messages,消费 SSE 流增量更新对话与右栏 */
  function dispatch(text: string): boolean {
    const content = text.trim()
    if (state.busy || !content) return false
    state.busy = true

    // 用户消息上屏
    state.messages.push({ id: uid('m'), role: 'user', time: now(), text: content })

    // 重置本轮舰队与任务
    state.agents = []
    state.tasks = []
    state.selectedAgentId = null

    // 新建空 AI 消息,作为本轮 orchestrator 内容的容器
    state.messages.push({ id: uid('m'), role: 'ai', time: now(), blocks: [] })
    // 关键:取回 reactive 代理(而非上面的原始字面量),否则 reducer 改它不触发视图更新
    const ai = state.messages[state.messages.length - 1]

    const sessionId = /^\d+$/.test(state.activeSessionId)
      ? Number(state.activeSessionId)
      : undefined

    activeStreamAbort = sendMessage({ session_id: sessionId, content }, streamHandlers(ai))
    return true
  }

  /**
   * 对某审批卡作出裁决并恢复执行。
   * - 把该 approval 块标记为已裁决(status),按钮随之隐藏;
   * - 新建一条 AI 消息承接恢复流(后端 resume 会重发 turn_start,视作新回合);
   * - POST /sessions/{id}/approvals 消费恢复流。
   */
  function respondApprovalAction(
    requestId: string,
    decision: ApprovalDecision,
    updatedInput?: Record<string, unknown>,
  ) {
    if (state.busy) return
    const sessionId = /^\d+$/.test(state.activeSessionId)
      ? Number(state.activeSessionId)
      : undefined
    if (sessionId === undefined) return

    // 在既有消息里定位该 approval 块并置为已裁决(隐藏按钮、显示结果)。
    let matched = false
    for (const m of state.messages) {
      if (!m.blocks) continue
      for (const b of m.blocks) {
        if (b.kind === 'approval' && b.requestId === requestId && b.status === 'pending') {
          b.status = decision
          matched = true
          break
        }
      }
      if (matched) break
    }
    if (!matched) return

    state.busy = true
    // 恢复流承接到一条新 AI 消息(后端 resume 会重发 turn_start / tool_result / 后续文本)。
    state.messages.push({ id: uid('m'), role: 'ai', time: now(), blocks: [] })
    const ai = state.messages[state.messages.length - 1]

    activeStreamAbort = respondApproval(sessionId, requestId, decision, streamHandlers(ai), {
      updatedInput,
      alwaysScope: 'session',
    })
  }

  /** 首屏种子对话 */
  function seedConversation() {
    if (!state.sessions.length) {
      state.sessions = [...SESSIONS]
      state.activeSessionId = SESSIONS[0]?.id ?? ''
      state.activeAppId = SESSIONS[0]?.appId ?? null
      state.workbenchMode = getWorkbenchApp(state.activeAppId) ? 'split' : 'chat'
    }
    if (state.messages.length) return
    state.messages.push({
      id: uid('m'),
      role: 'user',
      time: '14:20',
      text: 'pump-01 最近振动告警频繁,帮我做一次根因分析,并给出处置建议。',
    })
    state.messages.push({
      id: uid('m'),
      role: 'ai',
      time: '14:20',
      blocks: [
        {
          kind: 'think',
          text: '用户希望定位 pump-01 的振动告警根因。我会派发多个子代理并行采集数据、做频谱诊断、检索历史工单,最后汇总。点击右栏的子代理可查看各自的推理与工具调用。',
          duration: '思考 0.9s',
          collapsed: true,
        },
        {
          kind: 'answer',
          text: '我已准备好编排子代理舰队来分析 `pump-01`。在下方输入框按 **Enter** 即可派发任务 —— 子代理会实时出现在右栏,底部任务条会同步它们的状态。',
          streaming: false,
        },
      ],
    })
  }

  return {
    state,
    toggleLeft,
    toggleRight,
    loadHealth,
    loadSessions,
    resetConsole,
    reloadConsole,
    launchApp,
    selectSession,
    newSession,
    openApp,
    setWorkbenchMode,
    setSearch,
    renameSession: renameSessionAction,
    deleteSessions: deleteSessionsAction,
    selectAgent,
    toggleTheme,
    dispatch,
    respondApproval: respondApprovalAction,
    seedConversation,
  }
})
