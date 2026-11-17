import type {
  ChatBlock,
  ChatMessage,
  SseEvent,
  SseWorkflowProgress,
  StreamEvent,
  SubAgent,
  TaskResponse,
} from '../interfaces/console/model'
import { mcpToolRef, mergeFaults } from './mcp-tool'

/** 中间对话区与子代理面板共用的推理块、回答块形状 */
type ThinkItem = Extract<ChatBlock | StreamEvent, { kind: 'think' }>
type AnswerItem = Extract<ChatBlock | StreamEvent, { kind: 'answer' }>
type ToolItem = Extract<ChatBlock | StreamEvent, { kind: 'tool' }>

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

/** 工具调用的归属范围。相同 tool.id 可能同时出现在主 Agent 和多个子 Agent 中。 */
function eventScope(ev: SseEvent): string {
  const actor = ev.actor
  if (!actor || actor.role === 'orchestrator') return 'orchestrator'
  return `${actor.role}:${agentKey(ev)}`
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

/**
 * 创建一个有状态的 SSE 归约器。内部维护"块索引 → 块对象"的映射,
 * 把增量事件累加到对应块。orchestrator → AI 消息 blocks;
 * subagent/teammate → 右栏对应面板 stream。
 */
export function createSseReducer(target: SseTarget) {
  // orchestrator 当前轮的块映射:block.index → ChatBlock 引用
  const oBlocks = new Map<number, ChatBlock>()
  // 子代理当前块映射:actor scope → (index → 面板 stream 里的累加目标,存 reactive 代理)
  const aBlocks = new Map<string, Map<number, ThinkItem | AnswerItem>>()
  // 工具卡按 scope + tool.id 建索引，不能再按“最近一个未完成卡片”猜测归属。
  const tools = new Map<string, Map<string, ToolItem>>()
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

  function rememberTool(ev: SseEvent, item: ToolItem) {
    const id = ev.tool?.id
    if (!id) return
    const scope = eventScope(ev)
    const scoped = tools.get(scope) ?? new Map<string, ToolItem>()
    scoped.set(id, item)
    tools.set(scope, scoped)
  }

  /**
   * 优先按 actor scope 精确查找；只有事件缺 actor 且全局只有一个同 id 卡片时才兼容旧流。
   * 如果同 id 同时存在于多个 scope，宁可不更新也不能把结果写入错误面板。
   */
  function findTool(ev: SseEvent): ToolItem | undefined {
    const id = ev.tool?.id
    if (!id) return undefined

    const scoped = tools.get(eventScope(ev))
    const exact = scoped?.get(id)
    if (exact && !exact.done) return exact
    // 已带 actor 的结果找不到精确卡片时不能跨面板猜测，避免重复结果污染其他 Agent。
    if (ev.actor) return undefined

    const candidates: ToolItem[] = []
    for (const candidateScope of tools.values()) {
      const candidate = candidateScope.get(id)
      if (candidate && !candidate.done) candidates.push(candidate)
    }
    return candidates.length === 1 ? candidates[0] : undefined
  }

  function forgetTool(ev: SseEvent, item: ToolItem) {
    const id = ev.tool?.id
    if (!id) return
    const scope = eventScope(ev)
    const scoped = tools.get(scope)
    if (scoped?.get(id) === item) {
      scoped.delete(id)
      if (!scoped.size) tools.delete(scope)
      return
    }
    // actor 缺失时 findTool 可能走了唯一候选兼容路径，按对象身份清理其真实 scope。
    for (const [candidateScope, candidateMap] of tools) {
      if (candidateMap.get(id) === item) {
        candidateMap.delete(id)
        if (!candidateMap.size) tools.delete(candidateScope)
        return
      }
    }
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

    // 作用域工具来源故障(会话级,不带 actor):放进当前回复最上面的提示块,同来源同故障去重。
    if (ev.type === 'tool_sources') {
      const faults = ev.data?.faults ?? []
      if (!faults.length) return
      const blocks = target.ai.blocks!
      const existing = blocks.find((block) => block.kind === 'sources')
      if (existing?.kind === 'sources') existing.faults = mergeFaults(existing.faults, faults)
      else blocks.unshift({ kind: 'sources', faults: mergeFaults([], faults) })
      return
    }

    // Workflow 进度事件:必须在 actor.role 分流前早退。它的 actor 是 orchestrator,
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
        const card: Extract<ChatBlock, { kind: 'tool' }> = {
          kind: 'tool',
          tag: ev.tool?.name === 'Agent' || ev.tool?.name === 'TeamSpawn' ? 'SPAWN' : 'TOOL',
          ...toolCardFields(ev.tool?.name ?? 'tool', ev.tool?.input, ev.tool?.source),
          body: '',
          done: false,
        }
        blocks.push(card)
        // 索引保存响应式数组读回的代理，结果回填才能触发视图更新。
        rememberTool(ev, blocks[blocks.length - 1] as ToolItem)
        break
      }
      case 'tool_result': {
        const b = findTool(ev)
        if (!b || b.kind !== 'tool') break
        const card = b as Extract<ChatBlock, { kind: 'tool' }>
        card.done = true
        card.tag = ev.tool?.is_error ? 'ERROR' : 'RESULT'
        card.body = typeof ev.tool?.output === 'string' ? ev.tool.output : ''
        forgetTool(ev, b)
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
    const scope = eventScope(ev)
    switch (ev.type) {
      case 'turn_start': {
        const a = ensureAgent(target, ev)
        a.status = 'think'
        a.progress = 10
        aBlocks.set(scope, new Map())
        break
      }
      case 'block_start': {
        const a = ensureAgent(target, ev)
        const bt = ev.block?.block_type
        const map = aBlocks.get(scope) ?? new Map()
        aBlocks.set(scope, map)
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
        const slot = aBlocks.get(scope)?.get(ev.block!.index)
        if (!slot) break
        slot.text += ev.text ?? ''
        break
      }
      case 'block_stop': {
        const slot = aBlocks.get(scope)?.get(ev.block!.index)
        if (slot) settleItem(slot)
        break
      }
      case 'tool_use': {
        const a = ensureAgent(target, ev)
        a.status = 'run'
        a.progress = Math.max(a.progress, 50)
        const item: Extract<StreamEvent, { kind: 'tool' }> = {
          kind: 'tool',
          ...toolCardFields(ev.tool?.name ?? 'tool', ev.tool?.input, ev.tool?.source),
          body: '',
          done: false,
        }
        a.stream.push(item)
        rememberTool(ev, a.stream[a.stream.length - 1] as ToolItem)
        break
      }
      case 'tool_result': {
        const item = findTool(ev)
        if (!item || item.kind !== 'tool') break
        const tool = item as Extract<StreamEvent, { kind: 'tool' }>
        tool.done = true
        tool.body = typeof ev.tool?.output === 'string' ? ev.tool.output : ''
        if (typeof ev.tool?.is_error === 'boolean') tool.is_error = ev.tool.is_error
        forgetTool(ev, item)
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
          is_error: true,
        })
        break
      }
    }
  }

  return { handle, settleStreams }
}

function snapshotRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** 快照里各 actor 的角色；按 actor 过滤时用（lead 回合不再接收队友）。 */
export function snapshotActorRole(raw: unknown): string {
  const actor = snapshotRecord(snapshotRecord(raw)?.actor)
  return typeof actor?.role === 'string' ? actor.role : 'orchestrator'
}

/**
 * 把快照里各 actor 的块折叠成 reducer 能理解的事件（turn_start → 块 → turn_end），
 * 再补上快照记录的错误。lead 回合和队友激活的快照共用这一套。
 */
export function replaySnapshotActors(
  snapshot: Record<string, unknown>,
  handle: (event: SseEvent) => void,
  sessionId: number,
  turnId: string,
  include: (role: string) => boolean = () => true,
) {
  const actors = Array.isArray(snapshot.actors) ? snapshot.actors : []
  for (const raw of actors) {
    const actorState = snapshotRecord(raw)
    const actor = snapshotRecord(actorState?.actor)
    if (!actor) continue
    const actorEvent = {
      role: typeof actor.role === 'string' ? actor.role : 'orchestrator',
      name: typeof actor.name === 'string' ? actor.name : 'Agent',
      ...(typeof actor.run_id === 'string' ? { run_id: actor.run_id } : {}),
      ...(typeof actor.agent_id === 'number' ? { agent_id: actor.agent_id } : {}),
    }
    if (!include(actorEvent.role)) continue
    const blocks = Array.isArray(actorState?.blocks) ? actorState.blocks : []
    handle({ type: 'turn_start', sequence: 0, session_id: sessionId, turn_id: turnId, actor: actorEvent })
    for (const rawBlock of blocks) {
      const block = snapshotRecord(rawBlock)
      if (!block) continue
      const index = Number(block.index ?? 0)
      const kind = block.kind
      if (kind === 'thinking' || kind === 'text') {
        handle({
          type: 'block_start', sequence: Number(block.sequence ?? 0), session_id: sessionId, turn_id: turnId,
          actor: actorEvent, block: { index, block_type: kind },
        })
        if (typeof block.text === 'string' && block.text) {
          handle({
            type: kind === 'thinking' ? 'thinking_delta' : 'text_delta', sequence: Number(block.sequence ?? 0),
            session_id: sessionId, turn_id: turnId, actor: actorEvent, block: { index }, text: block.text,
          })
        }
        if (block.closed !== false) {
          handle({ type: 'block_stop', sequence: Number(block.sequence ?? 0), session_id: sessionId, turn_id: turnId, actor: actorEvent, block: { index } })
        }
      } else if (kind === 'tool_use') {
        const tool = snapshotRecord(block.tool)
        if (!tool) continue
        handle({
          type: 'tool_use', sequence: Number(block.sequence ?? 0), session_id: sessionId, turn_id: turnId,
          actor: actorEvent,
          tool: {
            id: typeof tool.id === 'string' ? tool.id : `snapshot-tool-${index}`,
            name: typeof tool.name === 'string' ? tool.name : 'tool',
            input: snapshotRecord(tool.input) ?? {},
            ...(typeof tool.source === 'string' ? { source: tool.source } : {}),
          },
        })
        const result = snapshotRecord(block.result)
        if (result) {
          handle({
            type: 'tool_result', sequence: Number(block.result_sequence ?? block.sequence ?? 0), session_id: sessionId,
            turn_id: turnId, actor: actorEvent,
            tool: {
              id: typeof result.id === 'string' ? result.id : typeof tool.id === 'string' ? tool.id : `snapshot-tool-${index}`,
              name: typeof result.name === 'string' ? result.name : typeof tool.name === 'string' ? tool.name : 'tool',
              output: typeof result.output === 'string' ? result.output : '',
              is_error: result.is_error === true,
            },
          })
        }
      }
    }
    if (actorState?.in_turn !== true) {
      handle({ type: 'turn_end', sequence: 0, session_id: sessionId, turn_id: turnId, actor: actorEvent })
    }
  }
  if (!Array.isArray(snapshot.errors)) return
  for (const raw of snapshot.errors) {
    const item = snapshotRecord(raw)
    const error = snapshotRecord(item?.error)
    if (!error) continue
    const actor = item?.actor as SseEvent['actor']
    if (!include(actor?.role ?? 'orchestrator')) continue
    handle({
      type: 'error', sequence: Number(item?.sequence ?? 0), session_id: sessionId,
      turn_id: turnId, actor,
      error: {
        code: typeof error.code === 'string' ? error.code : 'ERROR',
        message: typeof error.message === 'string' ? error.message : '执行失败',
        retriable: error.retriable === true, fatal: error.fatal === true,
      },
    })
  }
}
