import type {
  ChatBlock,
  ChatMessage,
  CliTag,
  SseEvent,
  SseWorkflowProgress,
  StreamEvent,
  SubAgent,
  TaskResponse,
  UnknownToolCall,
} from '../interfaces/console/model'
import { mcpToolRef, mergeFaults } from './mcp-tool'

/** 中间对话区与子代理面板共用的推理块、回答块形状 */
type ThinkItem = Extract<ChatBlock | StreamEvent, { kind: 'think' }>
type AnswerItem = Extract<ChatBlock | StreamEvent, { kind: 'answer' }>
type ToolItem = Extract<ChatBlock | StreamEvent, { kind: 'tool' }>

/** reducer 操作的可变状态切片(由 store 传入其响应式对象引用) */
export interface SseTarget {
  /** 当前正在构建的 AI 消息(orchestrator 内容写入其 blocks)；可以是 getter，只在新建块时读取 */
  readonly ai: ChatMessage
  /** ai 是懒建 getter 时，收尾用它取已有的容器，不为收尾新建空容器。 */
  peekAi?: () => ChatMessage | null
  /** 右栏子代理舰队(subagent 写入) */
  agents: SubAgent[]
  /** 队友激活流：这条流只有主线，产出者就是该队友，主线内容写进它的面板而不是 AI 消息。 */
  mainPanel?: SubAgent
  /** 当前选中的子代理 id 设置器 */
  selectAgent: (id: string | null) => void
  /** 新会话 id 回填(session_ready) */
  onSessionId?: (id: number) => void
  /** task_snapshot 到达:携带该会话全量任务,前端整体替换任务面板 */
  onTaskSnapshot?: (tasks: TaskResponse[]) => void
  /** Workflow 进度事件(workflow_progress):进度图状态归并 */
  onWorkflowProgress?: (progress: SseWorkflowProgress) => void
  /** 本回合结果未知的工具调用（来自回合列表接口）；建「需要人工处理」卡时带上。 */
  attentionCalls?: () => UnknownToolCall[]
}

/** 子运行的每一帧都是 subagent_event；其余帧都属于主线。 */
function isSubRun(ev: SseEvent): boolean {
  return ev.type === 'subagent_event'
}

/** 内容事件名：主线就是 type，子运行取 sub_type。 */
function eventName(ev: SseEvent): string {
  return isSubRun(ev) ? ev.sub_type ?? '' : ev.type
}

/**
 * 块与工具结果的定位范围：主线为 ''，子运行为 sub_run_id。
 * 主线与子运行之间、兄弟子运行之间的同 id 工具调用互不匹配。
 */
function lineKey(ev: SseEvent): string {
  return isSubRun(ev) ? ev.sub_run_id ?? 'unknown-sub-run' : ''
}

/** 按 agent_name 给子代理挑一个图标 */
function iconFor(name: string): string {
  const map: Record<string, string> = {
    explore: 'search-code',
    plan: 'list-checks',
    verify: 'shield-check',
    code: 'wrench',
    research: 'book-open',
  }
  return map[name.toLowerCase()] ?? 'bot'
}

/** 找到/创建右栏子代理面板。返回 reactive 数组里的代理(非原始对象),
 *  保证后续对 status/progress/stream 的修改能触发视图更新 */
function ensureAgent(t: SseTarget, ev: SseEvent): SubAgent {
  const key = ev.sub_run_id ?? 'unknown-sub-run'
  const existing = t.agents.find((x) => x.id === key)
  if (existing) {
    // 已存在面板的外层字段缺失(如旧帧先到)也补上，保证进度图与历史挂卡能匹配。
    if (existing.agentId == null && ev.agent_id != null) existing.agentId = ev.agent_id
    if (existing.parentId == null && ev.parent_id != null) existing.parentId = ev.parent_id
    if (existing.task == null && ev.task != null) existing.task = ev.task
    return existing
  }
  const name = ev.agent_name || '子代理'
  t.agents.push({
    id: key,
    pid: key,
    // 标题只用 agent_name；task 是整段任务正文，在详情里展示，不作标题。
    name,
    icon: iconFor(name),
    status: 'queued',
    progress: 0,
    stream: [],
    agentId: ev.agent_id ?? null,
    parentId: ev.parent_id ?? null,
    task: ev.task ?? null,
  })
  const proxy = t.agents[t.agents.length - 1]!
  // 首个子代理自动选中,方便观察
  if (t.agents.length === 1) t.selectAgent(proxy.id)
  return proxy
}

/** 工具 input 摘要为 CLI 卡片的函数签名展示。历史映射(mapMessages)复用同一格式,保证实时流与刷新后一致。 */
/** 工具卡的展示字段：MCP 工具去掉 mcp__{server_key}__ 前缀，另给出 server_key 供卡片标注来源。 */
export function toolCardFields(name: string, input?: Record<string, unknown>, source?: string | null): { fn: string; mcp?: string } {
  const ref = mcpToolRef(name, source)
  if (!ref) return { fn: fmtToolCall(name, input) }
  return { fn: fmtToolCall(ref.toolName, input), mcp: ref.serverKey }
}

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

/** 续跑折叠时记在每个块上的位置信息；块对象本身不带，免得进视图。 */
interface ItemMeta {
  /** 建块位置（block_start / tool_use / error 的 sequence）。 */
  sequence: number
  /** 所属子运行：Workflow 回合按 sub_run_watermarks 折叠。主线的块没有这个字段。 */
  subRunId?: string
  /** 工具卡的定位范围（主线 ''，子运行 sub_run_id）与 tool.id，结果被清掉后要重新登记，续跑的 tool_result 才能回填。 */
  scope: string
  toolId?: string
  /** 工具结果的位置。 */
  resultSequence?: number
  /** 中间对话区工具卡收到结果前的 tag（SPAWN / TOOL）。 */
  tag?: CliTag
}

/** 结果未知、需要人工处理的错误码（lead 与 Workflow 回合）。 */
export const TURN_NEEDS_ATTENTION = 'TURN_NEEDS_ATTENTION'

/**
 * 创建一个有状态的 SSE 归约器。内部维护"块索引 → 块对象"的映射,
 * 把增量事件累加到对应块。主线 → AI 消息 blocks;subagent_event → 右栏对应面板 stream。
 * 块定位：主线按 (segment, index) 唯一（每次 turn_start 开新 segment，index 从 0 重新编）；
 * 子运行按 (sub_run_id, index) 唯一，没有 segment。
 *
 * target.ai 可以是 getter：只在要新建块时才读取，调用方据此按回合懒建回复容器；
 * 一个回合被注入发言切成几段时，写过的容器都会记下来，收尾与续跑折叠覆盖全部容器。
 */
export function createSseReducer(target: SseTarget) {
  // 主线当前 segment 的块映射:block.index → ChatBlock 引用；turn_start 换段时清空
  const mainBlocks = new Map<number, ChatBlock>()
  // 子运行当前块映射:sub_run_id → (index → 面板 stream 里的累加目标,存 reactive 代理)
  const subBlocks = new Map<string, Map<number, ThinkItem | AnswerItem>>()
  // 工具卡按线（主线 '' / 子运行 sub_run_id）+ tool.id 建索引，不能再按“最近一个未完成卡片”猜测归属。
  const tools = new Map<string, Map<string, ToolItem>>()
  // 推理块开始时间:只用于算思考秒数,不放进块对象,免得触发响应式更新。
  // 后端信封不带事件时间戳,按前端收到 block_start 的时刻计。
  const thinkStartedAt = new WeakMap<ThinkItem, number>()
  // 本归约器写过块的回复容器（按写入顺序）。
  const containers = new Set<ChatMessage>()
  const metas = new WeakMap<object, ItemMeta>()

  /** 往当前回复容器追加一个块，返回 reactive 数组里读回的代理。 */
  function pushBlock(block: ChatBlock): ChatBlock {
    const ai = target.ai
    const blocks = ai.blocks ?? (ai.blocks = [])
    containers.add(ai)
    blocks.push(block)
    return blocks[blocks.length - 1]!
  }

  function remember(item: object, ev: SseEvent, extra: Partial<ItemMeta> = {}) {
    if (typeof ev.sequence !== 'number') return
    metas.set(item, {
      sequence: ev.sequence,
      scope: lineKey(ev),
      ...(isSubRun(ev) && ev.sub_run_id ? { subRunId: ev.sub_run_id } : {}),
      ...extra,
    })
  }

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
    const current = target.peekAi ? target.peekAi() : target.ai
    for (const container of current ? new Set([...containers, current]) : containers) {
      for (const b of container.blocks ?? []) settleItem(b)
    }
    for (const a of target.agents) settleAgent(a)
    if (target.mainPanel) settleAgent(target.mainPanel)
  }

  /** 归约器写块的全部面板：右栏子运行面板，以及队友激活流的主线面板。 */
  function targetPanels(): SubAgent[] {
    return target.mainPanel ? [...target.agents, target.mainPanel] : target.agents
  }

  function registerTool(scope: string, id: string, item: ToolItem) {
    const scoped = tools.get(scope) ?? new Map<string, ToolItem>()
    scoped.set(id, item)
    tools.set(scope, scoped)
  }

  function rememberTool(ev: SseEvent, item: ToolItem) {
    const id = ev.tool?.id
    if (!id) return
    registerTool(lineKey(ev), id, item)
  }

  /** 工具结果只在自己那条线里按 tool.id 匹配，不跨主线、不跨兄弟子运行。 */
  function findTool(ev: SseEvent): ToolItem | undefined {
    const id = ev.tool?.id
    if (!id) return undefined
    const card = tools.get(lineKey(ev))?.get(id)
    return card && !card.done ? card : undefined
  }

  function forgetTool(ev: SseEvent, item: ToolItem) {
    const id = ev.tool?.id
    if (!id) return
    const scope = lineKey(ev)
    const scoped = tools.get(scope)
    if (scoped?.get(id) !== item) return
    scoped.delete(id)
    if (!scoped.size) tools.delete(scope)
  }

  /** 回合需要人工处理：同一回合只挂一张提示卡，后到的 error 帧只补文案。 */
  function markAttention(message?: string) {
    for (const container of containers) {
      const existing = container.blocks?.find((block) => block.kind === 'attention')
      if (existing?.kind === 'attention') {
        if (message) existing.message = message
        return
      }
    }
    pushBlock({ kind: 'attention', ...(message ? { message } : {}), calls: target.attentionCalls?.() ?? [] })
  }

  /**
   * 还没收到结束帧的子运行一律收口：收到 run_end 或 run_resumed（先按水位丢块）时调用。
   * 只改状态与收尾动画，不动 usage、stop_reason 和块。
   */
  function interruptAgents() {
    for (const agent of target.agents) {
      if (agent.status !== 'queued' && agent.status !== 'think' && agent.status !== 'run') continue
      settleAgent(agent)
      agent.status = 'interrupted'
    }
  }

  function handle(ev: SseEvent) {
    // 会话级帧：不属于任何产出者，子运行里不会出现。
    if (ev.type === 'session_ready') {
      const sid = ev.data?.session_id ?? ev.session_id
      if (sid) target.onSessionId?.(sid)
      return
    }
    if (ev.type === 'task_snapshot') {
      target.onTaskSnapshot?.(ev.data?.tasks ?? [])
      return
    }
    if (ev.type === 'tool_sources') {
      // 作用域工具来源故障放进当前回复最上面的提示块,同来源同故障去重。
      const faults = ev.data?.faults ?? []
      if (!faults.length) return
      const ai = target.ai
      const blocks = ai.blocks ?? (ai.blocks = [])
      containers.add(ai)
      const existing = blocks.find((block) => block.kind === 'sources')
      if (existing?.kind === 'sources') existing.faults = mergeFaults(existing.faults, faults)
      else blocks.unshift({ kind: 'sources', faults: mergeFaults([], faults) })
      return
    }
    // Workflow 进度只由编排者产出，在归属分流之前处理。
    if (ev.type === 'workflow_progress') {
      if (ev.progress) target.onWorkflowProgress?.(ev.progress)
      return
    }
    // 需要人工处理是回合级的：只由主线发出，一律挂在中间对话区。
    if (!isSubRun(ev) && ev.type === 'error' && ev.error?.code === TURN_NEEDS_ATTENTION) {
      markAttention(ev.error.message)
      return
    }

    if (isSubRun(ev)) handleSubRun(ev)
    else handleMain(ev)
  }

  // ===== 主线 → 中间对话区 =====
  // 只在新建块时读 target.ai，增量与结果按引用写回，不会因此懒建出空容器。
  function handleMain(ev: SseEvent) {
    // 队友激活流只有主线：产出者就是该队友，内容写进它的面板。
    if (target.mainPanel) {
      handlePanel(ev, target.mainPanel, '')
      return
    }
    switch (ev.type) {
      case 'turn_start': {
        // 每次执行主线先发 turn_start，segment 加 1，index 从 0 重新编。
        mainBlocks.clear()
        break
      }
      case 'block_start': {
        const bt = ev.block?.block_type
        if (bt === 'thinking') {
          // 关键:存回 reactive 数组里的代理,而非 push 前的原始字面量,
          // 否则后续 b.text += delta 改的是原始对象,不触发视图更新
          const block = pushBlock({ kind: 'think', text: '', done: false }) as ThinkItem
          mainBlocks.set(ev.block!.index, block)
          thinkStartedAt.set(block, Date.now())
          remember(block, ev)
        } else if (bt === 'text') {
          const block = pushBlock({ kind: 'answer', text: '', streaming: true })
          mainBlocks.set(ev.block!.index, block)
          remember(block, ev)
        }
        break
      }
      case 'thinking_delta': {
        const b = mainBlocks.get(ev.block!.index)
        if (b?.kind === 'think') b.text += ev.text ?? ''
        break
      }
      case 'text_delta': {
        const b = mainBlocks.get(ev.block!.index)
        if (b?.kind === 'answer') b.text += ev.text ?? ''
        break
      }
      case 'block_stop': {
        const b = mainBlocks.get(ev.block!.index)
        if (b?.kind === 'think') {
          settleThink(b)
        } else if (b?.kind === 'answer') {
          b.streaming = false
        }
        break
      }
      case 'tool_use': {
        const tag: CliTag = ev.tool?.name === 'Agent' || ev.tool?.name === 'TeamSpawn' ? 'SPAWN' : 'TOOL'
        // 索引保存响应式数组读回的代理，结果回填才能触发视图更新。
        const card = pushBlock({
          kind: 'tool',
          tag,
          ...toolCardFields(ev.tool?.name ?? 'tool', ev.tool?.input, ev.tool?.source),
          body: '',
          done: false,
        }) as ToolItem
        rememberTool(ev, card)
        remember(card, ev, { tag, ...(ev.tool?.id ? { toolId: ev.tool.id } : {}) })
        break
      }
      case 'tool_result': {
        const b = findTool(ev)
        if (!b || b.kind !== 'tool') break
        const card = b as Extract<ChatBlock, { kind: 'tool' }>
        card.done = true
        card.tag = ev.tool?.is_error ? 'ERROR' : 'RESULT'
        card.body = typeof ev.tool?.output === 'string' ? ev.tool.output : ''
        const meta = metas.get(b)
        if (meta && typeof ev.sequence === 'number') meta.resultSequence = ev.sequence
        forgetTool(ev, b)
        break
      }
      case 'permission_request': {
        // 工具执行前的审批请求:插一张待裁决审批卡,等待用户在卡上选择。
        // 应答走独立端点(store.respondApproval),不回写本流。
        const p = ev.permission
        if (p) {
          pushBlock({
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
          pushBlock({
            kind: 'interaction',
            interaction: ev.interaction,
            status: 'pending',
          })
        }
        break
      }
      case 'error': {
        // 错误不参与续跑折叠，不记位置。
        pushBlock({
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

  // ===== 子运行(subagent_event) → 右栏面板 =====
  function handleSubRun(ev: SseEvent) {
    handlePanel(ev, ensureAgent(target, ev), lineKey(ev))
  }

  /** 往一个面板写内容：子运行与队友激活流（mainPanel）共用。runId 区分块与工具卡的定位范围。 */
  function handlePanel(ev: SseEvent, a: SubAgent, runId: string) {
    switch (eventName(ev)) {
      case 'turn_start': {
        a.status = 'think'
        a.progress = 10
        if (ev.task != null) a.task = ev.task
        subBlocks.set(runId, new Map())
        break
      }
      case 'block_start': {
        const bt = ev.block?.block_type
        const map = subBlocks.get(runId) ?? new Map<number, ThinkItem | AnswerItem>()
        subBlocks.set(runId, map)
        // 同主线:存回 reactive 数组里的代理,后续增量直接累加到它上面
        if (bt === 'thinking') {
          a.stream.push({ kind: 'think', text: '', done: false })
          const item = a.stream[a.stream.length - 1] as ThinkItem
          map.set(ev.block!.index, item)
          thinkStartedAt.set(item, Date.now())
          remember(item, ev)
          a.status = 'think'
          a.progress = Math.max(a.progress, 30)
        } else if (bt === 'text') {
          a.stream.push({ kind: 'answer', text: '', streaming: true })
          const item = a.stream[a.stream.length - 1] as AnswerItem
          map.set(ev.block!.index, item)
          remember(item, ev)
          a.status = 'run'
          a.progress = Math.max(a.progress, 70)
        }
        break
      }
      case 'thinking_delta':
      case 'text_delta': {
        const slot = subBlocks.get(runId)?.get(ev.block!.index)
        if (!slot) break
        slot.text += ev.text ?? ''
        break
      }
      case 'block_stop': {
        const slot = subBlocks.get(runId)?.get(ev.block!.index)
        if (slot) settleItem(slot)
        break
      }
      case 'tool_use': {
        a.status = 'run'
        a.progress = Math.max(a.progress, 50)
        const item: Extract<StreamEvent, { kind: 'tool' }> = {
          kind: 'tool',
          ...toolCardFields(ev.tool?.name ?? 'tool', ev.tool?.input, ev.tool?.source),
          body: '',
          done: false,
        }
        a.stream.push(item)
        const proxy = a.stream[a.stream.length - 1] as ToolItem
        rememberTool(ev, proxy)
        remember(proxy, ev, ev.tool?.id ? { toolId: ev.tool.id } : {})
        break
      }
      case 'tool_result': {
        const item = findTool(ev)
        if (!item || item.kind !== 'tool') break
        const tool = item as Extract<StreamEvent, { kind: 'tool' }>
        tool.done = true
        tool.body = typeof ev.tool?.output === 'string' ? ev.tool.output : ''
        if (typeof ev.tool?.is_error === 'boolean') tool.is_error = ev.tool.is_error
        const meta = metas.get(item)
        if (meta && typeof ev.sequence === 'number') meta.resultSequence = ev.sequence
        forgetTool(ev, item)
        break
      }
      case 'turn_end': {
        settleAgent(a)
        a.status = 'done'
        a.progress = 100
        break
      }
      case 'error': {
        settleAgent(a)
        a.status = 'error'
        a.stream.push({
          kind: 'tool',
          fn: ev.error?.code ?? 'ERROR',
          body: ev.error?.message ?? '错误',
          done: true,
          is_error: true,
        })
        break
      }
    }
  }

  /**
   * 收到 run_resumed：丢掉被打断那次执行已显示、但没落库的半截内容。
   * start 是紧挨着的 run_started 的 sequence；主线用 watermark，
   * 子运行在 sub_run_watermarks 里有自己的 sub_run_id 就用对应值，否则也用 watermark。
   * 建块位置满足 w < sequence < start 的整块删除；保留下来的工具卡，结果位置落在这个区间的只清掉结果，
   * 等续跑重新执行后回填。丢完之后，还没结束的子运行一律收口。
   * errors、workflow 节点、interaction、会话与任务不动。
   */
  function fold(start: number, watermark: number, subRunWatermarks: Record<string, number> = {}) {
    const limitOf = (meta: ItemMeta) =>
      meta.subRunId != null && typeof subRunWatermarks[meta.subRunId] === 'number'
        ? subRunWatermarks[meta.subRunId]!
        : watermark
    const stale = (sequence: number, w: number) => sequence > w && sequence < start

    function prune<T extends ChatBlock | StreamEvent>(items: T[]) {
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index]!
        const meta = metas.get(item)
        if (!meta) continue
        const w = limitOf(meta)
        if (stale(meta.sequence, w)) {
          items.splice(index, 1)
          continue
        }
        if (item.kind === 'tool' && meta.resultSequence != null && stale(meta.resultSequence, w)) {
          item.done = false
          item.body = ''
          if ('tag' in item) item.tag = meta.tag ?? 'TOOL'
          if ('is_error' in item) delete item.is_error
          meta.resultSequence = undefined
        }
        // 留下来的都已落库，不会再收到增量。
        settleItem(item)
      }
    }

    for (const container of containers) prune(container.blocks ?? [])
    for (const agent of targetPanels()) prune(agent.stream)

    // 上一次执行里没结束的子运行不会再发帧（续跑重跑的是新的子运行），一律收口。
    interruptAgents()

    // 续跑从新块开始；还没回填结果的工具卡重新登记，续跑的 tool_result 才能找到它。
    mainBlocks.clear()
    subBlocks.clear()
    tools.clear()
    const relink = (items: Array<ChatBlock | StreamEvent>) => {
      for (const item of items) {
        if (item.kind !== 'tool' || item.done) continue
        const meta = metas.get(item)
        if (meta?.toolId) registerTool(meta.scope, meta.toolId, item as ToolItem)
      }
    }
    for (const container of containers) relink(container.blocks ?? [])
    for (const agent of targetPanels()) relink(agent.stream)
  }

  /** 接管一张别处建好的工具卡（截断快照里已落库、还在执行的调用），之后的 tool_result 回填到它。 */
  function adoptTool(ev: SseEvent, item: ChatBlock) {
    if (item.kind !== 'tool') return
    rememberTool(ev, item)
    remember(item, ev, ev.tool?.id ? { toolId: ev.tool.id, tag: item.tag } : { tag: item.tag })
  }

  /** 快照整体重建前清掉块索引，旧引用不能再收到增量。 */
  function reset() {
    mainBlocks.clear()
    subBlocks.clear()
    tools.clear()
    containers.clear()
  }

  return { handle, settleStreams, fold, markAttention, adoptTool, reset, interruptAgents }
}

/**
 * 跟随一条事件流时的位置：当前回合、已处理到的 sequence、最近一次 run_started 的位置。
 * 去重按「当前跟随的 turn_id + sequence」：不大于已处理最大值的帧丢弃。
 * run_snapshot 以快照覆盖到的位置为准（可能为 0）；run_switched 换回合后 sequence 从头计。
 */
export interface StreamCursor {
  readonly turnId: string | null
  /** 已处理的最大 sequence；还没处理任何帧时为 null。 */
  readonly sequence: number | null
  /** 紧挨着 run_resumed 的那帧 run_started 的位置，续跑折叠的 start。 */
  readonly runStartedAt: number | null
  /** 换到另一个回合跟随，sequence 重新计。 */
  follow(turnId: string): void
  /** 这一帧是否要处理；顺带记下回合与位置。 */
  accept(ev: SseEvent): boolean
}

export function createStreamCursor(initialTurnId: string | null = null): StreamCursor {
  let turnId = initialTurnId
  let sequence: number | null = null
  let runStartedAt: number | null = null

  function follow(next: string) {
    if (next === turnId) return
    turnId = next
    sequence = null
    runStartedAt = null
  }

  return {
    get turnId() { return turnId },
    get sequence() { return sequence },
    get runStartedAt() { return runStartedAt },
    follow,
    accept(ev) {
      if (ev.type === 'input_queued' && ev.turn_id) {
        follow(ev.turn_id)
        return true
      }
      if (ev.type === 'run_switched' && ev.turn_id) {
        // 换到后继回合，即使 turn_id 碰巧相同也从头计。
        turnId = ev.turn_id
        sequence = null
        runStartedAt = null
        return true
      }
      if (ev.type === 'run_snapshot') {
        if (ev.turn_id) follow(ev.turn_id)
        sequence = typeof ev.sequence === 'number' ? ev.sequence : null
        return true
      }
      if (typeof ev.sequence !== 'number') return true
      if (ev.type === 'run_started' && ev.turn_id) follow(ev.turn_id)
      if (sequence != null && ev.sequence <= sequence) return false
      sequence = ev.sequence
      if (ev.type === 'run_started') runStartedAt = ev.sequence
      return true
    },
  }
}

function snapshotRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function snapshotList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

type Emit = (event: SseEvent) => void
/** 给回放出来的事件补上主线或子运行的外层字段。 */
type Wrap = (event: SseEvent) => SseEvent

/**
 * 把快照里的一个块折成 block_* / tool_* 事件；wrap 给事件补上主线或子运行的外层字段。
 * 块对象与主线同名事件一致：kind 是 thinking / text / tool_use，工具结果在 result 上自带位置。
 */
function replayBlock(block: Record<string, unknown>, emit: Emit, wrap: Wrap) {
  const index = Number(block.index ?? 0)
  const kind = block.kind
  const at = Number(block.sequence ?? 0)
  if (kind === 'thinking' || kind === 'text') {
    emit(wrap({ type: 'block_start', sequence: at, block: { index, block_type: kind } }))
    if (typeof block.text === 'string' && block.text) {
      emit(wrap({
        type: kind === 'thinking' ? 'thinking_delta' : 'text_delta', sequence: at, block: { index }, text: block.text,
      }))
    }
    if (block.closed !== false) emit(wrap({ type: 'block_stop', sequence: at, block: { index } }))
    return
  }
  if (kind !== 'tool_use') return
  const tool = snapshotRecord(block.tool)
  if (!tool) return
  const toolId = typeof tool.id === 'string' ? tool.id : `snapshot-tool-${index}`
  const toolName = typeof tool.name === 'string' ? tool.name : 'tool'
  emit(wrap({
    type: 'tool_use', sequence: at,
    tool: {
      id: toolId,
      name: toolName,
      input: snapshotRecord(tool.input) ?? {},
      ...(typeof tool.source === 'string' ? { source: tool.source } : {}),
    },
  }))
  const result = snapshotRecord(block.result)
  if (!result) return
  emit(wrap({
    type: 'tool_result', sequence: Number(block.result_sequence ?? block.sequence ?? 0),
    tool: {
      id: typeof result.id === 'string' ? result.id : toolId,
      name: typeof result.name === 'string' ? result.name : toolName,
      output: typeof result.output === 'string' ? result.output : '',
      is_error: result.is_error === true,
    },
  }))
}

/** 快照里的一条错误 → error 事件；子运行错误的外层由调用方补齐。 */
function replayErrors(rawErrors: unknown[], emit: Emit, wrap: Wrap) {
  for (const raw of rawErrors) {
    const item = snapshotRecord(raw)
    const error = snapshotRecord(item?.error)
    if (!error) continue
    emit(wrap({
      type: 'error', sequence: Number(item?.sequence ?? 0),
      error: {
        code: typeof error.code === 'string' ? error.code : 'ERROR',
        message: typeof error.message === 'string' ? error.message : '执行失败',
        retriable: error.retriable === true, fatal: error.fatal === true,
      },
    }))
  }
}

/**
 * 把 run_snapshot.state 折成 reducer 能理解的事件，主线与子运行共用一套：
 * - main：读 main.blocks，块带 segment，换段时补一帧 turn_start（index 从 0 重新计）；
 * - sub_runs：读 sub_runs[].blocks，按 sub_run_id 分面板，块没有 segment；
 * - errors：只放主线错误；子运行的错误在各自 sub_runs[].errors 里。
 * 队友激活流的快照只有主线，sub_runs 为空。
 */
export function replaySnapshot(
  snapshot: Record<string, unknown>,
  handle: (event: SseEvent) => void,
  sessionId: number,
  turnId: string,
) {
  const main = snapshotRecord(snapshot.main)
  if (main) {
    const mainWrap: Wrap = (ev) => ({ ...ev, session_id: sessionId, turn_id: turnId })
    let segment: number | null = null
    for (const rawBlock of snapshotList(main.blocks)) {
      const block = snapshotRecord(rawBlock)
      if (!block) continue
      const at = Number(block.segment ?? 0)
      if (at !== segment) {
        handle({ type: 'turn_start', sequence: 0, session_id: sessionId, turn_id: turnId })
        segment = at
      }
      replayBlock(block, handle, mainWrap)
    }
    if (main.in_turn !== true) {
      handle({ type: 'turn_end', sequence: 0, session_id: sessionId, turn_id: turnId })
    }
  }

  for (const rawRun of snapshotList(snapshot.sub_runs)) {
    const run = snapshotRecord(rawRun)
    const subRunId = typeof run?.sub_run_id === 'string' ? run.sub_run_id : null
    if (!run || !subRunId) continue
    const outer = {
      type: 'subagent_event' as const,
      session_id: sessionId,
      turn_id: turnId,
      parent_id: typeof run.parent_id === 'string' ? run.parent_id : null,
      sub_run_id: subRunId,
      agent_id: typeof run.agent_id === 'number' ? run.agent_id : null,
      agent_name: typeof run.agent_name === 'string' ? run.agent_name : '',
    }
    const subWrap: Wrap = (ev) => ({ ...ev, ...outer, sub_type: ev.type })
    handle({ ...outer, sub_type: 'turn_start', sequence: 0, ...(typeof run.task === 'string' ? { task: run.task } : {}) })
    for (const rawBlock of snapshotList(run.blocks)) {
      const block = snapshotRecord(rawBlock)
      if (!block) continue
      replayBlock(block, handle, subWrap)
    }
    if (run.in_turn !== true) handle({ ...outer, sub_type: 'turn_end', sequence: 0 })
    replayErrors(snapshotList(run.errors), handle, (ev) => ({ ...ev, ...outer, sub_type: 'error' }))
  }

  replayErrors(snapshotList(snapshot.errors), handle, (ev) => ({ ...ev, session_id: sessionId, turn_id: turnId }))
}
