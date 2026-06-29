import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { ChatMessage, MainView, Session, SubAgent, Task } from '../types'
import { SESSIONS, SUBAGENT_TEMPLATES, SYNTHESIS_MARKDOWN } from '../data/seed'

// ===== 工具函数 =====
const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })
const uid = (p: string) => `${p}-${Math.random().toString(16).slice(2, 8)}`
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

let pidSeq = 1042

// ===== 状态形状 =====
interface ConsoleState {
  view: MainView
  leftCollapsed: boolean
  rightCollapsed: boolean
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

  // ===== 左侧:会话 =====
  function selectSession(id: string) {
    state.activeSessionId = id
    state.view = 'chat'
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

  // ===== 编排引擎 =====
  /** 找到当前正在构建的 AI 消息(最后一条 ai 消息) */
  function lastAi(): ChatMessage | undefined {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].role === 'ai') return state.messages[i]
    }
    return undefined
  }

  /** 单个子代理的执行流:思考 → 工具调用 → 回答 */
  async function runSubAgent(agent: SubAgent, idx: number): Promise<string> {
    const tpl = SUBAGENT_TEMPLATES[idx]

    agent.status = 'think'
    agent.progress = 15
    agent.stream.push({ kind: 'think', text: tpl.think })
    await sleep(700 + Math.random() * 500)

    agent.status = 'run'
    agent.progress = 45
    const toolEvent = { kind: 'tool' as const, fn: tpl.fn, body: '', done: false }
    agent.stream.push(toolEvent)
    await sleep(800 + Math.random() * 700)

    toolEvent.done = true
    toolEvent.body = tpl.body
    agent.progress = 75
    await sleep(500 + Math.random() * 400)

    agent.stream.push({ kind: 'answer', text: tpl.answer })
    agent.status = 'done'
    agent.progress = 100
    return tpl.answer
  }

  // PLACEHOLDER_STORE2
  /** 从应用中心启动一个应用:切回对话视图,可选预填一段提示词 */
  function launchApp(prompt?: string) {
    state.view = 'chat'
    if (prompt) dispatch(prompt)
  }

  /** 派发一次任务:主 Agent 思考 → 并行编排子代理 → 汇总流式回答 */
  async function dispatch(text: string) {
    if (state.busy || !text.trim()) return
    state.busy = true
    state.view = 'chat'

    // 用户消息
    state.messages.push({ id: uid('m'), role: 'user', time: now(), text: text.trim() })

    // 重置本轮舰队与任务
    state.agents = []
    state.tasks = []
    state.selectedAgentId = null
    await sleep(300)

    // 新建 AI 消息,先放主 Agent 的思考块
    const ai: ChatMessage = {
      id: uid('m'),
      role: 'ai',
      time: now(),
      blocks: [
        {
          kind: 'think',
          text: '这是一个多因素诊断问题。我将任务拆解为 4 个并行子代理:数据采集、特征诊断、知识检索、方案生成,分别派发后汇总根因结论。',
          duration: '思考 1.2s',
          collapsed: false,
        },
      ],
    }
    state.messages.push(ai)
    await sleep(500)

    // 建任务条
    state.tasks = SUBAGENT_TEMPLATES.map((t) => ({
      id: uid('t'),
      name: t.task,
      state: 'queued' as const,
    }))

    // 中间区:SPAWN 卡片
    const spawn = {
      kind: 'tool' as const,
      tag: 'SPAWN' as const,
      fn: 'orchestrator.dispatch(n=4, mode="parallel")',
      body: '正在派发 4 个子代理…',
      done: false,
    }
    ai.blocks!.push(spawn)
    await sleep(600)
    spawn.done = true
    spawn.body = '✓ 4 个子代理已派发至右侧舰队'

    // PLACEHOLDER_STORE3
    // 派发子代理(交错启动制造实时感)
    state.agents = SUBAGENT_TEMPLATES.map((t) => ({
      id: uid('ag'),
      pid: '#' + pidSeq++,
      name: t.name,
      icon: t.icon,
      status: 'queued' as const,
      progress: 0,
      stream: [],
    }))
    state.selectedAgentId = state.agents[0].id

    await Promise.all(
      state.agents.map(async (agent, i) => {
        await sleep(i * 450)
        state.tasks[i].state = 'active'
        const ans = await runSubAgent(agent, i)
        state.tasks[i].state = 'done'
        lastAi()?.blocks!.push({
          kind: 'tool',
          tag: 'RESULT',
          fn: `${agent.name} → ${agent.pid}`,
          body: ans,
          done: true,
        })
      }),
    )

    // 汇总回答:流式逐字写入,交给 vue-stream-markdown 渲染
    await sleep(400)
    const answerBlock = { kind: 'answer' as const, text: '', streaming: true }
    ai.blocks!.push(answerBlock)
    const full = SYNTHESIS_MARKDOWN
    let i = 0
    await new Promise<void>((resolve) => {
      const iv = setInterval(() => {
        i += 3
        answerBlock.text = full.slice(0, i)
        if (i >= full.length) {
          clearInterval(iv)
          answerBlock.text = full
          answerBlock.streaming = false
          resolve()
        }
      }, 16)
    })

    state.busy = false
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
    launchApp,
    selectSession,
    newSession,
    setSearch,
    selectAgent,
    toggleTheme,
    dispatch,
    seedConversation,
  }
})
