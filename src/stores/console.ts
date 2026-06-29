import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { ChatBlock, ChatMessage, MainView, Session, SubAgent, Task, TaskState } from '../types'
import { SESSIONS } from '../data/seed'
import { fetchHealth, fetchMessages, fetchSessions, fetchTasks, sendMessage } from '../api/console'
import type { SessionMessageResponse, SessionResponse, TaskResponse } from '../api/types'
import { createSseReducer } from './sseReducer'

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
  return {
    id: String(s.id),
    title: s.title || '未命名会话',
    time: formatTime(s.last_active_at),
    count: 0,
  }
}

/** 后端历史消息 → 前端 ChatMessage。
 *  user:content 为纯文本;assistant:content 为内容块数组 → think/answer/tool。 */
function mapMessage(m: SessionMessageResponse): ChatMessage {
  const time = formatTime(m.created_at)
  if (m.role === 'user') {
    const text = typeof m.content === 'string' ? m.content : ''
    return { id: 'm-' + m.id, role: 'user', time, text }
  }
  // assistant / 其它:content 为块数组
  const blocks: ChatBlock[] = []
  const arr = Array.isArray(m.content) ? m.content : []
  for (const b of arr) {
    if (b.type === 'thinking' && b.thinking) {
      blocks.push({ kind: 'think', text: b.thinking, duration: '推理完成', collapsed: true })
    } else if (b.type === 'text' && b.text) {
      blocks.push({ kind: 'answer', text: b.text, streaming: false })
    } else if (b.type === 'tool_use') {
      const args = b.input ? JSON.stringify(b.input) : ''
      blocks.push({
        kind: 'tool',
        tag: b.name === 'Agent' || b.name === 'TeamSpawn' ? 'SPAWN' : 'TOOL',
        fn: `${b.name ?? 'tool'}(${args.length > 60 ? args.slice(0, 60) + '…' : args})`,
        body: '',
        done: true,
      })
    }
  }
  return { id: 'm-' + m.id, role: 'ai', time, blocks }
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
  return { id: String(t.id), name: t.subject || t.description || `任务 #${t.id}`, state: mapTaskState(t.status) }
}

// ===== 状态形状 =====
interface ConsoleState {
  view: MainView
  leftCollapsed: boolean
  rightCollapsed: boolean
  /** 后端健康状态:unknown=未探测/探测失败,其余为后端返回的 status(如 ok) */
  health: string
  sessionsLoading: boolean
  sessions: Session[]
  activeSessionId: string
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
  const state = reactive<ConsoleState>({
    view: 'chat',
    leftCollapsed: false,
    rightCollapsed: false,
    health: 'unknown',
    sessionsLoading: false,
    sessions: [...SESSIONS],
    activeSessionId: SESSIONS[0].id,
    search: '',
    messages: [],
    agents: [],
    selectedAgentId: null,
    tasks: [],
    busy: false,
    theme: 'dark',
  })

  // PLACEHOLDER_STORE
  // ===== 视图切换 =====
  function setView(v: MainView) {
    state.view = v
  }

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
    try {
      const h = await fetchHealth()
      state.health = h.status
    } catch {
      state.health = 'error'
    }
  }

  /** 拉取真实会话列表;成功返回 true。失败保留种子数据兜底并返回 false */
  async function loadSessions(): Promise<boolean> {
    state.sessionsLoading = true
    try {
      const list = await fetchSessions()
      if (list.length) {
        state.sessions = list.map(mapSession)
        // 默认选中第一条并加载其历史消息
        state.activeSessionId = state.sessions[0].id
        await loadMessages(state.activeSessionId)
      }
      return true
    } catch {
      // 后端不可用时静默保留种子数据,保证界面可用
      return false
    } finally {
      state.sessionsLoading = false
    }
  }

  /** 后端会话 id 为纯数字字符串;种子/本地新建会话 id 形如 sess-xxxx */
  function isBackendSession(id: string): boolean {
    return /^\d+$/.test(id)
  }

  /** 加载某会话的历史消息(仅后端会话);失败时清空消息不阻断 */
  async function loadMessages(id: string) {
    if (!isBackendSession(id)) {
      state.messages = []
      return
    }
    try {
      const list = await fetchMessages(id)
      state.messages = list.map(mapMessage)
    } catch {
      state.messages = []
    }
  }

  // ===== 左侧:会话 =====
  function selectSession(id: string) {
    state.activeSessionId = id
    state.view = 'chat'
    state.agents = []
    state.tasks = []
    state.selectedAgentId = null
    loadMessages(id)
  }
  function newSession() {
    const s: Session = {
      id: uid('sess'),
      title: '新会话 ' + now().slice(0, 5),
      time: '刚刚',
      count: 0,
    }
    state.sessions.unshift(s)
    state.activeSessionId = s.id
    state.messages = []
    state.agents = []
    state.tasks = []
    state.selectedAgentId = null
    state.view = 'chat'
  }
  function setSearch(v: string) {
    state.search = v
  }

  // ===== 右侧:子代理选择 =====
  function selectAgent(id: string) {
    state.selectedAgentId = id
  }

  // ===== 主题 =====
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', state.theme)
  }

  // ===== 编排引擎(真实 SSE) =====
  /** 从应用中心启动一个应用:切回对话视图,可选预填一段提示词并派发 */
  function launchApp(prompt?: string) {
    state.view = 'chat'
    if (prompt) dispatch(prompt)
  }

  /** 拉取当前会话的最新任务编排列表,重映射后整体写回 state.tasks。
   *  仅后端会话(数字 id)有任务;失败时静默不动旧数据,避免闪烁。 */
  async function refreshTasks(sessionId?: number | string) {
    const id = sessionId ?? state.activeSessionId
    if (!/^\d+$/.test(String(id))) return
    try {
      const list = await fetchTasks(id)
      state.tasks = list
        .filter((t) => t.status !== 'deleted')
        .map(mapTask)
    } catch {
      // 查询失败时保留现有任务,不打断流式过程
    }
  }

  /** 派发一次任务:POST /api/sessions/messages,消费 SSE 流增量更新对话与右栏 */
  function dispatch(text: string) {
    const content = text.trim()
    if (state.busy || !content) return
    state.busy = true
    state.view = 'chat'

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

    // 创建 SSE 归约器:把事件写进 ai.blocks 与 state.agents(均为 reactive 代理)
    const reducer = createSseReducer({
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
          }
          state.activeSessionId = idStr
        }
      },
      // TaskCreate/TaskUpdate 的工具结果到达时,拉一次最新任务列表刷新面板
      onTaskEvent: () => {
        void refreshTasks()
      },
    })

    const sessionId = /^\d+$/.test(state.activeSessionId)
      ? Number(state.activeSessionId)
      : undefined

    sendMessage(
      { session_id: sessionId, content },
      {
        onEvent: (ev) => reducer.handle(ev),
        onError: (err) => {
          ai.blocks!.push({
            kind: 'tool',
            tag: 'ERROR',
            fn: '连接错误',
            body: err.message,
            done: true,
          })
          state.busy = false
        },
        onDone: () => {
          // 收尾:未结束的回答块停止流式光标
          for (const b of ai.blocks!) {
            if (b.kind === 'answer') b.streaming = false
          }
          state.busy = false
        },
      },
    )
  }

  // PLACEHOLDER_STORE4
  /** 首屏种子对话 */
  function seedConversation() {
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
    setView,
    toggleLeft,
    toggleRight,
    loadHealth,
    loadSessions,
    launchApp,
    selectSession,
    newSession,
    setSearch,
    selectAgent,
    toggleTheme,
    dispatch,
    refreshTasks,
    seedConversation,
  }
})
