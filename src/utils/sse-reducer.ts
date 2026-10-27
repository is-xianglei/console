import type {
  ChatBlock,
  ChatMessage,
  SseEvent,
  SseWorkflowProgress,
  StreamEvent,
  SubAgent,
  TaskResponse,
} from '../interfaces/console/model'

/** 中间对话区与子代理面板共用的推理块、回答块形状 */
type ThinkItem = Extract<ChatBlock | StreamEvent, { kind: 'think' }>
type AnswerItem = Extract<ChatBlock | StreamEvent, { kind: 'answer' }>

/** reducer 操作的可变状态切片(由 store 传入其响应式对象引用) */
export interface SseTarget {
  /** 当前正在构建的 AI 消息(orchestrator 内容写入其 blocks) */
  ai: ChatMessage
  /** 右栏子代理舰队(subagent/teammate 写入) */
  agents: SubAgent[]
  /** 当前选中的子代理 id 设置器 */
  selectAgent: (id: string | null) => void
  /** 新会话 id 回填(session_ready) */
  onSessionId?: (id: number) => void
  /** task_snapshot 到达:携带该会话全量任务,前端整体替换任务面板 */
  onTaskSnapshot?: (tasks: TaskResponse[]) => void
  /** 编排节点事件(node_start/node_end):图状态归并,不建面板 */
  onNodeEvent?: (ev: SseEvent) => void
  /** Workflow 进度事件(workflow_progress):进度图状态归并 */
  onWorkflowProgress?: (progress: SseWorkflowProgress) => void
}

/** 子代理唯一键:subagent 用 run_id,teammate 用 name,缺失兜底 name */
function agentKey(ev: SseEvent): string {
  const a = ev.actor
  if (!a) return 'unknown'
  if (a.role === 'subagent') return a.run_id || a.name
  if (a.role === 'teammate') return a.name
  return a.name
}

/** 按 agent_type/角色给子代理挑一个图标 */
function iconFor(name: string, role: string): string {
  const map: Record<string, string> = {
    explore: 'search-code',
    plan: 'list-checks',
    verify: 'shield-check',
    code: 'wrench',
    research: 'book-open',
  }
  if (map[name]) return map[name]
  return role === 'teammate' ? 'users' : 'bot'
}

/** 找到/创建右栏子代理面板。返回 reactive 数组里的代理(非原始对象),
 *  保证后续对 status/progress/stream 的修改能触发视图更新 */
function ensureAgent(t: SseTarget, ev: SseEvent): SubAgent {
  const key = agentKey(ev)
  const existing = t.agents.find((x) => x.id === key)
  if (existing) {
    // 已存在面板的 agentId 缺失(如旧事件先到时)也补上,保证进度图能按它匹配面板
    if (existing.agentId == null && ev.actor?.agent_id != null) existing.agentId = ev.actor.agent_id
    return existing
  }
  const actor = ev.actor!
  t.agents.push({
    id: key,
    pid: actor.run_id ? actor.run_id : actor.name,
    // 标题用 actor.name(编排叶子即 Agent 名)。task 是渲染后的完整 instruction,
    // 顺序编排里会带上游全文,三个面板标题会长得几乎一样,不能作标题。
    name: actor.name || actor.task || '子代理',
    icon: iconFor(actor.name, actor.role),
    status: 'queued',
    progress: 0,
    stream: [],
    agentId: actor.agent_id,
  })
  const proxy = t.agents[t.agents.length - 1]
  // 首个子代理自动选中,方便观察
  if (t.agents.length === 1) t.selectAgent(proxy.id)
  return proxy
}

/** 工具 input 摘要为 CLI 卡片的函数签名展示。历史映射(mapMessages)复用同一格式,保证实时流与刷新后一致。 */
export function fmtToolCall(name: string, input?: Record<string, unknown>): string {
  if (!input || !Object.keys(input).length) return `${name}()`
  const args = Object.entries(input)
    .map(([k, v]) => {
      const s = typeof v === 'string' ? `"${v}"` : JSON.stringify(v)
      return `${k}=${s.length > 40 ? s.slice(0, 40) + '…' : s}`
    })
    .join(', ')
  return `${name}(${args})`
}

/**
 * 创建一个有状态的 SSE 归约器。内部维护"块索引 → 块对象"的映射,
 * 把增量事件累加到对应块。orchestrator → AI 消息 blocks;
 * subagent/teammate → 右栏对应面板 stream。
 */
export function createSseReducer(target: SseTarget) {
  // orchestrator 当前轮的块映射:block.index → ChatBlock 引用
  const oBlocks = new Map<number, ChatBlock>()
  // 子代理当前块映射:agentKey → (index → 面板 stream 里的累加目标,存 reactive 代理)
  const aBlocks = new Map<string, Map<number, ThinkItem | AnswerItem>>()
  // 推理块开始时间:只用于算思考秒数,不放进块对象,免得触发响应式更新。
  // 后端信封不带事件时间戳,按前端收到 block_start 的时刻计。
  const thinkStartedAt = new WeakMap<ThinkItem, number>()

  /** 结束推理块并记下思考秒数;已结束的不重复处理(block_stop 与收尾兜底可能先后到达) */
  function settleThink(b: ThinkItem) {
    if (b.done) return
    b.done = true
    const startedAt = thinkStartedAt.get(b)
    if (startedAt != null) b.seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
  }

  /** 结束单个推理块或回答块:推理记秒数,回答停掉流式光标 */
  function settleItem(b: ChatBlock | StreamEvent) {
    if (b.kind === 'think') settleThink(b)
    else if (b.kind === 'answer') b.streaming = false
  }

  /** 子代理本轮结束或出错:收尾它还没结束的推理块和回答块 */
  function settleAgent(a: SubAgent) {
    for (const it of a.stream) settleItem(it)
  }

  /**
   * 收尾兜底:把中间对话区和所有子代理面板里仍未结束的推理块、回答块都结束掉。
   * 流被中止、连接出错或流结束却没收到 block_stop / turn_end 时,
   * 推理块会一直停在「思考中…」且无法展开,回答的光标会一直闪。
   */
  function settleStreams() {
    for (const b of target.ai.blocks ?? []) settleItem(b)
    for (const a of target.agents) settleAgent(a)
  }

  function handle(ev: SseEvent) {
    const role = ev.actor?.role ?? 'orchestrator'

    // 新会话 id 回填
    if (ev.type === 'session_ready') {
      const sid = ev.data?.session_id ?? ev.session_id
      if (sid) target.onSessionId?.(sid)
      return
    }

    // 任务全量快照(会话级,不带 actor):直接透传全量 tasks,面板整体替换
    if (ev.type === 'task_snapshot') {
      target.onTaskSnapshot?.(ev.data?.tasks ?? [])
      return
    }

    // 编排节点事件:只做图状态归并,必须在 actor.role 分流前早退。
    // 节点事件的 actor 是父 FlowAgent(名字为方案名),且 node_start 早于叶子 turn_start,
    // 一旦流入 handleAgent 就会以方案名误建右栏面板并抢占标题。
    if (ev.type === 'node_start' || ev.type === 'node_end') {
      target.onNodeEvent?.(ev)
      return
    }

    // Workflow 进度事件:与节点事件同理必须早退。它的 actor 也是 orchestrator,
    // 但并不是内容块,落入 handleOrchestrator 只会被 switch 忽略;显式早退是为了语义清楚。
    if (ev.type === 'workflow_progress') {
      if (ev.progress) target.onWorkflowProgress?.(ev.progress)
      return
    }

    if (role === 'orchestrator') {
      handleOrchestrator(ev)
    } else {
      handleAgent(ev)
    }
  }

  // ===== orchestrator → 中间对话区 =====
  function handleOrchestrator(ev: SseEvent) {
    const blocks = target.ai.blocks!
    switch (ev.type) {
      case 'block_start': {
        const bt = ev.block?.block_type
        if (bt === 'thinking') {
          blocks.push({ kind: 'think', text: '', done: false })
          // 关键:存回 reactive 数组里的代理,而非 push 前的原始字面量,
          // 否则后续 b.text += delta 改的是原始对象,不触发视图更新
          const block = blocks[blocks.length - 1] as ThinkItem
          oBlocks.set(ev.block!.index, block)
          thinkStartedAt.set(block, Date.now())
        } else if (bt === 'text') {
          blocks.push({ kind: 'answer', text: '', streaming: true })
          oBlocks.set(ev.block!.index, blocks[blocks.length - 1])
        }
        break
      }
      case 'thinking_delta': {
        const b = oBlocks.get(ev.block!.index)
        if (b?.kind === 'think') b.text += ev.text ?? ''
        break
      }
      case 'text_delta': {
        const b = oBlocks.get(ev.block!.index)
        if (b?.kind === 'answer') b.text += ev.text ?? ''
        break
      }
      case 'block_stop': {
        const b = oBlocks.get(ev.block!.index)
        if (b?.kind === 'think') {
          settleThink(b)
        } else if (b?.kind === 'answer') {
          b.streaming = false
        }
        break
      }
      case 'tool_use': {
        const card: ChatBlock = {
          kind: 'tool',
          tag: ev.tool?.name === 'Agent' || ev.tool?.name === 'TeamSpawn' ? 'SPAWN' : 'TOOL',
          fn: fmtToolCall(ev.tool?.name ?? 'tool', ev.tool?.input),
          body: '',
          done: false,
        }
        blocks.push(card)
        break
      }
      case 'tool_result': {
        // 匹配最近一个未完成的同类工具卡,填充结果
        for (let i = blocks.length - 1; i >= 0; i--) {
          const b = blocks[i]
          if (b.kind === 'tool' && !b.done) {
            b.done = true
            b.tag = ev.tool?.is_error ? 'ERROR' : 'RESULT'
            b.body = typeof ev.tool?.output === 'string' ? ev.tool.output : ''
            break
          }
        }
        break
      }
      case 'permission_request': {
        // 工具执行前的审批请求:插一张待裁决审批卡,等待用户在卡上选择。
        // 应答走独立端点(store.respondApproval),不回写本流。
        const p = ev.permission
        if (p) {
          blocks.push({
            kind: 'approval',
            requestId: p.request_id,
            toolName: p.tool_name,
            toolInput: p.tool_input ?? {},
            reason: p.reason ?? '该工具需要审批',
            status: 'pending',
          })
        }
        break
      }
      case 'interaction_request': {
        if (ev.interaction) {
          blocks.push({
            kind: 'interaction',
            interaction: ev.interaction,
            status: 'pending',
          })
        }
        break
      }
      case 'error': {
        blocks.push({
          kind: 'tool',
          tag: 'ERROR',
          fn: ev.error?.code ?? 'ERROR',
          body: ev.error?.message ?? '未知错误',
          done: true,
        })
        break
      }
    }
  }

  // ===== subagent / teammate → 右栏面板 =====
  function handleAgent(ev: SseEvent) {
    const key = agentKey(ev)
    switch (ev.type) {
      case 'turn_start': {
        const a = ensureAgent(target, ev)
        a.status = 'think'
        a.progress = 10
        aBlocks.set(key, new Map())
        break
      }
      case 'block_start': {
        const a = ensureAgent(target, ev)
        const bt = ev.block?.block_type
        const map = aBlocks.get(key) ?? new Map()
        aBlocks.set(key, map)
        // 同 orchestrator:存回 reactive 数组里的代理,后续增量直接累加到它上面
        if (bt === 'thinking') {
          a.stream.push({ kind: 'think', text: '', done: false })
          const item = a.stream[a.stream.length - 1] as ThinkItem
          map.set(ev.block!.index, item)
          thinkStartedAt.set(item, Date.now())
          a.status = 'think'
          a.progress = Math.max(a.progress, 30)
        } else if (bt === 'text') {
          a.stream.push({ kind: 'answer', text: '', streaming: true })
          map.set(ev.block!.index, a.stream[a.stream.length - 1] as AnswerItem)
          a.status = 'run'
          a.progress = Math.max(a.progress, 70)
        }
        break
      }
      case 'thinking_delta':
      case 'text_delta': {
        ensureAgent(target, ev)
        const slot = aBlocks.get(key)?.get(ev.block!.index)
        if (!slot) break
        slot.text += ev.text ?? ''
        break
      }
      case 'block_stop': {
        const slot = aBlocks.get(key)?.get(ev.block!.index)
        if (slot) settleItem(slot)
        break
      }
      case 'tool_use': {
        const a = ensureAgent(target, ev)
        a.status = 'run'
        a.progress = Math.max(a.progress, 50)
        a.stream.push({
          kind: 'tool',
          fn: fmtToolCall(ev.tool?.name ?? 'tool', ev.tool?.input),
          body: '',
          done: false,
        })
        break
      }
      case 'tool_result': {
        const a = ensureAgent(target, ev)
        for (let i = a.stream.length - 1; i >= 0; i--) {
          const it = a.stream[i]
          if (it.kind === 'tool' && !it.done) {
            it.done = true
            it.body = typeof ev.tool?.output === 'string' ? ev.tool.output : ''
            break
          }
        }
        break
      }
      case 'turn_end': {
        const a = ensureAgent(target, ev)
        settleAgent(a)
        a.status = 'done'
        a.progress = 100
        break
      }
      case 'error': {
        const a = ensureAgent(target, ev)
        settleAgent(a)
        a.status = 'error'
        a.stream.push({
          kind: 'tool',
          fn: ev.error?.code ?? 'ERROR',
          body: ev.error?.message ?? '错误',
          done: true,
        })
        break
      }
    }
  }

  return { handle, settleStreams }
}
