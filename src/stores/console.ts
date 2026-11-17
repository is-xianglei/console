import { readStandardEffort, rememberStandardEffort } from '@/utils/chat-models'
import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { getWorkbenchApp } from '../constants/app-registry'
import { SESSIONS } from '../constants/seed'
import {
  archiveSession,
  cancelTurn,
  cancelInteraction,
  deleteSession,
  deleteSessionList,
  getActiveTurn,
  getPendingInteraction,
  getSessionList,
  getSessionMessageList,
  getSessionTasks,
  respondInteraction,
  sendMessage,
  shareSession,
  subscribeTurn,
  SseOpenError,
  updateSession,
  updateSessionChatSelection,
} from '../http/console'
import type {
  InteractionRequestResponse,
  InteractionResolutionRequest,
  ShareSessionRequest,
  SseHandlers,
} from '../interfaces/console/api'
import type {
  ApprovalDecision,
  ChatBlock,
  ChatMessage,
  MsgContentBlock,
  Session,
  SessionMessageResponse,
  SessionResponse,
  SessionVisibility,
  SseEvent,
  SseInteraction,
  SseWorkflowProgress,
  SubAgent,
  Task,
  TaskResponse,
  TaskState,
  WorkbenchMode,
  WorkflowMemberProgress,
  WorkflowProgressState,
} from '../interfaces/console/model'
import { createSseReducer, fmtToolCall } from '@/utils/sse-reducer'
import type { ChatModelSelection, ThinkingEffort } from '../interfaces/settings/models/model'
import { getSessionSubAgentRuns } from '../http/session-runtime'
import { mapSubAgentRuns, mergeSubAgentRuns } from '../utils/session-runtime'
import { usePermissionsStore } from './permissions'
import { useSkillsStore } from './skills'
import { useMemoriesStore } from './memories'
import { useAuthStore } from './auth'

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

function normalizeVisibility(value: string): SessionVisibility {
  if (value === 'workspace' || value === 'public') return value
  return 'private'
}

/** 后端 SessionResponse → 前端 Session 视图模型 */
function mapSession(s: SessionResponse, currentUserId?: number | null): Session {
  const metadata = s.metadata ?? {}
  const metadataAppId = metadata.app_id ?? metadata.appId
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
    userId: s.user_id ?? null,
    readOnly: s.user_id != null && currentUserId != null && s.user_id !== currentUserId,
    agentId: s.agent_id ?? null,
    workflowId: s.workflow_id ?? null,
    modelName: s.model_name ?? null,
    modelProviderId: s.model_provider_id ?? null,
    modelProviderOverride: metadata.model_provider_override === true,
    modeSlug: s.mode_slug ?? 'standard',
    thinkingEffort: s.thinking_effort ?? 'fast',
    standardThinkingEffort: s.mode_slug === 'turbo' ? 'fast' : s.thinking_effort ?? 'fast',
    status: s.status,
    visibility: normalizeVisibility(s.visibility),
    sharedWith: [...(s.shared_with ?? [])],
    sharedWithDepartments: [...(s.shared_with_departments ?? [])],
    sharedWithGroups: [...(s.shared_with_groups ?? [])],
  }
}

/** REST 恢复得到的待处理请求转换为与实时 SSE 相同的交互信封。 */
function mapPendingInteraction(request: InteractionRequestResponse): SseInteraction {
  const common = {
    request_id: request.id,
    suspension_id: request.suspension_id,
    schema_version: request.schema_version,
  }
  switch (request.kind) {
    case 'tool_approval':
      return { ...common, kind: request.kind, request_payload: request.request_payload }
    case 'user_question':
      return { ...common, kind: request.kind, request_payload: request.request_payload }
    case 'enter_plan_mode':
      return { ...common, kind: request.kind, request_payload: request.request_payload }
    case 'exit_plan_mode':
      return { ...common, kind: request.kind, request_payload: request.request_payload }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 单个历史内容块归一化为前端的 MsgContentBlock(type 判别)。兼容三种落库形状:
 * - 后端中立块协议(AgentOS llm/types.py):判别键是 kind 不是 type,思考正文在 text 里
 * - tool 角色消息(ToolResultMessage.to_content_dict):扁平 dict,无判别键,结果在 output 里
 * - 旧的 provider wire 形状:type 判别,思考正文在 thinking 里
 */
function normalizeBlock(value: unknown): MsgContentBlock | null {
  if (typeof value === 'string') return value ? { type: 'text', text: value } : null
  if (!isRecord(value)) return null

  if (typeof value.tool_use_id === 'string' && 'output' in value && value.kind === undefined && value.type === undefined) {
    const block: MsgContentBlock = { type: 'tool_result', tool_use_id: value.tool_use_id, content: value.output }
    if (typeof value.is_error === 'boolean') block.is_error = value.is_error
    return block
  }

  if (typeof value.kind === 'string') {
    const block: MsgContentBlock = { type: value.kind }
    if (typeof value.text === 'string') {
      if (value.kind === 'thinking') block.thinking = value.text
      else block.text = value.text
    }
    if (typeof value.id === 'string') block.id = value.id
    if (typeof value.name === 'string') block.name = value.name
    if (isRecord(value.input)) block.input = value.input
    return block
  }

  if (typeof value.type !== 'string') return null
  const block: MsgContentBlock = { type: value.type }
  if (typeof value.thinking === 'string') block.thinking = value.thinking
  if (typeof value.text === 'string') block.text = value.text
  if (typeof value.id === 'string') block.id = value.id
  if (typeof value.name === 'string') block.name = value.name
  if (isRecord(value.input)) block.input = value.input
  if (typeof value.tool_use_id === 'string') block.tool_use_id = value.tool_use_id
  if ('content' in value) block.content = value.content
  if (typeof value.is_error === 'boolean') block.is_error = value.is_error
  return block
}

/** 把开放结构的历史 content 归一化为经过字段校验的内容块数组。 */
function normalizeBlocks(content: unknown): MsgContentBlock[] {
  const values = Array.isArray(content) ? content : [content]
  return values.map(normalizeBlock).filter((block): block is MsgContentBlock => block !== null)
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  return normalizeBlocks(content)
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n')
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
    // 编排节点的中间产出(branch 非空)属于各自分支,不进主时间线,
    // 否则一次三成员的编排会在主对话里多出三条重复回复。
    if (m.branch) continue

    const time = formatTime(m.created_at)

    if (m.role === 'user') {
      const text = messageText(m.content)
      if (text) out.push({ id: 'm-' + m.id, role: 'user', time, text, ...(m.turn_id ? { turnId: m.turn_id } : {}) })
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
        blocks.push({ kind: 'think', text: b.thinking, done: true })
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

    if (blocks.length) out.push({ id: 'm-' + m.id, role: 'ai', time, blocks, ...(m.turn_id ? { turnId: m.turn_id } : {}) })
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
/** Workflow 进度图初始状态:无成员记录、路由/汇总未开始。 */
function emptyWorkflowProgress(): WorkflowProgressState {
  return { members: {}, routing: null, routedAgentId: null, merging: null }
}

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
  newSessionAgentId: number | null
  /** 新会话草稿选中的 Workflow ID;与 newSessionAgentId 互斥 */
  newSessionWorkflowId: number | null
  chatSelection: ChatModelSelection
  chatSelectionSaving: boolean
  standardDraftEffort: ThinkingEffort
  tasks: Task[]
  /** Workflow 进度图状态:按 agent_id 归并的成员 + 路由/汇总阶段 */
  workflowProgress: WorkflowProgressState
  busy: boolean
  /** 当前跟随的后端轮次；断流恢复和停止执行都以它为准。 */
  activeTurnId: string | null
  activeTurnSessionId: string | null
  recovering: boolean
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
  const authStore = useAuthStore()
  const permissionsStore = usePermissionsStore()
  const skillsStore = useSkillsStore()
  const memoriesStore = useMemoriesStore()
  let activeStreamAbort: (() => void) | null = null
  let dataGeneration = 0
  let streamGeneration = 0
  let activeStreamSessionId: string | null = null
  let activeStreamTurnId: string | null = null
  let activeStreamTerminal = false
  let restoredAgentSessionId: string | null = null
  let restoredAgents: SubAgent[] = []
  let activeResolution: { requestId: string; syntheticMessageId: string } | null = null

  const state = reactive<ConsoleState>({
    leftCollapsed: false,
    rightCollapsed: false,
    health: 'unknown',
    sessionsLoading: false,
    sessions: [...SESSIONS],
    activeSessionId: SESSIONS[0].id,
    activeAppId: SESSIONS[0].appId ?? null,
    // seed 会话不绑定 Workflow,初始视图只需区分是否带应用
    workbenchMode: SESSIONS[0].appId ? 'split' : 'chat',
    search: '',
    messages: [],
    agents: [],
    selectedAgentId: null,
    newSessionAgentId: null,
    newSessionWorkflowId: null,
    chatSelection: { model_provider_id: null, mode_slug: 'standard', thinking_effort: 'fast' },
    chatSelectionSaving: false,
    standardDraftEffort: 'fast',
    tasks: [],
    workflowProgress: emptyWorkflowProgress(),
    busy: false,
    activeTurnId: null,
    activeTurnSessionId: null,
    recovering: false,
    theme: 'dark',
  })

  // ===== 侧栏收缩 =====
  function toggleLeft() {
    state.leftCollapsed = !state.leftCollapsed
  }
  function toggleRight() {
    state.rightCollapsed = !state.rightCollapsed
  }

  /** 当前会话是否允许写入；共享读取者只能浏览历史和跟随执行流。 */
  function canWriteSession(id = state.activeSessionId): boolean {
    const session = state.sessions.find((item) => item.id === id)
    return !session?.readOnly
  }

  function clearActiveTurn() {
    activeStreamSessionId = null
    activeStreamTurnId = null
    activeStreamTerminal = false
    state.activeTurnId = null
    state.activeTurnSessionId = null
    state.recovering = false
  }

  /** 只切断本页 SSE；后端轮次继续执行，回到会话时由 active-turn 重新订阅。 */
  function invalidateStream() {
    streamGeneration += 1
    activeStreamAbort?.()
    activeStreamAbort = null
    activeResolution = null
    clearActiveTurn()
    state.busy = false
  }

  function bindActiveTurn(sessionId: string, turnId: string) {
    activeStreamSessionId = sessionId
    activeStreamTurnId = turnId
    state.activeTurnSessionId = sessionId
    state.activeTurnId = turnId
  }

  function snapshotRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  }

  /** 把轮次快照折叠成现有 reducer 能理解的事件，避免刷新后丢失已输出内容。 */
  function hydrateRunSnapshot(
    snapshot: Record<string, unknown>,
    reducer: ReturnType<typeof createSseReducer>,
    ai: ChatMessage,
    sessionId: number,
    turnId: string,
  ) {
    // 完整快照包含本轮所有 segment，替换同轮助手历史，保留用户输入和其它轮次。
    // 截断快照缺少更早内容，必须保留数据库中的历史作为补充。
    if (snapshot.truncated !== true) {
      state.messages = state.messages.filter((message) =>
        message.id === ai.id || message.role !== 'ai' || message.turnId !== turnId,
      )
    }
    ai.turnId = turnId
    ai.blocks = []
    const selectedAgentId = state.selectedAgentId
    const actorKeys = new Set((Array.isArray(snapshot.actors) ? snapshot.actors : []).flatMap((raw) => {
      const actor = snapshotRecord(snapshotRecord(raw)?.actor)
      return actor?.role === 'subagent' && typeof actor.run_id === 'string' ? [actor.run_id] : []
    }))
    // 快照只覆盖当前轮次，先保留不属于本轮的持久化运行，再重建本轮实时事件。
    const previousRuns = restoredAgentSessionId === String(sessionId)
      ? restoredAgents.filter((agent) => !actorKeys.has(agent.id))
      : []
    state.agents.splice(0, state.agents.length, ...previousRuns)
    state.selectedAgentId = null
    // 快照从未收到 task_snapshot 时 tasks 为 null，保留 REST 已恢复的会话任务。
    state.workflowProgress = emptyWorkflowProgress()

    const session = snapshotRecord(snapshot.session)
    if (session) {
      reducer.handle({
        type: 'session_ready', sequence: Number(snapshot.last_offset ?? 0), session_id: sessionId,
        turn_id: turnId,
        data: { session_id: sessionId, title: typeof session.title === 'string' ? session.title : undefined },
      })
    }
    if (Array.isArray(snapshot.tasks)) {
      reducer.handle({
        type: 'task_snapshot', sequence: Number(snapshot.last_offset ?? 0), session_id: sessionId,
        turn_id: turnId, data: { session_id: sessionId, tasks: snapshot.tasks as TaskResponse[] },
      })
    }
    if (Array.isArray(snapshot.workflow)) {
      for (const item of snapshot.workflow) {
        const progress = snapshotRecord(item)
        if (!progress) continue
        reducer.handle({
          type: 'workflow_progress',
          sequence: Number(snapshot.last_offset ?? 0),
          session_id: sessionId,
          turn_id: turnId,
          progress: progress as unknown as SseWorkflowProgress,
        })
      }
    }
    if (selectedAgentId && state.agents.some((agent) => agent.id === selectedAgentId)) {
      state.selectedAgentId = selectedAgentId
    } else if (!state.selectedAgentId) {
      state.selectedAgentId = state.agents[0]?.id ?? null
    }
    const interaction = snapshotRecord(snapshot.interaction)
    if (interaction) {
      const requestId = interaction.request_id
      const existingInteraction = state.messages.some((message) =>
        message.blocks?.some((block) => block.kind === 'interaction' && block.interaction.request_id === requestId),
      )
      // REST 待处理卡和快照引用同一请求，只保留一个可操作入口。
      if (existingInteraction) return
      reducer.handle({
        type: 'interaction_request', sequence: Number(snapshot.last_offset ?? 0), session_id: sessionId, turn_id: turnId,
        interaction: interaction as unknown as SseInteraction,
      })
    }
  }

  // ===== 后端接入:会话列表 =====
  /** 拉取真实会话列表;可优先恢复 URL 指定会话,成功返回 true。 */
  async function loadSessions(preferredSessionId?: string): Promise<boolean> {
    const generation = dataGeneration
    state.sessionsLoading = true
    try {
      const list = await getSessionList()
      if (generation !== dataGeneration) return false

      const sessions = list.map((item) => {
        const session = mapSession(item, authStore.state.user?.id ?? null)
        if (session.modeSlug === 'turbo') {
          session.standardThinkingEffort = readStandardEffort(authStore.state.user?.id ?? null, authStore.currentWorkspaceId, session.id)
        }
        return session
      })
      const preferred = preferredSessionId
        ? sessions.find((session) => session.id === preferredSessionId)?.id
        : undefined
      const nextActiveSessionId = preferred ?? sessions[0]?.id ?? ''
      if (state.activeSessionId && nextActiveSessionId !== state.activeSessionId) invalidateStream()
      state.sessions = sessions
      state.activeSessionId = nextActiveSessionId
      const activeSession = state.sessions.find((session) => session.id === state.activeSessionId)
      state.activeAppId = activeSession?.appId ?? null
      state.messages = []
      state.agents = []
      state.tasks = []
      state.selectedAgentId = null
      state.newSessionAgentId = null
      state.newSessionWorkflowId = null
      // 先清空草稿选择,再按会话绑定关系计算默认视图,避免上个草稿的 Workflow 泄漏
      state.workbenchMode = defaultWorkbenchMode(state.activeSessionId)
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

  /** 会话绑定的 Workflow ID;本地草稿会话回退到 newSessionWorkflowId。 */
  function sessionWorkflowId(id: string): number | null {
    const session = state.sessions.find((item) => item.id === id)
    if (session?.workflowId != null) return session.workflowId
    return isBackendSession(id) ? null : state.newSessionWorkflowId
  }

  /** 会话切换后的默认工作台模式:打开应用优先分屏,绑定 Workflow 落到执行图。 */
  function defaultWorkbenchMode(sessionId: string): WorkbenchMode {
    if (getWorkbenchApp(state.activeAppId)) return 'split'
    return sessionWorkflowId(sessionId) != null ? 'graph' : 'chat'
  }

  /**
   * 加载某会话的历史消息和待处理交互。
   * 两个请求独立降级：交互查询失败不得清掉已经成功加载的消息历史。
   */
  async function loadMessages(id: string) {
    const generation = dataGeneration
    const streamId = streamGeneration
    if (!isBackendSession(id)) {
      if (id === state.activeSessionId) state.messages = []
      return
    }
    const [historyResult, pendingResult, tasksResult, runsResult] = await Promise.allSettled([
      getSessionMessageList(id),
      getPendingInteraction(id),
      getSessionTasks(id),
      getSessionSubAgentRuns(id),
    ])
    // 旧轮次的刷新不能覆盖新发送的乐观消息，也不能回填到已切换的会话。
    if (generation !== dataGeneration || streamId !== streamGeneration || id !== state.activeSessionId) return

    if (historyResult.status === 'rejected') {
      state.messages = []
      state.health = 'error'
      return
    }

    state.messages = mapMessages(historyResult.value)
    if (tasksResult.status === 'fulfilled') {
      state.tasks = tasksResult.value.filter((task) => task.status !== 'deleted').map(mapTask)
    }

    if (runsResult.status === 'fulfilled') {
      restoredAgentSessionId = id
      restoredAgents = mapSubAgentRuns(runsResult.value, Number(id))
      state.agents = mergeSubAgentRuns(state.agents, restoredAgents)
      if (!state.agents.some((agent) => agent.id === state.selectedAgentId)) {
        state.selectedAgentId = state.agents[0]?.id ?? null
      }
    }

    const pending = pendingResult.status === 'fulfilled' ? pendingResult.value : null
    const pendingRequests = pending?.requests.filter((request) => request.status === 'pending') ?? []
    if (pendingRequests.length) {
      state.messages.push({
        id: `interaction-${pending!.suspension.id}`,
        role: 'ai',
        time: formatTime(pending!.suspension.created_at),
        blocks: pendingRequests.map((request) => ({
          kind: 'interaction',
          interaction: mapPendingInteraction(request),
          status: 'pending',
        })),
      })
    }
    state.health = pendingResult.status === 'rejected' || tasksResult.status === 'rejected' || runsResult.status === 'rejected'
      ? 'degraded'
      : 'ok'
    if (options.recover !== false) void recoverActiveTurn(id)
  }

  /**
   * 清空与用户/工作区绑定的全部数据,并终止仍在回填状态的 SSE。
   * 主题和侧栏布局属于本地界面偏好,切换身份时保留。
   */
  function resetConsole() {
    dataGeneration += 1
    invalidateStream()
    restoredAgentSessionId = null
    restoredAgents = []

    state.chatSelection = { model_provider_id: null, mode_slug: 'standard', thinking_effort: 'fast' }
    state.chatSelectionSaving = false
    state.standardDraftEffort = 'fast'
    state.health = 'unknown'
    state.sessionsLoading = false
    state.sessions = []
    state.activeSessionId = ''
    state.activeAppId = null
    // 全量重置后无会话亦无 Workflow,对话视图是唯一合法模式
    state.workbenchMode = 'chat'
    state.search = ''
    state.messages = []
    state.agents = []
    state.selectedAgentId = null
    state.newSessionAgentId = null
    state.newSessionWorkflowId = null
    state.tasks = []
    state.workflowProgress = emptyWorkflowProgress()
    state.busy = false
    state.activeTurnId = null
    state.activeTurnSessionId = null
    state.recovering = false
    permissionsStore.resetPermissions()
    skillsStore.resetSkills()
    memoriesStore.resetMemories()
  }

  /** 清理旧身份数据后,完整加载当前工作区数据。 */
  async function reloadConsole(preferredSessionId?: string): Promise<boolean> {
    resetConsole()
    const generation = dataGeneration
    const sessionsLoaded = await loadSessions(preferredSessionId)
    if (generation === dataGeneration) {
      if (!sessionsLoaded) state.health = 'error'
      else if (state.health === 'unknown') state.health = 'ok'
    }
    return sessionsLoaded
  }

  // ===== 左侧:会话 =====
  function selectSession(id: string) {
    if (id === state.activeSessionId) return
    invalidateStream()
    state.activeSessionId = id
    const session = state.sessions.find((item) => item.id === id)
    state.activeAppId = session?.appId ?? null
    state.agents = []
    state.tasks = []
    state.selectedAgentId = null
    state.newSessionAgentId = null
    state.newSessionWorkflowId = null
    state.workflowProgress = emptyWorkflowProgress()
    state.workbenchMode = defaultWorkbenchMode(id)
    loadMessages(id)
  }
  function newSession(appId?: Session['appId']) {
    invalidateStream()
    const s: Session = {
      id: uid('sess'),
      title: '新会话 ' + now().slice(0, 5),
      time: '刚刚',
      count: 0,
      appId,
    }
    s.modelProviderId = state.chatSelection.model_provider_id
    s.modelProviderOverride = state.chatSelection.model_provider_id !== null
    s.modeSlug = state.chatSelection.mode_slug
    s.thinkingEffort = state.chatSelection.thinking_effort
    s.standardThinkingEffort = state.standardDraftEffort
    state.sessions.unshift(s)
    state.activeSessionId = s.id
    state.activeAppId = appId ?? null
    state.workbenchMode = getWorkbenchApp(appId) ? 'split' : 'chat'
    state.messages = []
    state.agents = []
    state.tasks = []
    state.selectedAgentId = null
    state.newSessionAgentId = null
    state.newSessionWorkflowId = null
    state.workflowProgress = emptyWorkflowProgress()
  }

  function setNewSessionAgent(agentId: number | null) {
    if (isBackendSession(state.activeSessionId)) return
    state.newSessionAgentId = agentId
    // 后端约束 agent 与 Workflow 互斥:Workflow 草稿无条件解绑(含回到平台默认 Agent),
    // composer 切回时自动生效
    state.newSessionWorkflowId = null
    const localSession = state.sessions.find((session) => session.id === state.activeSessionId)
    if (localSession) localSession.agentId = agentId
  }

  /** 为新会话草稿绑定 Workflow;绑定后默认切到执行图视图。
   *  后端约束 workflow_id / agent_id 互斥。 */
  function setNewSessionWorkflow(workflowId: number | null) {
    if (isBackendSession(state.activeSessionId)) return
    state.newSessionWorkflowId = workflowId
    if (workflowId != null) {
      state.newSessionAgentId = null
      const localSession = state.sessions.find((session) => session.id === state.activeSessionId)
      if (localSession) localSession.agentId = null
    }
    if (!getWorkbenchApp(state.activeAppId)) {
      state.workbenchMode = workflowId != null ? 'graph' : 'chat'
    }
  }
  function setSearch(v: string) {
    state.search = v
  }

  /** 从左侧应用节点进入运行工作台；优先恢复该应用最近一条会话。 */
  function openApp(appId: string) {
    if (appId === state.activeAppId) return
    invalidateStream()
    state.activeAppId = appId
    // 打开应用是显式动作,即使会话绑了 Workflow 也切到分屏
    state.workbenchMode = 'split'
    const appSession = state.sessions.find((session) => session.appId === appId)
    if (!appSession || appSession.id !== state.activeSessionId) {
      state.activeSessionId = appSession?.id ?? ''
      state.messages = []
      state.agents = []
      state.tasks = []
      state.selectedAgentId = null
      state.newSessionAgentId = null
      state.newSessionWorkflowId = null
      state.workflowProgress = emptyWorkflowProgress()
      if (appSession) void loadMessages(appSession.id)
    }
  }

  function setWorkbenchMode(mode: WorkbenchMode) {
    // 执行图只依赖会话绑定的 Workflow,不要求打开应用
    if (mode === 'graph') {
      state.workbenchMode = sessionWorkflowId(state.activeSessionId) != null ? 'graph' : 'chat'
      return
    }
    state.workbenchMode = getWorkbenchApp(state.activeAppId) ? mode : 'chat'
  }

  /** 当前配置随会话恢复，未建会话时使用草稿配置。 */
  function activeChatSelection(): ChatModelSelection {
    const session = state.sessions.find((item) => item.id === state.activeSessionId)
    const selection = session ? {
      model_provider_id: session.modelProviderOverride === true ? session.modelProviderId ?? null : null,
      mode_slug: session.modeSlug ?? 'standard',
      thinking_effort: session.thinkingEffort ?? 'fast',
    } : { ...state.chatSelection }
    if (selection.mode_slug === 'turbo') selection.thinking_effort = 'fast'
    return selection
  }

  function standardThinkingEffort(): ThinkingEffort {
    const session = state.sessions.find((item) => item.id === state.activeSessionId)
    return session?.standardThinkingEffort ?? state.standardDraftEffort
  }

  /** 持久会话保存成功后才更新界面，保存期间禁止发送旧配置。 */
  async function setChatSelection(selection: ChatModelSelection): Promise<boolean> {
    if (state.busy || state.chatSelectionSaving || !canWriteSession()) return false
    const id = state.activeSessionId
    const generation = dataGeneration
    const next = { ...selection, thinking_effort: selection.mode_slug === 'turbo' ? 'fast' as const : selection.thinking_effort }
    const previous = activeChatSelection()
    const remembered = next.mode_slug === 'standard' ? next.thinking_effort
      : previous.mode_slug === 'standard' ? previous.thinking_effort : standardThinkingEffort()
    state.chatSelectionSaving = true
    try {
      const saved = isBackendSession(id) ? await updateSessionChatSelection(id, next) : null
      if (generation !== dataGeneration) return false
      const target = state.sessions.find((item) => item.id === id)
      let effectiveRemembered = remembered
      if (target) {
        // 后端返回实际解析模型，显式覆盖仍以本次请求语义为准，不能把角色模型变成选择。
        target.modelProviderId = saved?.model_provider_id ?? next.model_provider_id
        target.modelProviderOverride = saved?.metadata?.model_provider_override === undefined
          ? next.model_provider_id !== null : saved.metadata.model_provider_override === true
        target.modeSlug = saved?.mode_slug ?? next.mode_slug
        target.thinkingEffort = saved?.thinking_effort ?? next.thinking_effort
        target.standardThinkingEffort = target.modeSlug === 'standard' ? target.thinkingEffort : remembered
        effectiveRemembered = target.standardThinkingEffort
      } else if (id === state.activeSessionId) {
        state.chatSelection = next
        state.standardDraftEffort = remembered
      }
      rememberStandardEffort(authStore.state.user?.id ?? null, authStore.currentWorkspaceId, id, effectiveRemembered)
      return true
    } finally {
      if (generation === dataGeneration) state.chatSelectionSaving = false
    }
  }

  /** 重命名会话:后端会话(数字 id)同步 PATCH,本地占位会话仅改内存。
   *  关键:从 state.sessions 取回 reactive 代理再改 title,避免 Proxy 陷阱。 */
  async function renameSessionAction(id: string, title: string) {
    const next = title.trim()
    const target = state.sessions.find((s) => s.id === id)
    if (!next || !target || target.title === next || !canWriteSession(id)) return
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
    if (!ids.length || ids.some((id) => !canWriteSession(id))) return
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
        state.newSessionAgentId = null
        state.newSessionWorkflowId = null
        state.workflowProgress = emptyWorkflowProgress()
      }
    }
  }

  /** 归档后端会话并从当前列表移除。 */
  async function archiveSessionAction(id: string): Promise<boolean> {
    if (!isBackendSession(id) || !canWriteSession(id)) return false
    try {
      await archiveSession(id)
      await loadSessions()
      return true
    } catch {
      return false
    }
  }

  /** 覆盖后端会话共享范围，并同步本地可见性。 */
  async function shareSessionAction(id: string, payload: ShareSessionRequest): Promise<boolean> {
    if (!isBackendSession(id) || !canWriteSession(id)) return false
    const generation = dataGeneration
    const expectedSessionId = Number(id)
    try {
      const result = await shareSession(id, payload)
      if (generation !== dataGeneration || result.session_id !== expectedSessionId) return false
      const target = state.sessions.find((session) => session.id === id)
      if (target) {
        target.visibility = normalizeVisibility(result.visibility)
        target.sharedWith = [...(result.users ?? payload.share_with?.users ?? [])]
        target.sharedWithDepartments = [...(result.departments ?? payload.share_with?.departments ?? [])]
        target.sharedWithGroups = [...(result.groups ?? payload.share_with?.groups ?? [])]
      }
      return true
    } catch {
      return false
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

  /** 把 workflow_progress 事件归并进进度图状态。
   *  member 按 agent_id 归并:status 覆盖、member_name 有值才覆盖、ordinal/total 透传;
   *  routing/merging 只写阶段状态,路由命中时记录 routedAgentId。 */
  function mergeWorkflowProgress(progress: SseWorkflowProgress) {
    const phase = progress.phase
    const status = (value: string | undefined): 'running' | 'done' | 'failed' | null =>
      value === 'running' || value === 'done' || value === 'failed' ? value : null

    if (phase === 'member') {
      const agentId = progress.agent_id
      if (agentId == null) {
        // 后端约定 member 阶段必带 agent_id(配置期失败也带,只缺 member_name);缺失属协议异常,图上无从归并
        console.warn(`workflow_progress 的 member 事件缺少 agent_id,已忽略:${JSON.stringify(progress)}`)
        return
      }
      const prev = state.workflowProgress.members[agentId]
      const merged: WorkflowMemberProgress = {
        agentId,
        memberName: progress.member_name ?? prev?.memberName ?? null,
        status: status(progress.status) ?? prev?.status ?? 'running',
      }
      if (progress.ordinal != null) merged.ordinal = progress.ordinal
      else if (prev?.ordinal != null) merged.ordinal = prev.ordinal
      if (progress.total != null) merged.total = progress.total
      else if (prev?.total != null) merged.total = prev.total
      state.workflowProgress.members[agentId] = merged
      return
    }
    if (phase === 'routing') {
      state.workflowProgress.routing = status(progress.status)
      // 只有命中完成才有被选中的成员;failed 或 running 阶段的事件不带 agent_id
      if (progress.status === 'done' && progress.agent_id != null) {
        state.workflowProgress.routedAgentId = progress.agent_id
      }
      return
    }
    if (phase === 'merging') {
      state.workflowProgress.merging = status(progress.status)
    }
  }

  /** 为一条 AI 消息构造 SSE 归约器(dispatch 与 respondApproval 共用)。 */
  function buildReducer(
    ai: ChatMessage,
    configuredAgentId?: number,
    configuredWorkflowId?: number,
  ) {
    const chatSelection = activeChatSelection()
    const standardEffort = standardThinkingEffort()
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
          const draft = state.sessions.find(
            (s) => s.id === state.activeSessionId && !isBackendSession(s.id),
          )
          if (draft) {
            draft.id = idStr
          } else if (!state.sessions.some((s) => s.id === idStr)) {
            // 草稿已被会话切换顶掉:补建会话对象,否则 activeSessionId 会悬空,
            // 绑定的 Workflow 随之丢失,执行图会在跑起来的瞬间消失。
            const latestPrompt = [...state.messages].reverse().find((message) => message.role === 'user')?.text?.trim()
            state.sessions.unshift({
              id: idStr,
              title: latestPrompt ? latestPrompt.slice(0, 28) : `新会话 ${now().slice(0, 5)}`,
              time: '刚刚',
              count: 0,
              appId: state.activeAppId ?? undefined,
              agentId: configuredAgentId ?? null,
              workflowId: configuredWorkflowId ?? null,
              modelProviderId: chatSelection.model_provider_id,
              modelProviderOverride: chatSelection.model_provider_id !== null,
              modeSlug: chatSelection.mode_slug,
              thinkingEffort: chatSelection.thinking_effort,
              standardThinkingEffort: standardEffort,
            })
          }
          state.activeSessionId = idStr
        }
        // 会话已落库,绑定关系改由会话自身承载;草稿字段必须清空,否则下一个新会话会继承它
        const promoted = state.sessions.find((s) => s.id === idStr)
        if (promoted) {
          rememberStandardEffort(authStore.state.user?.id ?? null, authStore.currentWorkspaceId, idStr, promoted.standardThinkingEffort ?? standardEffort)
          if (configuredAgentId != null) promoted.agentId = configuredAgentId
          if (configuredWorkflowId != null) promoted.workflowId = configuredWorkflowId
        }
        state.newSessionAgentId = null
        state.newSessionWorkflowId = null
      },
      // 任务全量快照:随 SSE 流实时到达,直接整体替换任务面板
      onTaskSnapshot: (tasks) => {
        state.tasks = tasks.filter((t) => t.status !== 'deleted').map(mapTask)
      },
      // Workflow 进度事件:按阶段归并到进度图状态
      onWorkflowProgress: (progress) => {
        mergeWorkflowProgress(progress)
      },
    })
  }

  type StreamOptions = {
    sessionId?: string
    turnId?: string
    streamId?: number
    recoveryAttempt?: number
    completedSnapshot?: boolean
  }

  function removeSyntheticMessage(id: string) {
    const index = state.messages.findIndex((message) => message.id === id)
    if (index >= 0 && state.messages[index]?.role === 'ai' && !(state.messages[index]?.blocks?.length)) {
      state.messages.splice(index, 1)
    }
  }

  function restorePendingResolution() {
    const resolution = activeResolution
    if (!resolution) return
    for (const message of state.messages) {
      for (const block of message.blocks ?? []) {
        if (block.kind === 'interaction' && block.interaction.request_id === resolution.requestId) {
          block.status = 'pending'
          delete block.responseLabel
        } else if (block.kind === 'approval' && block.requestId === resolution.requestId) {
          block.status = 'pending'
        }
      }
    }
    removeSyntheticMessage(resolution.syntheticMessageId)
    activeResolution = null
  }

  async function refreshMessages(id: string) {
    await loadMessages(id, { recover: false })
  }

  /** 刷新/断流后通过 active-turn 找到轮次，再挂上快照续播订阅。 */
  async function recoverActiveTurn(
    id: string,
    options: { ai?: ChatMessage; expectedTurnId?: string; streamId?: number; recoveryAttempt?: number } = {},
  ): Promise<boolean> {
    if (!isBackendSession(id) || id !== state.activeSessionId) return false
    const generation = dataGeneration
    const streamId = options.streamId ?? streamGeneration
    if (streamId !== streamGeneration) return false
    let active
    try {
      active = await getActiveTurn(id)
    } catch {
      if (options.ai) {
        state.busy = false
        state.recovering = false
        restorePendingResolution()
        clearActiveTurn()
      }
      return false
    }
    if (generation !== dataGeneration || streamId !== streamGeneration || id !== state.activeSessionId) return false
    if (!active?.turn_id) {
      if (options.ai) {
        state.busy = false
        state.recovering = false
        restorePendingResolution()
        clearActiveTurn()
        await refreshMessages(id)
      }
      return false
    }
    if (options.expectedTurnId && active.turn_id !== options.expectedTurnId) {
      if (options.ai) {
        state.busy = false
        state.recovering = false
        restorePendingResolution()
        clearActiveTurn()
        await refreshMessages(id)
      }
      return false
    }
    if (!options.ai) state.messages.push({ id: uid('m'), role: 'ai', time: now(), blocks: [] })
    // reducer 必须持有 reactive 代理，否则恢复后的增量不会触发界面更新。
    const ai = options.ai ?? state.messages[state.messages.length - 1]!
    // 已结束轮次也恢复一次快照中的错误和执行图，但不阻止用户发送新消息。
    state.busy = active.executing
    state.recovering = true
    bindActiveTurn(id, active.turn_id)
    activeStreamTerminal = false
    activeStreamAbort = subscribeTurn(
      Number(id),
      active.turn_id,
      streamHandlers(ai, undefined, undefined, {
        sessionId: id,
        turnId: active.turn_id,
        streamId,
        recoveryAttempt: options.recoveryAttempt,
        completedSnapshot: !active.executing,
      }),
    )
    return true
  }

  function finalizeStream(
    reducer: ReturnType<typeof createSseReducer>, sessionId: string, error?: Error, refresh = true,
  ) {
    reducer.settleStreams()
    if (error) {
      state.messages[state.messages.length - 1]?.blocks?.push({
        kind: 'tool', tag: 'ERROR', fn: '连接错误', body: error.message, done: true,
      })
    }
    state.busy = false
    state.recovering = false
    activeStreamAbort = null
    clearActiveTurn()
    activeResolution = null
    if (refresh && !error && isBackendSession(sessionId) && sessionId === state.activeSessionId) {
      const generation = dataGeneration
      const streamId = streamGeneration
      // 先对齐持久历史，再恢复终态错误/执行图；终态订阅收尾时不再次刷新。
      void refreshMessages(sessionId).then(() => {
        if (generation === dataGeneration && streamId === streamGeneration && sessionId === state.activeSessionId) {
          return recoverActiveTurn(sessionId, { streamId })
        }
      })
    }
  }

  /** 为一条 AI 消息构造 SSE 回调(错误块 + 收尾停流式;dispatch 与 respondApproval 共用)。 */
  function streamHandlers(
    ai: ChatMessage,
    configuredAgentId?: number,
    configuredWorkflowId?: number,
    options: StreamOptions = {},
  ): SseHandlers {
    const reducer = buildReducer(ai, configuredAgentId, configuredWorkflowId)
    const generation = dataGeneration
    const streamId = options.streamId ?? streamGeneration
    let expectedSessionId = options.sessionId ?? (isBackendSession(state.activeSessionId) ? state.activeSessionId : null)
    let expectedTurnId = options.turnId ?? activeStreamTurnId
    let terminalSeen = false
    let recoveryStarted = false
    let recoveryAttempt = options.recoveryAttempt ?? 0
    const current = () => generation === dataGeneration && streamId === streamGeneration
    const finishCompletedSnapshot = (error?: Error) => {
      terminalSeen = true
      finalizeStream(reducer, expectedSessionId ?? state.activeSessionId, error, false)
      removeSyntheticMessage(ai.id)
    }
    const recover = (error?: Error) => {
      if (!current() || recoveryStarted || terminalSeen) return
      reducer.settleStreams()
      const sessionId = expectedSessionId ?? activeStreamSessionId ?? state.activeSessionId
      if (!isBackendSession(sessionId)) {
        terminalSeen = true
        finalizeStream(reducer, sessionId, error ?? new Error('连接已关闭，请重新发送消息'))
        return
      }
      recoveryAttempt += 1
      if (recoveryAttempt > 3) {
        terminalSeen = true
        finalizeStream(reducer, sessionId, error ?? new Error('执行流连接中断，请刷新会话重试'))
        return
      }
      recoveryStarted = true
      state.recovering = true
      const resume = async () => {
        if (recoveryAttempt > 1) {
          await new Promise((resolve) => setTimeout(resolve, 300 * (2 ** (recoveryAttempt - 2))))
        }
        if (!current()) return
        await recoverActiveTurn(sessionId, {
          ai,
          expectedTurnId: expectedTurnId ?? undefined,
          streamId,
          recoveryAttempt,
        })
      }
      void resume().finally(() => { recoveryStarted = false })
    }
    return {
      onEvent: (ev) => {
        if (!current()) return
        recoveryAttempt = 0
        const eventSessionId = ev.session_id != null ? String(ev.session_id) : null
        if (expectedSessionId && eventSessionId && eventSessionId !== expectedSessionId) return
        if (expectedTurnId && ev.turn_id && ev.turn_id !== expectedTurnId) return
        if (ev.type === 'run_started' && ev.turn_id) {
          if (eventSessionId) {
            expectedSessionId = eventSessionId
            if (state.activeSessionId !== eventSessionId && !isBackendSession(state.activeSessionId)) {
              reducer.handle({
                type: 'session_ready', sequence: ev.sequence, session_id: Number(eventSessionId),
                turn_id: ev.turn_id, data: { session_id: Number(eventSessionId) },
              })
            }
          }
          expectedTurnId = ev.turn_id
          bindActiveTurn(eventSessionId ?? expectedSessionId ?? state.activeSessionId, ev.turn_id)
          state.recovering = false
        }
        if (ev.type === 'run_snapshot') {
          if (ev.turn_id) {
            expectedTurnId = ev.turn_id
            bindActiveTurn(eventSessionId ?? expectedSessionId ?? state.activeSessionId, ev.turn_id)
          }
          const snapshot = snapshotRecord(ev.state)
          const numericSessionId = Number(eventSessionId ?? state.activeSessionId)
          if (snapshot && expectedTurnId && Number.isFinite(numericSessionId)) {
            hydrateRunSnapshot(snapshot, reducer, ai, numericSessionId, expectedTurnId)
          }
          state.recovering = false
        } else if (ev.type === 'run_end') {
          terminalSeen = true
          activeStreamTerminal = true
          if (options.completedSnapshot) finishCompletedSnapshot()
          else finalizeStream(reducer, eventSessionId ?? expectedSessionId ?? state.activeSessionId)
        } else {
          reducer.handle(ev)
        }
      },
      onError: (error) => {
        if (!current() || activeStreamTerminal || terminalSeen) return
        if (options.completedSnapshot) {
          finishCompletedSnapshot(error)
          return
        }
        if (error instanceof SseOpenError && error.status >= 400 && error.status < 500) {
          terminalSeen = true
          restorePendingResolution()
          finalizeStream(reducer, expectedSessionId ?? state.activeSessionId, error)
          return
        }
        recover(error)
      },
      onDone: () => {
        if (current() && !activeStreamTerminal && !terminalSeen) {
          if (options.completedSnapshot) finishCompletedSnapshot()
          else recover()
        }
      },
    }
  }

  /** 派发一次任务:POST /api/sessions/messages,消费 SSE 流增量更新对话与右栏 */
  function dispatch(
    text: string,
    options?: { agentId?: number | null; workflowId?: number | null },
  ): boolean {
    const content = text.trim()
    if (!canWriteSession() || state.busy || state.chatSelectionSaving || !content) return false
    const streamId = ++streamGeneration
    activeStreamSessionId = isBackendSession(state.activeSessionId) ? state.activeSessionId : null
    activeStreamTurnId = null
    activeStreamTerminal = false
    activeResolution = null
    state.recovering = false
    state.busy = true

    // 用户消息上屏
    state.messages.push({ id: uid('m'), role: 'user', time: now(), text: content })

    // 重置本轮舰队与任务
    state.agents = []
    state.tasks = []
    // Workflow 进度图按轮重置:上一轮的节点状态不能残留到本轮
    state.workflowProgress = emptyWorkflowProgress()
    state.selectedAgentId = null

    // 新建空 AI 消息,作为本轮 orchestrator 内容的容器
    state.messages.push({ id: uid('m'), role: 'ai', time: now(), blocks: [] })
    // 关键:取回 reactive 代理(而非上面的原始字面量),否则 reducer 改它不触发视图更新
    const ai = state.messages[state.messages.length - 1]

    const sessionId = /^\d+$/.test(state.activeSessionId)
      ? Number(state.activeSessionId)
      : undefined
    const localSession = sessionId === undefined
      ? state.sessions.find((session) => session.id === state.activeSessionId)
      : undefined
    // 后端只支持 agent_id / workflow_id 两种新会话目标。
    const requestedWorkflowId = options?.workflowId !== undefined
      ? options.workflowId
      : localSession?.workflowId ?? state.newSessionWorkflowId
    const configuredWorkflowId = sessionId === undefined
      ? requestedWorkflowId ?? undefined
      : undefined
    const requestedAgentId = options?.agentId !== undefined
      ? options.agentId
      : localSession?.agentId ?? state.newSessionAgentId
    const configuredAgentId = sessionId === undefined && configuredWorkflowId == null
      ? requestedAgentId ?? undefined
      : undefined
    if (localSession) {
      localSession.agentId = configuredAgentId ?? null
      localSession.workflowId = configuredWorkflowId ?? null
    }

    activeStreamAbort = sendMessage(
      {
        session_id: sessionId,
        ...(configuredAgentId == null ? {} : { agent_id: configuredAgentId }),
        ...(configuredWorkflowId == null ? {} : { workflow_id: configuredWorkflowId }),
        content,
        ...activeChatSelection(),
      },
      streamHandlers(ai, configuredAgentId, configuredWorkflowId, {
        sessionId: activeStreamSessionId ?? undefined,
        streamId,
      }),
    )
    return true
  }

  /** 响应通用人工交互并用新 SSE 流承接恢复后的执行。 */
  function respondInteractionAction(
    requestId: string,
    payload: InteractionResolutionRequest,
    responseLabel: string,
  ) {
    if (!canWriteSession() || state.busy) return
    const sessionId = /^\d+$/.test(state.activeSessionId)
      ? Number(state.activeSessionId)
      : undefined
    if (sessionId === undefined) return

    // 先更新卡片状态；若建流失败，错误会紧接着渲染在新 AI 消息中。
    let matched = false
    for (const m of state.messages) {
      if (!m.blocks) continue
      for (const b of m.blocks) {
        if (
          b.kind === 'interaction' &&
          b.interaction.request_id === requestId &&
          b.status === 'pending'
        ) {
          b.status = 'resolved'
          b.responseLabel = responseLabel
          matched = true
          break
        }
      }
      if (matched) break
    }
    if (!matched) return

    const streamId = ++streamGeneration
    activeStreamSessionId = String(sessionId)
    activeStreamTurnId = null
    activeStreamTerminal = false
    activeResolution = null
    state.busy = true
    // 恢复流承接到一条新 AI 消息(后端 resume 会重发 turn_start / tool_result / 后续文本)。
    state.messages.push({ id: uid('m'), role: 'ai', time: now(), blocks: [] })
    const ai = state.messages[state.messages.length - 1]
    activeResolution = { requestId, syntheticMessageId: ai.id }

    activeStreamAbort = respondInteraction(
      sessionId,
      requestId,
      payload,
      streamHandlers(ai, undefined, undefined, {
        sessionId: String(sessionId),
        streamId,
      }),
    )
  }

  /** 兼容旧 permission_request 卡片，并统一改走新版 interaction 恢复端点。 */
  function respondApprovalAction(
    requestId: string,
    decision: ApprovalDecision,
    updatedInput?: Record<string, unknown>,
  ) {
    if (!canWriteSession() || state.busy) return
    const legacy = state.messages
      .flatMap((message) => message.blocks ?? [])
      .find((block) => block.kind === 'approval' && block.requestId === requestId)
    if (!legacy || legacy.kind !== 'approval' || legacy.status !== 'pending') return
    const responseLabel = decision === 'deny'
      ? '已拒绝该工具调用'
      : decision === 'always_allow'
        ? '已允许并记住本会话规则'
        : '已允许本次执行'
    const sessionId = /^\d+$/.test(state.activeSessionId) ? Number(state.activeSessionId) : undefined
    if (sessionId === undefined) return
    legacy.status = decision
    const streamId = ++streamGeneration
    activeStreamSessionId = String(sessionId)
    activeStreamTurnId = null
    activeStreamTerminal = false
    activeResolution = null
    state.busy = true
    state.messages.push({ id: uid('m'), role: 'ai', time: now(), blocks: [] })
    const ai = state.messages[state.messages.length - 1]
    activeResolution = { requestId, syntheticMessageId: ai.id }
    activeStreamAbort = respondInteraction(
      sessionId,
      requestId,
      {
        kind: 'tool_approval',
        response_payload: {
          decision,
          updated_input: updatedInput,
          always_scope: 'session',
        },
      },
      streamHandlers(ai, undefined, undefined, {
        sessionId: String(sessionId),
        streamId,
      }),
    )
    void responseLabel
  }

  /** 取消交互所在暂停点，不再恢复本轮执行。 */
  async function cancelInteractionAction(requestId: string, suspensionId: string): Promise<boolean> {
    const sessionId = /^\d+$/.test(state.activeSessionId) ? Number(state.activeSessionId) : undefined
    if (!canWriteSession() || sessionId === undefined || state.busy) return false
    try {
      await cancelInteraction(sessionId, suspensionId)
      for (const message of state.messages) {
        for (const block of message.blocks ?? []) {
          if (block.kind === 'interaction' && block.interaction.request_id === requestId) {
            block.status = 'cancelled'
            block.responseLabel = '已取消本次运行'
          }
        }
      }
      return true
    } catch {
      return false
    }
  }

  /** 真正停止当前后端轮次；仅断开 SSE 不会停止服务端执行。 */
  async function cancelActiveTurn(): Promise<boolean> {
    if (!canWriteSession() || !isBackendSession(state.activeSessionId)) return false
    const streamId = streamGeneration
    const activeSessionId = state.activeSessionId
    const sessionId = Number(activeStreamSessionId ?? state.activeSessionId)
    if (!Number.isFinite(sessionId)) return false

    let turnId = activeStreamTurnId ?? state.activeTurnId
    if (!turnId) {
      try {
        const active = await getActiveTurn(sessionId)
        if (!active?.turn_id || !active.executing) return false
        turnId = active.turn_id
        bindActiveTurn(String(sessionId), turnId)
      } catch {
        return false
      }
    }

    try {
      await cancelTurn(sessionId, turnId)
    } catch {
      return false
    }

    if (streamId !== streamGeneration || activeSessionId !== state.activeSessionId) return true
    activeStreamTerminal = true
    streamGeneration += 1
    activeStreamAbort?.()
    activeStreamAbort = null
    activeResolution = null
    state.busy = false
    state.recovering = false
    clearActiveTurn()
    await refreshMessages(String(sessionId))
    return true
  }

  /** 首屏种子对话 */
  function seedConversation() {
    if (!state.sessions.length) {
      state.sessions = [...SESSIONS]
      state.activeSessionId = SESSIONS[0]?.id ?? ''
      state.activeAppId = SESSIONS[0]?.appId ?? null
      state.workbenchMode = defaultWorkbenchMode(state.activeSessionId)
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
          done: true,
          seconds: 1,
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
    canWriteSession,
    activeChatSelection,
    standardThinkingEffort,
    setChatSelection,
    toggleLeft,
    toggleRight,
    loadSessions,
    resetConsole,
    reloadConsole,
    launchApp,
    selectSession,
    newSession,
    openApp,
    setNewSessionAgent,
    setNewSessionWorkflow,
    setWorkbenchMode,
    sessionWorkflowId,
    setSearch,
    renameSession: renameSessionAction,
    deleteSessions: deleteSessionsAction,
    archiveSession: archiveSessionAction,
    shareSession: shareSessionAction,
    selectAgent,
    toggleTheme,
    dispatch,
    respondInteraction: respondInteractionAction,
    respondApproval: respondApprovalAction,
    cancelInteraction: cancelInteractionAction,
    cancelActiveTurn,
    stopExecution: cancelActiveTurn,
    seedConversation,
  }
})
