import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { getWorkbenchApp } from '../constants/app-registry'
import { SESSIONS } from '../constants/seed'
import {
  archiveSession,
  cancelInteraction,
  deleteSession,
  deleteSessionList,
  getPendingInteraction,
  getSessionList,
  getSessionMessageList,
  respondInteraction,
  sendMessage,
  shareSession,
  updateSession,
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
  GraphNodeState,
  MsgContentBlock,
  Session,
  SessionMessageResponse,
  SessionResponse,
  SessionVisibility,
  SseEvent,
  SseInteraction,
  SubAgent,
  Task,
  TaskResponse,
  TaskState,
  WorkbenchMode,
} from '../interfaces/console/model'
import { createSseReducer, fmtToolCall } from '@/utils/sse-reducer'
import { usePermissionsStore } from './permissions'
import { useSkillsStore } from './skills'
import { useMemoriesStore } from './memories'

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
function mapSession(s: SessionResponse): Session {
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
    agentId: s.agent_id ?? null,
    orchestrationPlanId: s.orchestration_plan_id ?? null,
    modelName: s.model_name ?? null,
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

function normalizeBlock(value: unknown): MsgContentBlock | null {
  if (typeof value === 'string') return value ? { type: 'text', text: value } : null
  if (!isRecord(value) || typeof value.type !== 'string') return null

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
  newSessionAgentId: number | null
  /** 新会话草稿选中的编排方案 ID;与 newSessionAgentId 互斥 */
  newSessionPlanId: number | null
  tasks: Task[]
  /** 编排执行图节点状态,按去掉 #N 轮次的裸路径归并;表中无该键即 pending */
  graphNodes: Record<string, GraphNodeState>
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
  const memoriesStore = useMemoriesStore()
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
    // seed 会话不含编排方案,初始视图只需区分是否带应用
    workbenchMode: SESSIONS[0].appId ? 'split' : 'chat',
    search: '',
    messages: [],
    agents: [],
    selectedAgentId: null,
    newSessionAgentId: null,
    newSessionPlanId: null,
    tasks: [],
    graphNodes: {},
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

  // ===== 后端接入:会话列表 =====
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
      state.messages = []
      state.agents = []
      state.tasks = []
      state.selectedAgentId = null
      state.newSessionAgentId = null
      state.newSessionPlanId = null
      // 先清空草稿选择,再按会话绑定关系计算默认视图,避免上个草稿的方案泄漏
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

  /** 会话绑定的编排方案 ID;本地草稿会话回退到 newSessionPlanId。 */
  function sessionPlanId(id: string): number | null {
    const session = state.sessions.find((item) => item.id === id)
    if (session?.orchestrationPlanId != null) return session.orchestrationPlanId
    return isBackendSession(id) ? null : state.newSessionPlanId
  }

  /** 会话切换后的默认工作台模式:打开应用优先分屏,绑定编排方案落到执行图。 */
  function defaultWorkbenchMode(sessionId: string): WorkbenchMode {
    if (getWorkbenchApp(state.activeAppId)) return 'split'
    return sessionPlanId(sessionId) != null ? 'graph' : 'chat'
  }

  /**
   * 加载某会话的历史消息和待处理交互。
   * 两个请求独立降级：交互查询失败不得清掉已经成功加载的消息历史。
   */
  async function loadMessages(id: string) {
    const generation = dataGeneration
    if (!isBackendSession(id)) {
      if (id === state.activeSessionId) state.messages = []
      return
    }
    const [historyResult, pendingResult] = await Promise.allSettled([
      getSessionMessageList(id),
      getPendingInteraction(id),
    ])
    if (generation !== dataGeneration || id !== state.activeSessionId) return

    if (historyResult.status === 'rejected') {
      state.messages = []
      state.health = 'error'
      return
    }

    state.messages = mapMessages(historyResult.value)
    if (pendingResult.status === 'rejected') {
      state.health = 'degraded'
      return
    }

    const pending = pendingResult.value
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
    state.health = 'ok'
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
    // 全量重置后无会话亦无方案,对话视图是唯一合法模式
    state.workbenchMode = 'chat'
    state.search = ''
    state.messages = []
    state.agents = []
    state.selectedAgentId = null
    state.newSessionAgentId = null
    state.newSessionPlanId = null
    state.tasks = []
    state.graphNodes = {}
    state.busy = false
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
    state.activeSessionId = id
    const session = state.sessions.find((item) => item.id === id)
    state.activeAppId = session?.appId ?? null
    state.agents = []
    state.tasks = []
    state.selectedAgentId = null
    state.newSessionAgentId = null
    state.newSessionPlanId = null
    state.workbenchMode = defaultWorkbenchMode(id)
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
    state.newSessionAgentId = null
    state.newSessionPlanId = null
  }

  function setNewSessionAgent(agentId: number | null) {
    if (isBackendSession(state.activeSessionId)) return
    state.newSessionAgentId = agentId
    // 后端约束 agent 与编排方案互斥:选中 Agent 即放弃方案草稿
    if (agentId != null) setNewSessionPlanDraft(null)
    const localSession = state.sessions.find((session) => session.id === state.activeSessionId)
    if (localSession) localSession.agentId = agentId
  }

  /** 仅更新方案草稿及本地会话标记,不处理与 Agent 的互斥(由调用方决定)。 */
  function setNewSessionPlanDraft(planId: number | null) {
    state.newSessionPlanId = planId
    const localSession = state.sessions.find((session) => session.id === state.activeSessionId)
    if (localSession) localSession.orchestrationPlanId = planId
  }

  /** 为新会话草稿绑定编排方案;绑定后默认切到执行图视图。 */
  function setNewSessionPlan(planId: number | null) {
    if (isBackendSession(state.activeSessionId)) return
    setNewSessionPlanDraft(planId)
    // 与 Agent 互斥:选中方案即回退到平台默认 Agent
    if (planId != null) {
      state.newSessionAgentId = null
      const localSession = state.sessions.find((session) => session.id === state.activeSessionId)
      if (localSession) localSession.agentId = null
    }
    if (!getWorkbenchApp(state.activeAppId)) {
      state.workbenchMode = planId != null ? 'graph' : 'chat'
    }
  }
  function setSearch(v: string) {
    state.search = v
  }

  /** 从左侧应用节点进入运行工作台；优先恢复该应用最近一条会话。 */
  function openApp(appId: string) {
    state.activeAppId = appId
    // 打开应用是显式动作,即使会话绑了编排方案也切到分屏
    state.workbenchMode = 'split'
    const appSession = state.sessions.find((session) => session.appId === appId)
    if (!appSession || appSession.id !== state.activeSessionId) {
      state.activeSessionId = appSession?.id ?? ''
      state.messages = []
      state.agents = []
      state.tasks = []
      state.selectedAgentId = null
      state.newSessionAgentId = null
      state.newSessionPlanId = null
      if (appSession) void loadMessages(appSession.id)
    }
  }

  function setWorkbenchMode(mode: WorkbenchMode) {
    // 执行图只依赖会话绑定的编排方案,不要求打开应用
    if (mode === 'graph') {
      state.workbenchMode = sessionPlanId(state.activeSessionId) != null ? 'graph' : 'chat'
      return
    }
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
        state.newSessionAgentId = null
        state.newSessionPlanId = null
      }
    }
  }

  /** 归档后端会话并从当前列表移除。 */
  async function archiveSessionAction(id: string): Promise<boolean> {
    if (!isBackendSession(id)) return false
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
    if (!isBackendSession(id)) return false
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

  /** 把 node_start / node_end 归并进执行图状态。
   *  key 用去掉 #N 轮次的裸路径:loop 同一成员跨轮次是不同 path,但图上复用同一个节点框。
   *  并行模式下 start/end 不成对相邻到达(end 按各分支完成快慢返回),故按 path 建索引而非按序配对。 */
  function mergeNodeEvent(ev: SseEvent) {
    const node = ev.node
    if (!node?.path) return
    const key = node.path.replace(/#\d+/g, '')
    const detail = node.detail ?? {}
    const prev = state.graphNodes[key]
    const next: GraphNodeState = {
      ...prev,
      path: key,
      // node_start 无 status 字段;node_end 的 status 为节点终态
      status: ev.type === 'node_end' ? nodeEndStatus(node.status) : 'running',
    }
    // run_id 带 turn 前缀,前端推不出来,只能取自事件;点节点切右栏流靠它
    if (ev.actor?.run_id) next.runId = ev.actor.run_id
    // 轮次取自 detail(从 1 起),不从 path 的 #N 解析(那个从 0 起且在根节点段)
    if (typeof detail.iteration === 'number') next.iteration = detail.iteration
    if (typeof detail.max_iterations === 'number') next.maxIterations = detail.max_iterations
    // routing 命中的分支键,挂在被选中的叶子上;未命中分支无任何事件
    if (typeof detail.route === 'string') next.route = detail.route
    if (detail.root === true) next.root = true
    state.graphNodes[key] = next
  }

  /** node_end 的 status 收窄到图状态;缺失或未知值按失败处理,避免节点卡在运行中。 */
  function nodeEndStatus(status: string | undefined): GraphNodeState['status'] {
    if (status === 'completed' || status === 'suspended' || status === 'escalated') return status
    return 'failed'
  }

  /** 为一条 AI 消息构造 SSE 归约器(dispatch 与 respondApproval 共用)。 */
  function buildReducer(ai: ChatMessage, configuredAgentId?: number, configuredPlanId?: number) {
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
            // 绑定的编排方案随之丢失,执行图会在跑起来的瞬间消失。
            const latestPrompt = [...state.messages].reverse().find((message) => message.role === 'user')?.text?.trim()
            state.sessions.unshift({
              id: idStr,
              title: latestPrompt ? latestPrompt.slice(0, 28) : `新会话 ${now().slice(0, 5)}`,
              time: '刚刚',
              count: 0,
              appId: state.activeAppId ?? undefined,
              agentId: configuredAgentId ?? null,
              orchestrationPlanId: configuredPlanId ?? null,
            })
          }
          state.activeSessionId = idStr
        }
        // 会话已落库,方案改由会话自身承载;草稿字段必须清空,否则下一个新会话会继承它
        const promoted = state.sessions.find((s) => s.id === idStr)
        if (promoted) {
          if (configuredAgentId != null) promoted.agentId = configuredAgentId
          if (configuredPlanId != null) promoted.orchestrationPlanId = configuredPlanId
        }
        state.newSessionAgentId = null
        state.newSessionPlanId = null
      },
      // 任务全量快照:随 SSE 流实时到达,直接整体替换任务面板
      onTaskSnapshot: (tasks) => {
        state.tasks = tasks.filter((t) => t.status !== 'deleted').map(mapTask)
      },
      // 编排节点事件:归并到执行图状态,不建右栏面板(面板仍由叶子自身的流事件创建)
      onNodeEvent: (ev) => {
        mergeNodeEvent(ev)
      },
    })
  }

  /** 为一条 AI 消息构造 SSE 回调(错误块 + 收尾停流式;dispatch 与 respondApproval 共用)。 */
  function streamHandlers(
    ai: ChatMessage,
    configuredAgentId?: number,
    configuredPlanId?: number,
  ): SseHandlers {
    const reducer = buildReducer(ai, configuredAgentId, configuredPlanId)
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
  function dispatch(
    text: string,
    options?: { agentId?: number | null; planId?: number | null },
  ): boolean {
    const content = text.trim()
    if (state.busy || !content) return false
    state.busy = true

    // 用户消息上屏
    state.messages.push({ id: uid('m'), role: 'user', time: now(), text: content })

    // 重置本轮舰队与任务
    state.agents = []
    state.tasks = []
    // 执行图按轮重置:上一轮的节点状态不能残留到本轮
    state.graphNodes = {}
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
    // 后端约束:agent_id / orchestration_plan_id 仅开新会话可传且互斥;方案优先生效
    const requestedPlanId = options?.planId !== undefined
      ? options.planId
      : localSession?.orchestrationPlanId ?? state.newSessionPlanId
    const configuredPlanId = sessionId === undefined ? requestedPlanId ?? undefined : undefined
    const requestedAgentId = options?.agentId !== undefined
      ? options.agentId
      : localSession?.agentId ?? state.newSessionAgentId
    const configuredAgentId = sessionId === undefined && configuredPlanId == null
      ? requestedAgentId ?? undefined
      : undefined
    if (localSession) {
      localSession.agentId = configuredAgentId ?? null
      localSession.orchestrationPlanId = configuredPlanId ?? null
    }

    activeStreamAbort = sendMessage(
      {
        session_id: sessionId,
        ...(configuredAgentId == null ? {} : { agent_id: configuredAgentId }),
        ...(configuredPlanId == null ? {} : { orchestration_plan_id: configuredPlanId }),
        content,
      },
      streamHandlers(ai, configuredAgentId, configuredPlanId),
    )
    return true
  }

  /** 响应通用人工交互并用新 SSE 流承接恢复后的执行。 */
  function respondInteractionAction(
    requestId: string,
    payload: InteractionResolutionRequest,
    responseLabel: string,
  ) {
    if (state.busy) return
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

    state.busy = true
    // 恢复流承接到一条新 AI 消息(后端 resume 会重发 turn_start / tool_result / 后续文本)。
    state.messages.push({ id: uid('m'), role: 'ai', time: now(), blocks: [] })
    const ai = state.messages[state.messages.length - 1]

    activeStreamAbort = respondInteraction(sessionId, requestId, payload, streamHandlers(ai))
  }

  /** 兼容旧 permission_request 卡片，并统一改走新版 interaction 恢复端点。 */
  function respondApprovalAction(
    requestId: string,
    decision: ApprovalDecision,
    updatedInput?: Record<string, unknown>,
  ) {
    const legacy = state.messages
      .flatMap((message) => message.blocks ?? [])
      .find((block) => block.kind === 'approval' && block.requestId === requestId)
    if (!legacy || legacy.kind !== 'approval' || legacy.status !== 'pending') return
    legacy.status = decision
    const responseLabel = decision === 'deny'
      ? '已拒绝该工具调用'
      : decision === 'always_allow'
        ? '已允许并记住本会话规则'
        : '已允许本次执行'
    const sessionId = /^\d+$/.test(state.activeSessionId) ? Number(state.activeSessionId) : undefined
    if (sessionId === undefined || state.busy) return
    state.busy = true
    state.messages.push({ id: uid('m'), role: 'ai', time: now(), blocks: [] })
    const ai = state.messages[state.messages.length - 1]
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
      streamHandlers(ai),
    )
    void responseLabel
  }

  /** 取消交互所在暂停点，不再恢复本轮执行。 */
  async function cancelInteractionAction(requestId: string, suspensionId: string): Promise<boolean> {
    const sessionId = /^\d+$/.test(state.activeSessionId) ? Number(state.activeSessionId) : undefined
    if (sessionId === undefined || state.busy) return false
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
    loadSessions,
    resetConsole,
    reloadConsole,
    launchApp,
    selectSession,
    newSession,
    openApp,
    setNewSessionAgent,
    setNewSessionPlan,
    setWorkbenchMode,
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
    seedConversation,
  }
})
