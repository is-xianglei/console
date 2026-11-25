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
  getSessionPendingInputList,
  getSessionTasks,
  getSessionTurnList,
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
  PendingInputResponse,
  SendMessageRequest,
  SessionTurnResponse,
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
  SnapshotInput,
  SseEvent,
  SseInteraction,
  SseWorkflowProgress,
  SubAgent,
  Task,
  TaskResponse,
  TaskState,
  ToolSourceFault,
  UnknownToolCall,
  WorkbenchMode,
  WorkflowMemberProgress,
  WorkflowProgressState,
} from '../interfaces/console/model'
import { mergeFaults } from '@/utils/mcp-tool'
import { createSseReducer, createStreamCursor, replaySnapshot, toolCardFields } from '@/utils/sse-reducer'
import { createClientInputId, presentClientInputIds } from '@/utils/client-input-id'
import type { ChatModelSelection } from '../interfaces/settings/models/model'
import { getSessionSubAgentRuns } from '../http/session-runtime'
import { ApiError } from '../http/index'
import { mapSubAgentRuns, mergeSubAgentRuns } from '../utils/session-runtime'
import { parseTeamInbox } from '../utils/team-runtime'
import { usePermissionsStore } from './permissions'
import { useSkillsStore } from './skills'
import { useMemoriesStore } from './memories'
import { useAuthStore } from './auth'
import { useTeamRuntimeStore } from './team-runtime'

// ===== 工具函数 =====
/** lead 改动团队成员或消息的工具；结果到达时刷新团队视图。 */
const TEAM_TOOL_NAMES = new Set(['SendMessage', 'TeamSpawn', 'TeamCreate'])
/** 没结束的回合：可以停止，发言会注入它，不能改模型选项。 */
const OPEN_TURN_STATUSES = new Set(['queued', 'running', 'awaiting_interaction'])
/** 要订阅跟随的回合；不能只看 active-turn 的 executing，queued 也要订阅。 */
const LIVE_TURN_STATUSES = new Set(['queued', 'running'])
/** 快照重放时会新建中间对话区块的事件；注入发言按位置插在这些块之前。 */
const BLOCK_CREATING_EVENTS = new Set(['block_start', 'tool_use', 'error', 'interaction_request', 'permission_request'])
/** 截断快照只取落库水位之后的在途内容，这些事件按 sequence 过滤。 */
const BLOCK_EVENTS = new Set(['block_start', 'thinking_delta', 'text_delta', 'block_stop', 'tool_use', 'tool_result', 'error'])
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
    teamDefinitionId: s.team_definition_id ?? null,
    modelName: s.model_name ?? null,
    modelProviderId: s.model_provider_id ?? null,
    modelProviderOverride: metadata.model_provider_override === true,
    thinkingEffort: s.thinking_effort ?? 'fast',
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

  // 出现过的轮次：一轮的第一条消息就是 <team-inbox> 时，这一轮是队友消息触发的自动回合。
  const seenTurns = new Set<string>()

  for (const m of list) {
    // 编排节点的中间产出(branch 非空)属于各自分支,不进主时间线,
    // 否则一次三成员的编排会在主对话里多出三条重复回复。
    if (m.branch) continue

    const time = formatTime(m.created_at)
    const firstOfTurn = Boolean(m.turn_id) && !seenTurns.has(m.turn_id!)
    if (m.turn_id) seenTurns.add(m.turn_id)

    if (m.role === 'user') {
      const text = messageText(m.content)
      // 注入发言带着它在回合事件流里的位置，快照重建时按位置插回回复之间。
      const meta = {
        messageId: m.id,
        ...(m.turn_id ? { turnId: m.turn_id } : {}),
        ...(m.stream_offset != null ? { streamOffset: m.stream_offset } : {}),
        ...(m.input_ids?.length ? { inputIds: [...m.input_ids] } : {}),
        ...(presentClientInputIds(m.client_input_ids).length ? { clientInputIds: presentClientInputIds(m.client_input_ids) } : {}),
      }
      // 队友消息合并成的 user 消息不是用户输入，显示成团队消息卡片。
      const entries = parseTeamInbox(text)
      if (entries) {
        out.push({ id: 'm-' + m.id, role: 'team', time, inbox: { entries, trigger: firstOfTurn }, ...meta })
        continue
      }
      if (text) out.push({ id: 'm-' + m.id, role: 'user', time, text, ...meta })
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
        // 历史消息不带来源，MCP 工具按 mcp__{server_key}__ 命名规则识别。
        const card: Extract<ChatBlock, { kind: 'tool' }> = {
          kind: 'tool',
          tag: b.name === 'Agent' || b.name === 'TeamSpawn' ? 'SPAWN' : 'TOOL',
          ...toolCardFields(b.name ?? 'tool', b.input),
          body: '',
          done: false,
        }
        if (b.id) card.toolId = b.id
        blocks.push(card)
        if (b.id) toolCards.set(b.id, card)
      } else if (b.type === 'tool_result') {
        fillToolResult(b)
      }
    }

    if (blocks.length) out.push({ id: 'm-' + m.id, role: 'ai', time, blocks, messageId: m.id, ...(m.turn_id ? { turnId: m.turn_id } : {}) })
  }

  // 收尾:历史中被中断、始终没等到 tool_result 的工具卡,置为完成态,避免前端一直转圈
  for (const card of toolCards.values()) {
    if (!card.done) card.done = true
  }

  return out
}

/** 各回合已落库消息的最大 stream_offset：不大于它的事件内容已在库里，大于的是在途内容。 */
function turnStreamOffsets(list: SessionMessageResponse[]): Map<string, number> {
  const offsets = new Map<string, number>()
  for (const m of list) {
    if (!m.turn_id || m.stream_offset == null) continue
    offsets.set(m.turn_id, Math.max(offsets.get(m.turn_id) ?? m.stream_offset, m.stream_offset))
  }
  return offsets
}

/** run_snapshot.state.inputs：本回合已认领的发言，忽略形状不对的项。 */
function snapshotInputs(value: unknown): SnapshotInput[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.message_id !== 'number' || typeof item.sequence !== 'number') return []
    const inputIds = Array.isArray(item.input_ids) ? item.input_ids.filter((id): id is number => typeof id === 'number') : []
    const clientInputIds = Array.isArray(item.client_input_ids)
      ? item.client_input_ids.map((id) => (typeof id === 'string' ? id : null))
      : []
    return [{ message_id: item.message_id, input_ids: inputIds, client_input_ids: clientInputIds, sequence: item.sequence }]
  })
}

/** 排队中的发言还原成气泡。 */
function mapPendingInput(input: PendingInputResponse): ChatMessage {
  return {
    id: `input-${input.input_id}`,
    role: 'user',
    time: formatTime(input.created_at),
    text: input.content,
    queued: true,
    queuedTurnId: input.turn_id,
    inputIds: [input.input_id],
    ...(input.client_input_id ? { clientInputIds: [input.client_input_id] } : {}),
  }
}

/** 发言是不是这几条之一：先比客户端发言 ID（不依赖流有没有送到），再比 input_id。 */
function isSameInput(message: ChatMessage, inputIds: readonly number[], clientInputIds: readonly (string | null)[]): boolean {
  const clientIds = presentClientInputIds(clientInputIds)
  return Boolean(message.clientInputIds?.some((id) => clientIds.includes(id)))
    || Boolean(message.inputIds?.some((id) => inputIds.includes(id)))
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
  /** 新会话草稿选中的 Team；与 Agent、Workflow 互斥 */
  newSessionTeamId: number | null
  chatSelection: ChatModelSelection
  chatSelectionSaving: boolean
  tasks: Task[]
  /** Workflow 进度图状态:按 agent_id 归并的成员 + 路由/汇总阶段 */
  workflowProgress: WorkflowProgressState
  /** 正在跟随一个执行中（或排队等执行）的回合，回复还在流入。 */
  busy: boolean
  /** 当前跟随的后端轮次；断流恢复和停止执行都以它为准。 */
  activeTurnId: string | null
  activeTurnSessionId: string | null
  /**
   * 会话最近一个没结束的回合（queued、running、awaiting_interaction）。
   * 等待审批时不再跟随流，但停止按钮和模型选项锁定仍要看它。
   */
  openTurn: { turnId: string; status: string } | null
  recovering: boolean
  theme: 'dark' | 'light'
}

/** 一条事件流正在跟随的回合，以及它写入的回复容器。 */
interface TurnFollow {
  /** send：发言接口；subscribe：订阅接口；resolve：人工交互决定接口。 */
  kind: 'send' | 'subscribe' | 'resolve'
  sessionId: string | null
  turnId: string | null
  /** 当前接收新块的回复容器；为空时下一个块在回合末尾新建。 */
  ai: ChatMessage | null
  /** 发言接口：本次发送的 user 消息。 */
  userMessageId?: string
  /** input_queued 给出的发言 ID。 */
  inputId: number | null
  /** 本次发言的客户端发言 ID；流断开时用它原样重发，拿到跟随原发言的流。 */
  clientInputId?: string
  /** 本次发言已被认领，或已换到后继回合。 */
  inputSettled: boolean
}

/** 停止、取消这类操作的结果；失败时 message 是可直接展示的后端原因。 */
export interface ConsoleActionResult {
  ok: boolean
  message?: string
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
  const teamRuntime = useTeamRuntimeStore()
  let activeStreamAbort: (() => void) | null = null
  let dataGeneration = 0
  let streamGeneration = 0
  let activeStreamSessionId: string | null = null
  let activeStreamTurnId: string | null = null
  let activeStreamTerminal = false
  let restoredAgentSessionId: string | null = null
  let restoredAgents: SubAgent[] = []
  let activeResolution: { requestId: string; syntheticMessageId: string } | null = null
  /** 当前那条事件流在跟随什么；停止时据此判断排队发言会不会自己切到后继回合。 */
  let activeFollow: TurnFollow | null = null
  /** 「会话:回合」→ 已落库消息的最大 stream_offset，截断快照据此拼接。 */
  const turnOffsets = new Map<string, number>()
  /** 「会话:回合」→ 结果未知的工具调用，来自回合列表接口。 */
  const turnAttention = new Map<string, UnknownToolCall[]>()
  /** 正在补拉正文的已认领发言，避免重复请求。 */
  const claimFetches = new Set<string>()
  /** 因 503 失败、可以原样重发的发言：气泡 ID → 当时的请求体（带同一个 client_input_id）。 */
  const retryPayloads = new Map<string, SendMessageRequest>()

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
    newSessionTeamId: null,
    chatSelection: { model_provider_id: null, thinking_effort: 'fast' },
    chatSelectionSaving: false,
    tasks: [],
    workflowProgress: emptyWorkflowProgress(),
    busy: false,
    activeTurnId: null,
    activeTurnSessionId: null,
    openTurn: null,
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
    activeFollow = null
    clearActiveTurn()
    state.busy = false
    state.openTurn = null
  }

  /** 有没结束的回合：显示停止按钮，模型选项不能改（后端会返回 409）。 */
  function hasOpenTurn(): boolean {
    return state.busy || state.openTurn != null
  }

  /** 记下会话最近一个回合的状态；结束了就清掉（只清同一回合，避免迟到的帧把后继回合清掉）。 */
  function noteTurnStatus(turnId: string, status: string | null | undefined) {
    if (status && OPEN_TURN_STATUSES.has(status)) {
      state.openTurn = { turnId, status }
    } else if (!state.openTurn || state.openTurn.turnId === turnId) {
      state.openTurn = null
    }
  }

  // ===== 消息列表里的回合位置 =====
  function findMessage(id: string | null | undefined): ChatMessage | undefined {
    return id ? state.messages.find((message) => message.id === id) : undefined
  }

  function removeMessage(id: string) {
    const index = state.messages.findIndex((message) => message.id === id)
    if (index >= 0) state.messages.splice(index, 1)
  }

  /** 插入消息并返回 reactive 数组里的代理；reducer 必须持有代理才能触发视图更新。 */
  function insertMessage(message: ChatMessage, index: number): ChatMessage {
    state.messages.splice(index, 0, message)
    return state.messages[index]!
  }

  /** 排队中的发言固定在列表末尾，回合内容插在它们之前。 */
  function queuedTailIndex(): number {
    let index = state.messages.length
    while (index > 0 && state.messages[index - 1]!.queued) index -= 1
    return index
  }

  /** 回合的下一条内容接在该回合最后一条消息之后；回合还没有消息时放在排队发言之前。 */
  function turnInsertIndex(turnId: string | null | undefined): number {
    if (turnId) {
      for (let index = state.messages.length - 1; index >= 0; index -= 1) {
        if (state.messages[index]!.turnId === turnId && !state.messages[index]!.queued) return index + 1
      }
    }
    return queuedTailIndex()
  }

  /** 实时流建出的回复容器（没有后端消息 ID）。 */
  function isLiveContainer(message: ChatMessage): boolean {
    return message.role === 'ai' && message.messageId == null
  }

  /** 跟随的回合当前接收新块的容器；没有时在回合末尾新建。 */
  function followContainer(follow: TurnFollow): ChatMessage {
    const existing = findMessage(follow.ai?.id)
    if (existing) return existing
    const container = insertMessage(
      { id: uid('m'), role: 'ai', time: now(), blocks: [], ...(follow.turnId ? { turnId: follow.turnId } : {}) },
      turnInsertIndex(follow.turnId),
    )
    follow.ai = container
    return container
  }

  /** 当前容器还是空的就收掉，免得注入发言前面留一个空的回复。 */
  function dropEmptyContainer(follow: TurnFollow) {
    const current = findMessage(follow.ai?.id)
    if (current && isLiveContainer(current) && !current.blocks?.length) removeMessage(current.id)
    follow.ai = null
  }

  /** 收尾时去掉最终没有内容的实时回复容器。 */
  function pruneEmptyContainers() {
    for (let index = state.messages.length - 1; index >= 0; index -= 1) {
      const message = state.messages[index]!
      if (isLiveContainer(message) && !message.blocks?.length) state.messages.splice(index, 1)
    }
  }

  /** 发言被回合认领：结束排队，记下它在回合里的位置。 */
  function claimMessage(message: ChatMessage, turnId: string, input: SnapshotInput): ChatMessage {
    message.queued = false
    message.queuedTurnId = null
    message.retryable = false
    message.turnId = turnId
    message.messageId = input.message_id
    message.inputIds = [...input.input_ids]
    const clientInputIds = presentClientInputIds(input.client_input_ids)
    if (clientInputIds.length) message.clientInputIds = clientInputIds
    message.streamOffset = input.sequence
    return message
  }

  /** 本次跟随的发言是不是在这几条里。 */
  function followsInput(follow: TurnFollow, inputIds: readonly number[], clientInputIds: readonly (string | null)[]): boolean {
    return (follow.inputId != null && inputIds.includes(follow.inputId))
      || (follow.clientInputId != null && clientInputIds.includes(follow.clientInputId))
  }

  /** 别的页面发的发言被认领时本页没有正文，从消息列表补上。 */
  async function fillClaimedText(sessionId: string, messageId: number) {
    const key = `${sessionId}:${messageId}`
    if (claimFetches.has(key)) return
    claimFetches.add(key)
    const generation = dataGeneration
    try {
      const list = await getSessionMessageList(sessionId)
      if (generation !== dataGeneration || sessionId !== state.activeSessionId) return
      const source = list.find((item) => item.id === messageId)
      const target = state.messages.find((item) => item.role !== 'ai' && item.messageId === messageId)
      if (!source || !target || target.text || target.inbox) return
      const text = messageText(source.content)
      const entries = parseTeamInbox(text)
      if (entries) {
        target.role = 'team'
        target.inbox = { entries, trigger: false }
      } else {
        target.text = text
      }
    } catch {
      // 补不到正文时保留空位，回合结束重拉历史后会对齐。
    } finally {
      claimFetches.delete(key)
    }
  }

  /** 实时收到 input_claimed：排队中的发言换成正式的 user 消息，排在之后新建的回复之前。 */
  function claimLiveInput(follow: TurnFollow, ev: SseEvent) {
    const turnId = ev.data?.turn_id ?? follow.turnId
    const messageId = ev.data?.message_id
    const inputIds = ev.data?.input_ids ?? []
    const clientInputIds = ev.data?.client_input_ids ?? []
    if (!turnId || messageId == null || typeof ev.sequence !== 'number') return
    if (followsInput(follow, inputIds, clientInputIds)) follow.inputSettled = true
    // 快照或历史里已经有这条消息。
    if (state.messages.some((message) => message.role !== 'ai' && message.messageId === messageId)) return
    // 本页连发多条时，前面几条的流可能在 input_queued 之前就断开了，只能按客户端发言 ID 对上。
    const matches = state.messages.filter((message) => message.role === 'user' && isSameInput(message, inputIds, clientInputIds))
    for (const match of matches) removeMessage(match.id)
    dropEmptyContainer(follow)
    const base = matches[0] ?? { id: `m-${messageId}`, role: 'user' as const, time: now(), text: '' }
    // 几条排队发言合成一条消息时先拼起来，回合结束重拉历史后以后端正文为准。
    if (matches.length > 1) base.text = matches.map((match) => match.text ?? '').filter(Boolean).join('\n\n')
    const message = insertMessage(
      claimMessage(base, turnId, { message_id: messageId, input_ids: inputIds, client_input_ids: clientInputIds, sequence: ev.sequence }),
      turnInsertIndex(turnId),
    )
    if (!message.text && follow.sessionId) void fillClaimedText(follow.sessionId, messageId)
    if (state.busy) followContainer(follow)
  }

  /** 停掉的回合里还没处理的交互卡收尾成已取消。 */
  function cancelTurnInteractions(turnId: string | null | undefined, label = '已停止本轮执行') {
    for (const message of state.messages) {
      if (turnId && message.turnId !== turnId) continue
      for (const block of message.blocks ?? []) {
        if (block.kind === 'interaction' && block.status === 'pending') {
          block.status = 'cancelled'
          block.responseLabel = label
        } else if (block.kind === 'approval' && block.status === 'pending') {
          block.status = 'deny'
        }
      }
    }
  }

  /** 交互卡所在的回合。 */
  function interactionTurnId(requestId: string): string | null {
    const message = state.messages.find((item) => item.blocks?.some((block) =>
      (block.kind === 'interaction' && block.interaction.request_id === requestId)
      || (block.kind === 'approval' && block.requestId === requestId)))
    return message?.turnId ?? null
  }

  /**
   * 本页记的回合状态可能过时（发言被拒、停止时回合已经结束）：按 active-turn 对齐一次，
   * 有排队或执行中的另一个回合就订阅它。
   */
  async function resyncOpenTurn(sessionId: string, previousTurnId: string | null) {
    const generation = dataGeneration
    const streamId = streamGeneration
    let active
    try {
      active = await getActiveTurn(sessionId)
    } catch {
      return
    }
    if (generation !== dataGeneration || streamId !== streamGeneration || sessionId !== state.activeSessionId) return
    if (!active?.turn_id) {
      state.openTurn = null
      return
    }
    if (active.turn_id !== previousTurnId && LIVE_TURN_STATUSES.has(active.status) && !state.busy) {
      await recoverActiveTurn(sessionId)
      return
    }
    noteTurnStatus(active.turn_id, active.status)
  }

  function bindActiveTurn(sessionId: string, turnId: string) {
    activeStreamSessionId = sessionId
    activeStreamTurnId = turnId
    state.activeTurnSessionId = sessionId
    state.activeTurnId = turnId
  }

  /**
   * tool_sources 只在实时流里出现，历史消息和轮次快照都不带。按「会话:轮次」记下来，
   * 每轮结束重拉历史、或从快照重建回复时，再挂回该轮第一条回复的最上面；刷新页面后不保留。
   */
  const toolSourceFaults = new Map<string, ToolSourceFault[]>()

  function rememberToolSources(sessionId: string, turnId: string, faults: ToolSourceFault[]) {
    const key = `${sessionId}:${turnId}`
    toolSourceFaults.set(key, mergeFaults(toolSourceFaults.get(key) ?? [], faults))
  }

  function attachToolSources(sessionId: string, messages: ChatMessage[]) {
    const seen = new Set<string>()
    for (const message of messages) {
      if (message.role !== 'ai' || !message.turnId || seen.has(message.turnId)) continue
      seen.add(message.turnId)
      const faults = toolSourceFaults.get(`${sessionId}:${message.turnId}`)
      if (!faults?.length) continue
      const blocks = message.blocks ?? (message.blocks = [])
      const existing = blocks.find((block) => block.kind === 'sources')
      if (existing?.kind === 'sources') existing.faults = mergeFaults(existing.faults, faults)
      else blocks.unshift({ kind: 'sources', faults: [...faults] })
    }
  }

  function snapshotRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  }

  /**
   * 用 run_snapshot 整体重建一个回合的显示：快照里只有主线与子运行的块，user 消息仍从列表取。
   * - 完整快照：本回合的回复全部按快照重建；截断快照缺前段，已落库的回复保留，快照只取落库水位之后的在途内容。
   * - 注入发言（本回合已有位置的、快照 inputs 里认领的、还在排队但已被认领的）按 sequence 插在建块位置大于它的内容之前。
   */
  function hydrateRunSnapshot(
    snapshot: Record<string, unknown>,
    reducer: ReturnType<typeof createSseReducer>,
    follow: TurnFollow,
    sessionId: number,
  ) {
    const turnId = follow.turnId
    if (!turnId) return
    const sid = String(sessionId)
    // 快照不记录 tool_sources：本回合回复上已有的提示先登记，重建后由 attachToolSources 挂回。
    for (const message of state.messages) {
      if (message.role !== 'ai' || message.turnId !== turnId) continue
      for (const block of message.blocks ?? []) {
        if (block.kind === 'sources') rememberToolSources(sid, turnId, block.faults)
      }
    }
    const truncated = snapshot.truncated === true
    const persisted = truncated ? turnOffsets.get(`${sid}:${turnId}`) ?? null : null
    const fresh = (sequence: number) => persisted == null || sequence > persisted
    const claimed = snapshotInputs(snapshot.inputs)
    // 重发或续上时，本次发言可能已在快照里被认领。
    if (claimed.some((input) => followsInput(follow, input.input_ids, input.client_input_ids))) follow.inputSettled = true
    // 截断时不大于落库水位的已在列表里，留在原位；本页还显示为排队中的照样认领。
    const listed = (input: SnapshotInput) => state.messages.some((message) => message.role !== 'ai' && message.messageId === input.message_id)
    const inputs = claimed.filter((input) => fresh(input.sequence) || !listed(input))

    // 取出要按位置重新排的注入发言，并拿掉本回合要重建的回复。
    const injected: Array<{ sequence: number; message: ChatMessage }> = []
    const kept: ChatMessage[] = []
    for (const message of state.messages) {
      if (message.role !== 'ai') {
        const input = inputs.find((item) =>
          (message.messageId != null && item.message_id === message.messageId)
          || isSameInput(message, item.input_ids, item.client_input_ids))
        const offset = message.turnId === turnId && message.streamOffset != null ? message.streamOffset : null
        if (input) {
          injected.push({ sequence: input.sequence, message: claimMessage(message, turnId, input) })
          continue
        }
        if (offset != null && fresh(offset)) {
          injected.push({ sequence: offset, message })
          continue
        }
      }
      if (message.role === 'ai' && message.turnId === turnId && (!truncated || message.messageId == null)) continue
      kept.push(message)
    }
    state.messages = kept

    // 同一条消息合并了几条排队发言时只留一个气泡；快照认领了、本页却没有正文的发言先占位再补拉。
    const ordered: Array<{ sequence: number; message: ChatMessage }> = []
    const byMessageId = new Map<number, ChatMessage>()
    for (const item of injected) {
      const id = item.message.messageId
      const previous = id != null ? byMessageId.get(id) : undefined
      if (previous) {
        previous.text = [previous.text, item.message.text].filter(Boolean).join('\n\n')
        continue
      }
      if (id != null) byMessageId.set(id, item.message)
      ordered.push(item)
    }
    for (const input of inputs) {
      if (byMessageId.has(input.message_id)) continue
      const placeholder: ChatMessage = { id: `m-${input.message_id}`, role: 'user', time: now(), text: '' }
      ordered.push({ sequence: input.sequence, message: claimMessage(placeholder, turnId, input) })
      void fillClaimedText(sid, input.message_id)
    }
    ordered.sort((left, right) => left.sequence - right.sequence)

    reducer.reset()
    follow.ai = null
    attachToolSources(sid, [followContainer(follow)])
    const selectedAgentId = state.selectedAgentId
    const subRunIds = new Set((Array.isArray(snapshot.sub_runs) ? snapshot.sub_runs : []).flatMap((raw) => {
      const run = snapshotRecord(raw)
      return typeof run?.sub_run_id === 'string' ? [run.sub_run_id] : []
    }))
    // 快照只覆盖当前轮次，先保留不属于本轮的持久化运行，再重建本轮实时事件。
    const previousRuns = restoredAgentSessionId === sid
      ? restoredAgents.filter((agent) => !subRunIds.has(agent.id))
      : []
    state.agents.splice(0, state.agents.length, ...previousRuns)
    state.selectedAgentId = null
    // 快照从未收到 task_snapshot 时 tasks 为 null，保留 REST 已恢复的会话任务。
    state.workflowProgress = emptyWorkflowProgress()

    const lastOffset = Number(snapshot.last_offset ?? 0)
    const session = snapshotRecord(snapshot.session)
    if (session) {
      reducer.handle({
        type: 'session_ready', sequence: lastOffset, session_id: sessionId, turn_id: turnId,
        data: { session_id: sessionId, title: typeof session.title === 'string' ? session.title : undefined },
      })
    }
    if (Array.isArray(snapshot.tasks)) {
      reducer.handle({
        type: 'task_snapshot', sequence: lastOffset, session_id: sessionId,
        turn_id: turnId, data: { session_id: sessionId, tasks: snapshot.tasks as TaskResponse[] },
      })
    }
    if (Array.isArray(snapshot.workflow)) {
      for (const item of snapshot.workflow) {
        const progress = snapshotRecord(item)
        if (!progress) continue
        reducer.handle({
          type: 'workflow_progress', sequence: lastOffset, session_id: sessionId, turn_id: turnId,
          progress: progress as unknown as SseWorkflowProgress,
        })
      }
    }

    /** 把建块位置在 sequence 之前的注入发言插进来；之后的块写进它后面新建的回复。 */
    const flushInputsBefore = (sequence: number) => {
      while (ordered.length && ordered[0]!.sequence < sequence) {
        const { message } = ordered.shift()!
        dropEmptyContainer(follow)
        insertMessage(message, turnInsertIndex(turnId))
      }
    }
    // 截断快照里工具调用已落库、结果还在途时，结果回填到列表里的工具卡。
    const persistedTools = new Map<string, Extract<ChatBlock, { kind: 'tool' }>>()
    if (truncated) {
      for (const message of state.messages) {
        if (message.role !== 'ai' || message.turnId !== turnId) continue
        for (const block of message.blocks ?? []) {
          if (block.kind === 'tool' && block.toolId) persistedTools.set(block.toolId, block)
        }
      }
    }
    // 快照回放读 main、sub_runs、errors；子运行的块按 sub_run_id 写进各自面板。
    replaySnapshot(snapshot, (ev) => {
      const sequence = ev.sequence ?? 0
      const mainLine = ev.type !== 'subagent_event'
      // 注入发言只和主线内容按位置交错，子运行的面板不参与。
      const contentEvent = mainLine ? ev.type : ev.sub_type ?? ''
      const card = mainLine && ev.tool?.id ? persistedTools.get(ev.tool.id) : undefined
      if (card && ev.type === 'tool_use' && !fresh(sequence)) {
        // 已落库、还没有结果的调用当作还在执行（历史映射把它标成了完成），等结果回填。
        if (card.tag === 'TOOL' || card.tag === 'SPAWN') {
          card.done = false
          reducer.adoptTool(ev, card)
        }
        return
      }
      if (card && ev.type === 'tool_result' && !fresh(sequence)) return
      if (BLOCK_EVENTS.has(contentEvent) && sequence > 0 && !fresh(sequence)) return
      if (mainLine && sequence > 0 && BLOCK_CREATING_EVENTS.has(contentEvent)) flushInputsBefore(sequence)
      reducer.handle(ev)
    }, sessionId, turnId)
    flushInputsBefore(Number.POSITIVE_INFINITY)
    if (snapshot.status === 'needs_attention') reducer.markAttention()
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
      if (!existingInteraction) {
        reducer.handle({
          type: 'interaction_request', sequence: lastOffset, session_id: sessionId, turn_id: turnId,
          interaction: interaction as unknown as SseInteraction,
        })
      }
    }
    // 进行中的回合留一个等新内容的容器（显示执行中）。
    if (state.busy) followContainer(follow)
  }

  // ===== 后端接入:会话列表 =====
  /** 拉取真实会话列表;可优先恢复 URL 指定会话,成功返回 true。 */
  async function loadSessions(preferredSessionId?: string): Promise<boolean> {
    const generation = dataGeneration
    state.sessionsLoading = true
    try {
      const list = await getSessionList()
      if (generation !== dataGeneration) return false

      const sessions = list.map((item) => mapSession(item, authStore.state.user?.id ?? null))
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
      state.newSessionTeamId = null
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
   * 队友运行时跟随当前会话：后端会话打开（已打开时只刷新一次），本地草稿断开。
   * 队友的状态独立于 lead 回合，派发新回合不清空，只在切换会话时重置。
   */
  function followTeamRuntime(id: string) {
    if (!isBackendSession(id)) {
      teamRuntime.close()
      return
    }
    void teamRuntime.open(id, {
      teamSession: sessionTeamId(id) != null,
      onLeadTurn: (turnId) => { void followLeadTurn(id, turnId) },
    })
  }

  /**
   * 后端发起了 lead 自动回合：当前没在跟随执行中的回合时，重拉历史（带上开头的团队消息）并订阅它。
   * 通知流首次订阅会重放旧通知，所以先确认这个回合还没结束（排队或执行中），旧回合直接忽略。
   */
  async function followLeadTurn(sessionId: string, turnId: string) {
    if (sessionId !== state.activeSessionId || state.busy || activeStreamTurnId === turnId) return
    const generation = dataGeneration
    let active
    try {
      active = await getActiveTurn(sessionId)
    } catch {
      return
    }
    if (generation !== dataGeneration || sessionId !== state.activeSessionId || state.busy) return
    if (active?.turn_id !== turnId || !LIVE_TURN_STATUSES.has(active.status)) return
    // 断开可能残留的已结束快照订阅，再由 loadMessages → recoverActiveTurn 接上自动回合。
    streamGeneration += 1
    activeStreamAbort?.()
    activeStreamAbort = null
    activeResolution = null
    activeFollow = null
    clearActiveTurn()
    await loadMessages(sessionId)
  }

  /**
   * 按回合列表给「需要人工处理」的回合挂提示卡（含历史回合）：挂在该回合最后一条回复上，
   * 回合没有回复时接在起始发言后面。结果未知的工具调用记下来，快照重建提示卡时也带上。
   */
  function attachAttention(sessionId: string, turns: SessionTurnResponse[]) {
    for (const turn of turns) {
      if (turn.status !== 'needs_attention') continue
      const calls = Array.isArray(turn.unknown_tool_calls) ? turn.unknown_tool_calls : []
      turnAttention.set(`${sessionId}:${turn.turn_id}`, calls)
      const hasCard = state.messages.some((message) =>
        message.turnId === turn.turn_id && message.blocks?.some((block) => block.kind === 'attention'))
      if (hasCard) continue
      let index = -1
      for (let cursor = state.messages.length - 1; cursor >= 0; cursor -= 1) {
        if (state.messages[cursor]!.turnId === turn.turn_id) {
          index = cursor
          break
        }
      }
      if (index < 0 && turn.started_message_id != null) {
        index = state.messages.findIndex((message) => message.messageId === turn.started_message_id)
      }
      if (index < 0) continue
      const last = state.messages[index]!
      const block: ChatBlock = { kind: 'attention', calls: [...calls] }
      if (last.role === 'ai') (last.blocks ?? (last.blocks = [])).push(block)
      else insertMessage({ id: `attention-${turn.turn_id}`, role: 'ai', time: last.time, turnId: turn.turn_id, blocks: [block] }, index + 1)
    }
  }

  /**
   * 加载会话历史、待处理交互、任务和子代理运行，已结束轮次也从 REST 恢复。
   * 各请求独立降级，辅助查询失败不阻断历史展示和执行流续订阅。
   */
  async function loadMessages(id: string, options: { recover?: boolean } = {}) {
    const generation = dataGeneration
    const streamId = streamGeneration
    if (id === state.activeSessionId) followTeamRuntime(id)
    if (!isBackendSession(id)) {
      if (id === state.activeSessionId) state.messages = []
      return
    }
    const [historyResult, pendingResult, tasksResult, runsResult, inputsResult, turnsResult] = await Promise.allSettled([
      getSessionMessageList(id),
      getPendingInteraction(id),
      getSessionTasks(id),
      getSessionSubAgentRuns(id),
      getSessionPendingInputList(id),
      getSessionTurnList(id),
    ])
    // 旧轮次的刷新不能覆盖新发送的乐观消息，也不能回填到已切换的会话。
    if (generation !== dataGeneration || streamId !== streamGeneration || id !== state.activeSessionId) return

    if (historyResult.status === 'rejected') {
      state.messages = []
      state.health = 'error'
      return
    }

    state.messages = mapMessages(historyResult.value)
    for (const [turnId, offset] of turnStreamOffsets(historyResult.value)) turnOffsets.set(`${id}:${turnId}`, offset)
    attachToolSources(id, state.messages)
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
        turnId: pending!.suspension.turn_id,
        blocks: pendingRequests.map((request) => ({
          kind: 'interaction',
          interaction: mapPendingInteraction(request),
          status: 'pending',
        })),
      })
    }
    if (turnsResult.status === 'fulfilled' && Array.isArray(turnsResult.value)) attachAttention(id, turnsResult.value)
    // 还没被认领的发言不在消息列表里，放回末尾显示为排队中。
    if (inputsResult.status === 'fulfilled' && Array.isArray(inputsResult.value)) {
      for (const input of inputsResult.value) {
        if (state.messages.some((message) => isSameInput(message, [input.input_id], [input.client_input_id]))) continue
        state.messages.push(mapPendingInput(input))
      }
    }
    state.health = [pendingResult, tasksResult, runsResult, inputsResult, turnsResult].some((result) => result.status === 'rejected')
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
    teamRuntime.close()
    toolSourceFaults.clear()
    turnOffsets.clear()
    turnAttention.clear()
    claimFetches.clear()
    retryPayloads.clear()
    restoredAgentSessionId = null
    restoredAgents = []

    state.chatSelection = { model_provider_id: null, thinking_effort: 'fast' }
    state.chatSelectionSaving = false
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
    state.newSessionTeamId = null
    state.tasks = []
    state.workflowProgress = emptyWorkflowProgress()
    state.busy = false
    state.activeTurnId = null
    state.activeTurnSessionId = null
    state.openTurn = null
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
    state.newSessionTeamId = null
    state.workflowProgress = emptyWorkflowProgress()
    state.workbenchMode = defaultWorkbenchMode(id)
    loadMessages(id)
  }
  function newSession(appId?: Session['appId']) {
    invalidateStream()
    teamRuntime.close()
    const s: Session = {
      id: uid('sess'),
      title: '新会话 ' + now().slice(0, 5),
      time: '刚刚',
      count: 0,
      appId,
    }
    s.modelProviderId = state.chatSelection.model_provider_id
    s.modelProviderOverride = state.chatSelection.model_provider_id !== null
    s.thinkingEffort = state.chatSelection.thinking_effort
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
    state.newSessionTeamId = null
    state.workflowProgress = emptyWorkflowProgress()
  }

  function setNewSessionAgent(agentId: number | null) {
    if (isBackendSession(state.activeSessionId)) return
    state.newSessionAgentId = agentId
    // 后端约束 agent 与 Workflow 互斥:Workflow 草稿无条件解绑(含回到平台默认 Agent),
    // composer 切回时自动生效
    state.newSessionWorkflowId = null
    state.newSessionTeamId = null
    const localSession = state.sessions.find((session) => session.id === state.activeSessionId)
    if (localSession) localSession.agentId = agentId
  }

  /** 为新会话草稿绑定 Workflow;绑定后默认切到执行图视图。
   *  后端约束 workflow_id / agent_id 互斥。 */
  function setNewSessionWorkflow(workflowId: number | null) {
    if (isBackendSession(state.activeSessionId)) return
    state.newSessionWorkflowId = workflowId
    if (workflowId != null) {
      // 选中 Workflow 即放弃 Agent、Team 草稿
      state.newSessionAgentId = null
      state.newSessionTeamId = null
      const localSession = state.sessions.find((session) => session.id === state.activeSessionId)
      if (localSession) localSession.agentId = null
    }
    if (!getWorkbenchApp(state.activeAppId)) {
      state.workbenchMode = workflowId != null ? 'graph' : 'chat'
    }
  }

  /** 为新会话草稿选 Team：会话的主 Agent 担任 lead，与 Agent、Workflow 互斥。 */
  function setNewSessionTeam(teamId: number | null) {
    if (isBackendSession(state.activeSessionId)) return
    state.newSessionTeamId = teamId
    if (teamId == null) return
    state.newSessionAgentId = null
    state.newSessionWorkflowId = null
    const localSession = state.sessions.find((session) => session.id === state.activeSessionId)
    if (localSession) localSession.agentId = null
    if (!getWorkbenchApp(state.activeAppId) && state.workbenchMode === 'graph') state.workbenchMode = 'chat'
  }

  /** 会话选用的 Team；本地草稿会话回退到 newSessionTeamId。 */
  function sessionTeamId(id: string): number | null {
    const session = state.sessions.find((item) => item.id === id)
    if (session?.teamDefinitionId != null) return session.teamDefinitionId
    return isBackendSession(id) ? null : state.newSessionTeamId
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
      state.newSessionTeamId = null
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
    return session ? {
      model_provider_id: session.modelProviderOverride === true ? session.modelProviderId ?? null : null,
      thinking_effort: session.thinkingEffort ?? 'fast',
    } : { ...state.chatSelection }
  }

  /** 持久会话保存成功后才更新界面，保存期间禁止发送旧配置。 */
  async function setChatSelection(selection: ChatModelSelection): Promise<boolean> {
    // 回合排队、执行或等待交互期间后端拒绝修改（409），这里先拦住。
    if (hasOpenTurn() || state.chatSelectionSaving || !canWriteSession()) return false
    const id = state.activeSessionId
    const generation = dataGeneration
    // 后端拒绝未知字段，只发这两项。
    const next: ChatModelSelection = { model_provider_id: selection.model_provider_id, thinking_effort: selection.thinking_effort }
    state.chatSelectionSaving = true
    try {
      const saved = isBackendSession(id) ? await updateSessionChatSelection(id, next) : null
      if (generation !== dataGeneration) return false
      const target = state.sessions.find((item) => item.id === id)
      if (target) {
        // 后端返回实际解析模型，显式覆盖仍以本次请求语义为准，不能把角色模型变成选择。
        target.modelProviderId = saved?.model_provider_id ?? next.model_provider_id
        target.modelProviderOverride = saved?.metadata?.model_provider_override === undefined
          ? next.model_provider_id !== null : saved.metadata.model_provider_override === true
        target.thinkingEffort = saved?.thinking_effort ?? next.thinking_effort
      } else if (id === state.activeSessionId) {
        state.chatSelection = next
      }
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
        state.newSessionTeamId = null
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
   *  member 按 member_id 归并：status 覆盖、member_name 有值才覆盖、ordinal/total 透传；
   *  routing/merging 只写阶段状态,路由命中时记录 routedAgentId。 */
  function mergeWorkflowProgress(progress: SseWorkflowProgress) {
    const phase = progress.phase
    const status = (value: string | undefined): 'running' | 'done' | 'failed' | null =>
      value === 'running' || value === 'done' || value === 'failed' ? value : null

    if (phase === 'member') {
      const agentId = progress.agent_id
      // 成员卡的键；后端约定 member 阶段必带，缺失时按 agent_id 还原同一个值。
      const memberId = progress.member_id ?? (agentId != null ? `member:${agentId}` : null)
      if (memberId == null || agentId == null) {
        // 协议异常：没有 member_id 与 agent_id 就无从归并，忽略并告警。
        console.warn(`workflow_progress 的 member 事件缺少 agent_id / member_id,已忽略:${JSON.stringify(progress)}`)
        return
      }
      const prev = state.workflowProgress.members[memberId]
      const merged: WorkflowMemberProgress = {
        memberId,
        agentId,
        memberName: progress.member_name ?? prev?.memberName ?? null,
        status: status(progress.status) ?? prev?.status ?? 'running',
      }
      if (progress.ordinal != null) merged.ordinal = progress.ordinal
      else if (prev?.ordinal != null) merged.ordinal = prev.ordinal
      if (progress.total != null) merged.total = progress.total
      else if (prev?.total != null) merged.total = prev.total
      state.workflowProgress.members[memberId] = merged
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

  /** 为一次跟随构造 SSE 归约器：回复写进跟随回合当前的容器，没有时在回合末尾新建。 */
  function buildReducer(
    follow: TurnFollow,
    configuredAgentId?: number,
    configuredWorkflowId?: number,
    configuredTeamId?: number,
  ) {
    const chatSelection = activeChatSelection()
    return createSseReducer({
      get ai() {
        return followContainer(follow)
      },
      peekAi: () => findMessage(follow.ai?.id) ?? null,
      agents: state.agents,
      selectAgent: (id) => {
        state.selectedAgentId = id
      },
      attentionCalls: () => {
        const sessionId = follow.sessionId ?? state.activeSessionId
        return follow.turnId ? [...(turnAttention.get(`${sessionId}:${follow.turnId}`) ?? [])] : []
      },
      onSessionId: (sid) => {
        const idStr = String(sid)
        follow.sessionId = idStr
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
              teamDefinitionId: configuredTeamId ?? null,
              modelProviderId: chatSelection.model_provider_id,
              modelProviderOverride: chatSelection.model_provider_id !== null,
              thinkingEffort: chatSelection.thinking_effort,
            })
          }
          state.activeSessionId = idStr
        }
        // 会话已落库,绑定关系改由会话自身承载;草稿字段必须清空,否则下一个新会话会继承它
        const promoted = state.sessions.find((s) => s.id === idStr)
        if (promoted) {
          if (configuredAgentId != null) promoted.agentId = configuredAgentId
          if (configuredWorkflowId != null) promoted.workflowId = configuredWorkflowId
          if (configuredTeamId != null) promoted.teamDefinitionId = configuredTeamId
        }
        state.newSessionAgentId = null
        state.newSessionWorkflowId = null
        state.newSessionTeamId = null
        // Team 会话建好时名单成员已经就位，首轮里 lead 分派的激活要能马上跟上。
        if (state.activeSessionId === idStr) followTeamRuntime(idStr)
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
    streamId?: number
    recoveryAttempt?: number
    completedSnapshot?: boolean
    configuredAgentId?: number
    configuredWorkflowId?: number
    /** 新会话选用的 Team，session_ready 时写到会话上。 */
    configuredTeamId?: number
    /** 建流被 HTTP 拒绝时先交给调用方；返回 true 表示已处理，不再在回复里显示错误。 */
    onRejected?: (error: SseOpenError) => boolean
    /** 发言接口：本次请求体，503 后原样重发用。 */
    payload?: SendMessageRequest
    /** 发言接口：用同一 client_input_id 原样重发，断线后拿到跟随原发言的等价流。 */
    reopen?: (handlers: SseHandlers) => () => void
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

  /** 订阅一个已知回合：先收 run_snapshot 再续播。断线、stream_error 后都走这里续上。 */
  function subscribeFollow(sessionId: string, follow: TurnFollow, options: StreamOptions) {
    follow.sessionId = sessionId
    bindActiveTurn(sessionId, follow.turnId!)
    activeStreamTerminal = false
    activeStreamAbort = subscribeTurn(Number(sessionId), follow.turnId!, streamHandlers(follow, options))
  }

  type FollowTurnOptions = { follow?: TurnFollow; streamId?: number; recoveryAttempt?: number }

  /** 订阅一个已知状态的回合：queued、running 跟随执行，其余只补一次终态快照。 */
  function followTurn(id: string, turnId: string, status: string, options: FollowTurnOptions = {}) {
    noteTurnStatus(turnId, status)
    const live = LIVE_TURN_STATUSES.has(status)
    const follow: TurnFollow = options.follow ?? {
      kind: 'subscribe', sessionId: id, turnId, ai: null, inputId: null, inputSettled: true,
    }
    follow.turnId = turnId
    // 已结束轮次也恢复一次快照中的错误和执行图，但不阻止用户发送新消息。
    state.busy = live
    state.recovering = true
    // reducer 必须持有 reactive 代理，否则恢复后的增量不会触发界面更新。
    followContainer(follow)
    subscribeFollow(id, follow, {
      streamId: options.streamId ?? streamGeneration,
      recoveryAttempt: options.recoveryAttempt,
      completedSnapshot: !live,
    })
  }

  /** 刷新后通过 active-turn 找到最近的回合再订阅。 */
  async function recoverActiveTurn(id: string, options: FollowTurnOptions = {}): Promise<boolean> {
    if (!isBackendSession(id) || id !== state.activeSessionId) return false
    const generation = dataGeneration
    const streamId = options.streamId ?? streamGeneration
    if (streamId !== streamGeneration) return false
    const giveUp = async (refresh: boolean) => {
      if (!options.follow) return
      state.busy = false
      state.recovering = false
      restorePendingResolution()
      clearActiveTurn()
      pruneEmptyContainers()
      if (refresh) await refreshMessages(id)
    }
    let active
    try {
      active = await getActiveTurn(id)
    } catch {
      await giveUp(false)
      return false
    }
    if (generation !== dataGeneration || streamId !== streamGeneration || id !== state.activeSessionId) return false
    if (!active?.turn_id) {
      state.openTurn = null
      await giveUp(true)
      return false
    }
    followTurn(id, active.turn_id, active.status, { ...options, streamId })
    return true
  }

  /**
   * 停止或取消暂停点之后：断开当前流、对齐历史；同一事务建了后继回合（接手排队的发言）时直接订阅它，
   * 不再查 active-turn。
   */
  async function settleAfterStop(sessionId: string, successorTurnId: string | null) {
    activeStreamTerminal = true
    streamGeneration += 1
    activeStreamAbort?.()
    activeStreamAbort = null
    activeResolution = null
    activeFollow = null
    state.busy = false
    state.recovering = false
    clearActiveTurn()
    const generation = dataGeneration
    const streamId = streamGeneration
    await refreshMessages(sessionId)
    if (!successorTurnId) return
    if (generation !== dataGeneration || streamId !== streamGeneration || sessionId !== state.activeSessionId) return
    followTurn(sessionId, successorTurnId, 'queued', { streamId })
  }

  function finalizeStream(
    reducer: ReturnType<typeof createSseReducer>, follow: TurnFollow, error?: Error, refresh = true,
  ) {
    reducer.settleStreams()
    if (error) {
      followContainer(follow).blocks?.push({
        kind: 'tool', tag: 'ERROR', fn: '连接错误', body: error.message, done: true,
      })
    }
    state.busy = false
    state.recovering = false
    activeStreamAbort = null
    if (activeFollow === follow) activeFollow = null
    clearActiveTurn()
    activeResolution = null
    pruneEmptyContainers()
    const sessionId = follow.sessionId ?? state.activeSessionId
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

  /** 发送失败可以原样重发（503 等）：结束排队，标出重发入口。 */
  function markRetryable(follow: TurnFollow, payload?: SendMessageRequest) {
    const message = findMessage(follow.userMessageId)
    if (!message || !payload) return
    retryPayloads.set(message.id, payload)
    if (message.queued) {
      removeMessage(message.id)
      message.queued = false
      message.queuedTurnId = null
      insertMessage(message, queuedTailIndex())
    }
    message.retryable = true
  }

  /**
   * 为一次跟随构造 SSE 回调。去重按「当前跟随的 turn_id + sequence」；当前回合从 run_started、
   * run_snapshot、input_queued、run_switched 记住（主线与子运行事件都不带 turn_id）。
   * 读流失败（断线、stream_error）时用订阅接口续上，先收 run_snapshot 再续播。
   */
  function streamHandlers(follow: TurnFollow, options: StreamOptions = {}): SseHandlers {
    const reducer = buildReducer(follow, options.configuredAgentId, options.configuredWorkflowId, options.configuredTeamId)
    const cursor = createStreamCursor(follow.turnId)
    // lead 调 SendMessage / TeamSpawn / TeamCreate 后成员和消息会变，结果到达时刷新团队视图。
    const teamToolIds = new Set<string>()
    const generation = dataGeneration
    const streamId = options.streamId ?? streamGeneration
    let terminalSeen = false
    /** 读到 run_end 时本次发言还没被认领：等紧跟的 run_switched，流关闭时再收尾。 */
    let awaitingSwitch = false
    /** 已交给新的订阅续上，这条流的后续回调一律忽略。 */
    let retired = false
    let recoveryStarted = false
    let recoveryAttempt = options.recoveryAttempt ?? 0
    activeFollow = follow
    const current = () => !retired && generation === dataGeneration && streamId === streamGeneration
    const trackTeamTool = (ev: SseEvent) => {
      // 子运行的帧（subagent_event）不参与团队工具跟踪。
      if (ev.type === 'subagent_event' || !ev.tool) return
      if (ev.type === 'tool_use' && TEAM_TOOL_NAMES.has(ev.tool.name)) teamToolIds.add(ev.tool.id)
      if (ev.type === 'tool_result' && (TEAM_TOOL_NAMES.has(ev.tool.name) || teamToolIds.has(ev.tool.id))) {
        teamToolIds.delete(ev.tool.id)
        teamRuntime.scheduleRefresh()
      }
    }
    const finish = (error?: Error, refresh = true) => {
      terminalSeen = true
      finalizeStream(reducer, follow, error, refresh)
    }
    const finishCompletedSnapshot = (error?: Error) => {
      finish(error, false)
    }
    const recover = (error?: Error) => {
      if (!current() || recoveryStarted || terminalSeen) return
      reducer.settleStreams()
      const sessionId = follow.sessionId ?? activeStreamSessionId ?? state.activeSessionId
      // 新会话的首条发言也能重发（幂等范围是当前用户），不需要先知道会话 ID。
      const reopen = follow.kind === 'send' ? options.reopen : undefined
      if (!reopen && !isBackendSession(sessionId)) {
        finish(error ?? new Error('连接已关闭，请重新发送消息'))
        return
      }
      recoveryAttempt += 1
      if (recoveryAttempt > 3) {
        finish(error ?? new Error('执行流连接中断，请刷新会话重试'))
        return
      }
      recoveryStarted = true
      state.recovering = true
      const resume = async () => {
        if (recoveryAttempt > 1) {
          await new Promise((resolve) => setTimeout(resolve, 300 * (2 ** (recoveryAttempt - 2))))
        }
        if (!current()) return
        retired = true
        if (reopen) {
          // 发言接口：用同一 client_input_id 原样重发，不会再入队。起始发言拿到原回合的订阅流；
          // 排队中或已认领的从 input_queued 开始按这条发言跟随，越过回合边界时照样有 run_switched。
          activeStreamAbort = reopen(streamHandlers(follow, { ...options, streamId, recoveryAttempt }))
        } else if (follow.turnId) {
          // 已知回合直接订阅它；还不知道回合时问 active-turn。
          subscribeFollow(sessionId, follow, { streamId, recoveryAttempt })
        } else {
          await recoverActiveTurn(sessionId, { follow, streamId, recoveryAttempt })
        }
      }
      void resume().finally(() => { recoveryStarted = false })
    }

    const onInputQueued = (ev: SseEvent) => {
      const turnId = ev.turn_id!
      follow.turnId = turnId
      follow.inputId = ev.input_id ?? null
      follow.inputSettled = false
      bindActiveTurn(follow.sessionId ?? state.activeSessionId, turnId)
      noteTurnStatus(turnId, state.openTurn?.turnId === turnId ? state.openTurn.status : 'running')
      // 会话已有活跃回合，发言注入它：显示为排队中，回复仍接在该回合里。
      // 重发拿到的流同样以 input_queued 开头，已经认领的发言不再挪回排队中。
      const user = findMessage(follow.userMessageId)
      if (user && user.messageId == null) {
        if (!user.queued) {
          removeMessage(user.id)
          user.queued = true
          state.messages.push(user)
        }
        user.queuedTurnId = turnId
        user.inputIds = follow.inputId != null ? [follow.inputId] : user.inputIds
      }
      dropEmptyContainer(follow)
      const last = [...state.messages].reverse().find((message) => message.role === 'ai' && message.turnId === turnId)
      follow.ai = last ?? null
    }

    const onRunSwitched = (ev: SseEvent) => {
      const turnId = ev.turn_id!
      awaitingSwitch = false
      follow.inputSettled = true
      reducer.reset()
      // 发言改由后继回合处理：它就是后继回合的起始发言，接在前一回合之后。
      const inputId = ev.input_id ?? follow.inputId
      const user = state.messages.find((message) => message.role === 'user' && inputId != null && message.inputIds?.includes(inputId))
        ?? findMessage(follow.userMessageId)
      dropEmptyContainer(follow)
      if (user) {
        removeMessage(user.id)
        user.queued = false
        user.queuedTurnId = null
        user.turnId = turnId
        user.streamOffset = null
        insertMessage(user, turnInsertIndex(turnId))
      }
      follow.turnId = turnId
      bindActiveTurn(follow.sessionId ?? state.activeSessionId, turnId)
      noteTurnStatus(turnId, 'queued')
      state.busy = true
      // 新回合：右栏子代理与执行图按回合重置，任务由随后的 task_snapshot 覆盖。
      state.agents.splice(0)
      state.selectedAgentId = null
      state.workflowProgress = emptyWorkflowProgress()
      followContainer(follow)
    }

    /**
     * 本次发言是这个回合的起始发言：新回合的 run_started 就是这次请求的响应，按 turn_id 对上；
     * 重发拿到原回合的订阅流时没有 input_queued，第一帧 run_snapshot 的 turn_id 就是它的回合。
     * 收到过 input_queued 的发言是注入别的回合的，不在这里处理。
     */
    const adoptStartMessage = (turnId: string) => {
      const user = findMessage(follow.userMessageId)
      if (!user || user.turnId || follow.inputId != null) return
      if (user.queued) {
        // 预判会排队、实际开了新回合时在这里纠正。
        dropEmptyContainer(follow)
        removeMessage(user.id)
        user.queued = false
        user.queuedTurnId = null
        user.turnId = turnId
        insertMessage(user, queuedTailIndex())
      } else {
        user.turnId = turnId
      }
    }

    const onRunStarted = (ev: SseEvent, eventSessionId: string | null) => {
      const turnId = ev.turn_id!
      if (eventSessionId) {
        follow.sessionId = eventSessionId
        if (state.activeSessionId !== eventSessionId && !isBackendSession(state.activeSessionId)) {
          reducer.handle({
            type: 'session_ready', sequence: ev.sequence, session_id: Number(eventSessionId),
            turn_id: turnId, data: { session_id: Number(eventSessionId) },
          })
        }
      }
      follow.turnId = turnId
      bindActiveTurn(follow.sessionId ?? state.activeSessionId, turnId)
      noteTurnStatus(turnId, 'running')
      state.recovering = false
      state.busy = true
      const user = findMessage(follow.userMessageId)
      if (user) {
        adoptStartMessage(turnId)
      } else {
        // 订阅接口跟随的新回合：起始发言如果还显示为排队中（刷新时还没被认领），换成正式发言。
        const shown = state.messages.some((message) => message.turnId === turnId && !(isLiveContainer(message) && !message.blocks?.length))
        const start = shown ? undefined : state.messages.find((message) => message.queued && message.queuedTurnId === turnId)
        if (start) {
          dropEmptyContainer(follow)
          removeMessage(start.id)
          start.queued = false
          start.queuedTurnId = null
          start.turnId = turnId
          insertMessage(start, queuedTailIndex())
        }
      }
      const container = findMessage(follow.ai?.id)
      if (container && !container.turnId) container.turnId = turnId
      followContainer(follow)
    }

    const onSnapshot = (ev: SseEvent, eventSessionId: string | null) => {
      const turnId = ev.turn_id ?? follow.turnId
      if (!turnId) return
      // 后继回合还没开始执行时快照是空状态、state.turn_id 为 null，以帧顶层的 turn_id 为准。
      follow.turnId = turnId
      bindActiveTurn(eventSessionId ?? follow.sessionId ?? state.activeSessionId, turnId)
      const snapshot = snapshotRecord(ev.state) ?? {}
      const status = typeof snapshot.status === 'string' ? snapshot.status : null
      if (status) noteTurnStatus(turnId, status)
      else if (!options.completedSnapshot && !state.openTurn) noteTurnStatus(turnId, 'queued')
      state.busy = status === 'running' || status === 'queued' || (status == null && !options.completedSnapshot)
      // 新会话首条发言重发时还不知道会话 ID，从快照里取。
      const snapshotSessionId = typeof snapshot.session_id === 'number' ? String(snapshot.session_id) : null
      const sessionId = eventSessionId ?? follow.sessionId ?? snapshotSessionId ?? state.activeSessionId
      if (follow.kind === 'send' && !follow.sessionId && snapshotSessionId && !isBackendSession(state.activeSessionId)) {
        reducer.handle({ type: 'session_ready', sequence: 0, session_id: Number(snapshotSessionId), data: { session_id: Number(snapshotSessionId) } })
      }
      adoptStartMessage(turnId)
      // 发送时建的占位回复还没归属回合，归到这个回合，由快照一并重建。
      const container = findMessage(follow.ai?.id)
      if (container && !container.turnId && isLiveContainer(container)) container.turnId = turnId
      const numericSessionId = Number(sessionId)
      if (Number.isFinite(numericSessionId)) hydrateRunSnapshot(snapshot, reducer, follow, numericSessionId)
      state.recovering = false
    }

    const onRunEnd = (ev: SseEvent) => {
      const turnId = ev.turn_id ?? follow.turnId
      const status = typeof ev.status === 'string' ? ev.status : null
      // 执行到此结束：还没收到结束帧的子运行一律收口。
      reducer.interruptAgents()
      if (turnId) noteTurnStatus(turnId, status)
      if (status === 'needs_attention') reducer.markAttention()
      if (ev.cancelled && turnId) cancelTurnInteractions(turnId)
      teamRuntime.scheduleRefresh()
      if (follow.inputId != null && !follow.inputSettled && status !== 'awaiting_interaction') {
        // 发言没被这个回合认领，紧跟的 run_switched 会换到后继回合；流关闭时再收尾。
        awaitingSwitch = true
        reducer.settleStreams()
        state.busy = false
        return
      }
      terminalSeen = true
      activeStreamTerminal = true
      if (options.completedSnapshot) finishCompletedSnapshot()
      else finish()
    }

    return {
      onEvent: (ev) => {
        if (!current() || terminalSeen) return
        recoveryAttempt = 0
        const rawSessionId = ev.session_id ?? ev.data?.session_id
        const eventSessionId = rawSessionId != null ? String(rawSessionId) : null
        if (follow.sessionId && eventSessionId && eventSessionId !== follow.sessionId) return
        if (ev.type === 'stream_error') {
          recover(new Error(ev.message || '事件流读取失败，请通过订阅接口重新连接'))
          return
        }
        // 不属于当前跟随回合的帧丢掉；这几类帧会改跟随的回合。
        const eventTurnId = ev.turn_id ?? (ev.type === 'input_claimed' ? ev.data?.turn_id : undefined)
        const adopts = ev.type === 'run_snapshot' || ev.type === 'run_switched' || ev.type === 'input_queued'
          || (ev.type === 'run_started' && !follow.turnId)
        if (!adopts && eventTurnId && follow.turnId && eventTurnId !== follow.turnId) return
        if (!cursor.accept(ev)) return

        switch (ev.type) {
          case 'input_queued':
            if (ev.turn_id) onInputQueued(ev)
            return
          case 'run_switched':
            if (ev.turn_id) onRunSwitched(ev)
            return
          case 'run_started':
            if (ev.turn_id) onRunStarted(ev, eventSessionId)
            return
          case 'run_resumed':
            // 执行中断后同一回合续跑：丢掉已显示、没落库的半截内容，再接着渲染续跑的产出。
            reducer.fold(cursor.runStartedAt ?? ev.sequence ?? 0, ev.watermark ?? 0, ev.sub_run_watermarks ?? {})
            if (follow.turnId) noteTurnStatus(follow.turnId, 'running')
            state.busy = true
            state.recovering = false
            return
          case 'run_snapshot':
            onSnapshot(ev, eventSessionId)
            return
          case 'input_claimed':
            claimLiveInput(follow, ev)
            return
          case 'run_end':
            onRunEnd(ev)
            return
        }
        if (ev.type === 'tool_sources') {
          const sessionId = eventSessionId ?? follow.sessionId
          if (follow.turnId && sessionId && ev.data?.faults?.length) rememberToolSources(sessionId, follow.turnId, ev.data.faults)
        }
        // 停掉等待审批的回合：流里依次是 session_ready、turn_end(user_cancelled)、run_end，待处理的交互卡收尾。
        // 只有主线会发 turn_end，子运行的结束帧在 subagent_event 里。
        if (ev.type === 'turn_end' && ev.stop_reason === 'user_cancelled') {
          cancelTurnInteractions(follow.turnId)
        }
        trackTeamTool(ev)
        reducer.handle(ev)
        // 会话状态由最近一轮推算，续跑或停止后会再收到一次 session_ready，按覆盖处理。
        if (ev.type === 'session_ready' && ev.data?.status) {
          const session = state.sessions.find((item) => item.id === String(ev.data!.session_id))
          if (session) session.status = ev.data.status
        }
      },
      onError: (error) => {
        if (!current() || activeStreamTerminal || terminalSeen) return
        if (options.completedSnapshot) {
          finishCompletedSnapshot(error)
          return
        }
        if (error instanceof SseOpenError) {
          // 建流被拒（4xx、503 等）：不重放提交，直接展示后端原因。
          const handled = options.onRejected?.(error) === true
          if (!handled) restorePendingResolution()
          if (error.status === 503) markRetryable(follow, options.payload)
          finish(handled ? undefined : error, false)
          // 发言被拒时原来跟随的回合还在执行，重新接上它。
          const sessionId = follow.sessionId
          if (sessionId && isBackendSession(sessionId)) void resyncOpenTurn(sessionId, null)
          return
        }
        recover(error)
      },
      onDone: () => {
        if (!current() || activeStreamTerminal || terminalSeen) return
        if (awaitingSwitch) finish()
        else if (options.completedSnapshot) finishCompletedSnapshot()
        else recover()
      },
    }
  }

  /** 被打断的回复不会再收到 block_stop，收掉它的推理计时和流式光标，等历史刷新后替换。 */
  function settleMessage(message: ChatMessage | undefined) {
    for (const block of message?.blocks ?? []) {
      if (block.kind === 'think') block.done = true
      else if (block.kind === 'answer') block.streaming = false
    }
  }

  /**
   * 派发一次发言：POST /api/sessions/messages，消费 SSE 流增量更新对话与右栏。
   * 回合执行中、排队中、等待审批时都允许发送：发言注入当前回合，先显示为排队中，
   * 回合认领后换成正式发言；越过最后一个轮次边界时由后继回合处理（run_switched）。
   * 每条发言带一个新生成的 client_input_id，之后按它对上排队、认领和列表里的这条发言。
   */
  function dispatch(
    text: string,
    options?: { agentId?: number | null; workflowId?: number | null; teamId?: number | null },
  ): boolean {
    const content = text.trim()
    if (!canWriteSession() || state.chatSelectionSaving || !content) return false
    const sessionId = isBackendSession(state.activeSessionId) ? Number(state.activeSessionId) : undefined
    const localSession = sessionId === undefined
      ? state.sessions.find((session) => session.id === state.activeSessionId)
      : undefined
    // 新会话目标三选一（后端互斥）：Team 优先，其次 Workflow，最后 Agent。
    const requestedTeamId = options?.teamId !== undefined
      ? options.teamId
      : localSession?.teamDefinitionId ?? state.newSessionTeamId
    const configuredTeamId = sessionId === undefined ? requestedTeamId ?? undefined : undefined
    const requestedWorkflowId = options?.workflowId !== undefined
      ? options.workflowId
      : localSession?.workflowId ?? state.newSessionWorkflowId
    const configuredWorkflowId = sessionId === undefined && configuredTeamId == null
      ? requestedWorkflowId ?? undefined
      : undefined
    const requestedAgentId = options?.agentId !== undefined
      ? options.agentId
      : localSession?.agentId ?? state.newSessionAgentId
    const configuredAgentId = sessionId === undefined && configuredWorkflowId == null && configuredTeamId == null
      ? requestedAgentId ?? undefined
      : undefined
    if (localSession) {
      localSession.agentId = configuredAgentId ?? null
      localSession.workflowId = configuredWorkflowId ?? null
      localSession.teamDefinitionId = configuredTeamId ?? null
    }

    return submitMessage({
      session_id: sessionId,
      ...(configuredAgentId == null ? {} : { agent_id: configuredAgentId }),
      ...(configuredWorkflowId == null ? {} : { workflow_id: configuredWorkflowId }),
      ...(configuredTeamId == null ? {} : { team_definition_id: configuredTeamId }),
      content,
      ...activeChatSelection(),
      client_input_id: createClientInputId(),
    })
  }

  /**
   * 提交一条发言：上屏、建跟随、开流；dispatch 与 503 后的原样重发共用。
   * 新发言接管跟随：断开当前流（后端照常执行），发言接口的流从快照接着跟随。
   */
  function submitMessage(payload: SendMessageRequest): boolean {
    const backend = isBackendSession(state.activeSessionId)
    const injecting = backend && hasOpenTurn()
    if (injecting) {
      for (const message of state.messages) {
        if (message.role === 'ai' && message.turnId && message.turnId === (state.openTurn?.turnId ?? state.activeTurnId)) settleMessage(message)
      }
    }
    const streamId = ++streamGeneration
    activeStreamAbort?.()
    activeStreamAbort = null
    activeStreamSessionId = backend ? state.activeSessionId : null
    activeStreamTurnId = null
    activeStreamTerminal = false
    activeResolution = null
    state.recovering = false

    // 用户消息上屏；注入正在进行的回合时先显示为排队中，固定在末尾。
    const user = insertMessage(
      {
        id: uid('m'), role: 'user', time: now(), text: payload.content,
        ...(payload.client_input_id ? { clientInputIds: [payload.client_input_id] } : {}),
        ...(injecting ? { queued: true } : {}),
      },
      state.messages.length,
    )
    const follow: TurnFollow = {
      kind: 'send', sessionId: backend ? state.activeSessionId : null, turnId: null, ai: null,
      userMessageId: user.id, inputId: null, inputSettled: false,
      ...(payload.client_input_id ? { clientInputId: payload.client_input_id } : {}),
    }

    if (!injecting) {
      state.activeTurnId = null
      state.activeTurnSessionId = null
      state.busy = true
      // 重置本轮子代理与任务；队友属于会话，不随回合清空。
      state.agents = []
      state.tasks = []
      // Workflow 进度图按轮重置:上一轮的节点状态不能残留到本轮
      state.workflowProgress = emptyWorkflowProgress()
      state.selectedAgentId = null
      // 新建空 AI 消息,作为本轮 orchestrator 内容的容器(也是执行中的占位)
      followContainer(follow)
    }

    activeStreamAbort = sendMessage(payload, streamHandlers(follow, {
      streamId,
      configuredAgentId: payload.agent_id ?? undefined,
      configuredWorkflowId: payload.workflow_id ?? undefined,
      configuredTeamId: payload.team_definition_id ?? undefined,
      payload,
      // 带了 client_input_id 才能幂等重发；没带时断线照旧走订阅接口。
      ...(payload.client_input_id ? { reopen: (handlers: SseHandlers) => sendMessage(payload, handlers) } : {}),
    }))
    return true
  }

  /** 原样重发一条因服务暂时不可用（503）而失败的发言：请求体不变（同一 client_input_id），去掉失败的气泡和它的错误提示。 */
  function resendMessage(messageId: string): boolean {
    const message = findMessage(messageId)
    const payload = retryPayloads.get(messageId)
    if (!message?.retryable || !payload || !canWriteSession() || state.chatSelectionSaving) return false
    const index = state.messages.indexOf(message)
    const next = state.messages[index + 1]
    if (next && isLiveContainer(next) && !next.turnId && next.blocks?.every((block) => block.kind === 'tool' && block.tag === 'ERROR')) {
      removeMessage(next.id)
    }
    removeMessage(message.id)
    retryPayloads.delete(messageId)
    return submitMessage(payload)
  }

  /**
   * 提交人工交互决定：后端只记下决定、立即返回 SSE，流从决定之前的位置跟随下一次执行，
   * 回复接在交互卡所在回合的末尾。交互已被停止或失效时返回 409，卡片直接展示后端原因。
   */
  function startResolution(requestId: string, sessionId: number, open: (handlers: SseHandlers) => () => void) {
    const turnId = interactionTurnId(requestId)
    const streamId = ++streamGeneration
    activeStreamAbort?.()
    activeStreamAbort = null
    activeStreamSessionId = String(sessionId)
    activeStreamTurnId = null
    activeStreamTerminal = false
    activeResolution = null
    state.busy = true
    const follow: TurnFollow = {
      kind: 'resolve', sessionId: String(sessionId), turnId, ai: null, inputId: null, inputSettled: true,
    }
    if (turnId) {
      bindActiveTurn(String(sessionId), turnId)
      noteTurnStatus(turnId, 'queued')
    }
    const ai = followContainer(follow)
    activeResolution = { requestId, syntheticMessageId: ai.id }
    activeStreamAbort = open(streamHandlers(follow, {
      streamId,
      onRejected: (error) => {
        if (error.status !== 409) return false
        activeResolution = null
        for (const message of state.messages) {
          for (const block of message.blocks ?? []) {
            if (block.kind === 'interaction' && block.interaction.request_id === requestId) {
              block.status = 'cancelled'
              block.responseLabel = error.message
            } else if (block.kind === 'approval' && block.requestId === requestId) {
              block.status = 'deny'
            }
          }
        }
        if (turnId) noteTurnStatus(turnId, null)
        return true
      },
    }))
  }

  /** 响应通用人工交互，用决定接口的流跟随下一次执行。 */
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
    startResolution(requestId, sessionId, (handlers) => respondInteraction(sessionId, requestId, payload, handlers))
  }

  /** 兼容旧 permission_request 卡片，并统一改走新版 interaction 决定接口。 */
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
    const sessionId = /^\d+$/.test(state.activeSessionId) ? Number(state.activeSessionId) : undefined
    if (sessionId === undefined) return
    legacy.status = decision
    startResolution(requestId, sessionId, (handlers) => respondInteraction(
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
      handlers,
    ))
  }

  function errorText(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback
  }

  /**
   * 取消交互所在暂停点，不再恢复本轮执行。交互已经决定时返回 409，原因直接展示。
   * 等待期间有排队的发言时响应带上后继回合（successor_turn_id），随后跟随它。
   */
  async function cancelInteractionAction(requestId: string, suspensionId: string): Promise<ConsoleActionResult> {
    const sessionId = /^\d+$/.test(state.activeSessionId) ? Number(state.activeSessionId) : undefined
    if (!canWriteSession() || sessionId === undefined || state.busy) return { ok: false }
    const turnId = interactionTurnId(requestId)
    let result
    try {
      result = await cancelInteraction(sessionId, suspensionId)
    } catch (error) {
      return { ok: false, message: errorText(error, '取消失败') }
    }
    for (const message of state.messages) {
      for (const block of message.blocks ?? []) {
        if (block.kind === 'interaction' && block.interaction.request_id === requestId) {
          block.status = 'cancelled'
          block.responseLabel = '已取消本次运行'
        }
      }
    }
    if (turnId) noteTurnStatus(turnId, null)
    // 等待期间有排队的发言时，同一事务建了后继回合，直接订阅它。
    if (result.successor_turn_id) await settleAfterStop(String(sessionId), result.successor_turn_id)
    return { ok: true }
  }

  /**
   * 停止回合：任何没结束的回合都能停（执行中、queued、执行中断等待续跑、等待审批）。
   * 只取消这个回合，不清空排队的发言；有排队发言时响应的 successor_turn_id 是接手它们的后继回合：
   * 发言接口那条流会自己 run_switched 过去，其他情况对齐历史后直接订阅它。
   */
  async function cancelActiveTurn(): Promise<ConsoleActionResult> {
    if (!canWriteSession() || !isBackendSession(state.activeSessionId)) return { ok: false }
    const streamId = streamGeneration
    const activeSessionId = state.activeSessionId
    const sessionId = Number(activeStreamSessionId ?? state.activeSessionId)
    if (!Number.isFinite(sessionId)) return { ok: false }

    let turnId = activeStreamTurnId ?? state.activeTurnId ?? state.openTurn?.turnId ?? null
    if (!turnId) {
      try {
        const active = await getActiveTurn(sessionId)
        if (!active?.turn_id || !OPEN_TURN_STATUSES.has(active.status)) return { ok: false }
        turnId = active.turn_id
      } catch (error) {
        return { ok: false, message: errorText(error, '停止失败') }
      }
    }

    let result
    try {
      result = await cancelTurn(sessionId, turnId)
    } catch (error) {
      // 409：回合已经结束（本页记的状态过时了），对齐一次。
      if (error instanceof ApiError && error.status === 409) {
        noteTurnStatus(turnId, null)
        void resyncOpenTurn(String(sessionId), turnId)
      }
      return { ok: false, message: errorText(error, '停止失败') }
    }

    noteTurnStatus(turnId, null)
    cancelTurnInteractions(turnId)
    if (streamId !== streamGeneration || activeSessionId !== state.activeSessionId) return { ok: true }
    const successor = result.successor_turn_id ?? null
    const follow = activeFollow
    // 发言接口那条流正跟着还没被认领的发言，它会自己 run_switched 到后继回合。
    if (successor && follow?.kind === 'send' && follow.inputId != null && !follow.inputSettled) return { ok: true }
    await settleAfterStop(String(sessionId), successor)
    return { ok: true }
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
    setNewSessionTeam,
    setWorkbenchMode,
    sessionWorkflowId,
    sessionTeamId,
    hasOpenTurn,
    setSearch,
    renameSession: renameSessionAction,
    deleteSessions: deleteSessionsAction,
    archiveSession: archiveSessionAction,
    shareSession: shareSessionAction,
    selectAgent,
    toggleTheme,
    dispatch,
    resendMessage,
    respondInteraction: respondInteractionAction,
    respondApproval: respondApprovalAction,
    cancelInteraction: cancelInteractionAction,
    cancelActiveTurn,
    stopExecution: cancelActiveTurn,
    seedConversation,
  }
})
