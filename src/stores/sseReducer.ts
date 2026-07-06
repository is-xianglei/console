import type { ChatBlock, ChatMessage, SubAgent } from '../types'
import type { SseEvent, TaskResponse } from '../api/types'

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
  if (existing) return existing
  const actor = ev.actor!
  t.agents.push({
    id: key,
    pid: actor.run_id ? actor.run_id : actor.name,
    name: actor.task || actor.name,
    icon: iconFor(actor.name, actor.role),
    status: 'queued',
    progress: 0,
    stream: [],
  })
  const proxy = t.agents[t.agents.length - 1]
  // 首个子代理自动选中,方便观察
  if (t.agents.length === 1) t.selectAgent(proxy.id)
  return proxy
}

// PLACEHOLDER_REDUCER
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
  // 子代理当前块映射:agentKey → (index → 'think'|'answer' 累加目标)
  const aBlocks = new Map<string, Map<number, { kind: 'think' | 'answer' }>>()

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
          blocks.push({ kind: 'think', text: '', duration: '思考中…', collapsed: false })
          // 关键:存回 reactive 数组里的代理,而非 push 前的原始字面量,
          // 否则后续 b.text += delta 改的是原始对象,不触发视图更新
          oBlocks.set(ev.block!.index, blocks[blocks.length - 1])
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
          b.duration = '推理完成'
          b.collapsed = true
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

  // PLACEHOLDER_REDUCER2
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
        if (bt === 'thinking') {
          a.stream.push({ kind: 'think', text: '' })
          map.set(ev.block!.index, { kind: 'think' })
          a.status = 'think'
          a.progress = Math.max(a.progress, 30)
        } else if (bt === 'text') {
          a.stream.push({ kind: 'answer', text: '' })
          map.set(ev.block!.index, { kind: 'answer' })
          a.status = 'run'
          a.progress = Math.max(a.progress, 70)
        }
        break
      }
      case 'thinking_delta':
      case 'text_delta': {
        const a = ensureAgent(target, ev)
        const slot = aBlocks.get(key)?.get(ev.block!.index)
        if (!slot) break
        // 取该 kind 的最后一条流项累加
        for (let i = a.stream.length - 1; i >= 0; i--) {
          const it = a.stream[i]
          if (it.kind === slot.kind) {
            it.text += ev.text ?? ''
            break
          }
        }
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
        a.status = 'done'
        a.progress = 100
        break
      }
      case 'error': {
        const a = ensureAgent(target, ev)
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

  return { handle }
}

