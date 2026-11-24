/**
 * 会话团队视图的纯函数：解析 <team-inbox> 消息、成员状态文案、团队消息时间线。
 * 后端格式见 AgentOS harness/domain/prompts/team.py。
 */
import type { TeamInboxEntry } from '../interfaces/console/model'
import type {
  TeamActivationResponse,
  TeamMemberResponse,
  TeamMessageResponse,
} from '../interfaces/console/runtime'

const INBOX_OPEN = '<team-inbox>'
const INBOX_CLOSE = '</team-inbox>'
/** 每条队友消息以「[标头] 正文」开头，多条之间空一行。 */
const ENTRY_HEADING = /(?:^|\n\n)\[([^\]\n]+)\] ?/g

export function isTeamInboxText(text: string | null | undefined): boolean {
  return typeof text === 'string' && text.trimStart().startsWith(INBOX_OPEN)
}

/** 取两个标签之间的正文，按「[标头]」切成条目；切不出来时整段作为一条。不是团队消息时返回 null。 */
export function parseTeamInbox(text: string): TeamInboxEntry[] | null {
  if (!isTeamInboxText(text)) return null
  const trimmed = text.trimStart()
  const closeAt = trimmed.indexOf(INBOX_CLOSE)
  const body = trimmed.slice(INBOX_OPEN.length, closeAt >= 0 ? closeAt : undefined).trim()
  if (!body) return []
  const matches = [...body.matchAll(ENTRY_HEADING)]
  if (!matches.length || matches[0]!.index !== 0) return [{ heading: '', body }]
  return matches.map((match, index) => {
    const start = match.index! + match[0].length
    const end = index + 1 < matches.length ? matches[index + 1]!.index! : body.length
    return { heading: match[1]!.trim(), body: body.slice(start, end).trim() }
  })
}

/** 关停请求的标头带 request_id，展示时去掉。 */
export function inboxHeadingText(heading: string): string {
  return heading.replace(/，?\s*request_id=[^\]]*$/, '').trim()
}

export type MemberTone = 'running' | 'queued' | 'idle' | 'shutdown'

export interface MemberDisplayStatus {
  tone: MemberTone
  label: string
  /** 最近一次激活失败时的原因。 */
  error: string | null
}

/** 成员最近一次激活：优先按成员上的 activation_id，找不到时取该成员最新的一条（列表最近的在前）。 */
export function latestActivation(
  member: TeamMemberResponse,
  activations: TeamActivationResponse[],
): TeamActivationResponse | null {
  if (member.activation_id) {
    const current = activations.find((item) => item.id === member.activation_id)
    if (current) return current
  }
  return activations.find((item) => item.member_id === member.id) ?? null
}

/** 最近一次激活的失败原因：执行失败，或结果未知、需要人工处理。 */
function activationError(activation: TeamActivationResponse | null): string | null {
  if (activation?.status === 'failed') return activation.error_message || '运行失败'
  if (activation?.status === 'needs_attention') return activation.error_message || '需要人工处理'
  return null
}

/**
 * working 且有运行中的激活为「运行中」，没有（激活 queued）为「排队中」；shutdown「已关停」；
 * idle 时最近一次激活需要人工处理为「需要人工处理」，否则「空闲」。
 */
export function memberDisplayStatus(
  member: TeamMemberResponse,
  activation: TeamActivationResponse | null,
): MemberDisplayStatus {
  const error = activationError(activation)
  if (member.status === 'shutdown') return { tone: 'shutdown', label: '已关停', error }
  if (member.status === 'working') {
    return activation?.status === 'running'
      ? { tone: 'running', label: '运行中', error: null }
      : { tone: 'queued', label: '排队中', error }
  }
  if (activation?.status === 'needs_attention') return { tone: 'idle', label: '需要人工处理', error }
  return { tone: 'idle', label: '空闲', error }
}

const MESSAGE_TYPE_LABEL: Record<string, string> = {
  message: '消息',
  broadcast: '广播',
  shutdown_request: '关停请求',
  shutdown_response: '关停回应',
  plan_approval_response: '计划批复',
  idle_notification: '结论',
}

export function teamMessageTypeLabel(type: string): string {
  return MESSAGE_TYPE_LABEL[type] ?? type
}

export type ShutdownOutcome = 'approved' | 'rejected' | 'pending'

export interface TeamTimelineItem {
  /** 列表 key：广播合并后取第一行的 id。 */
  key: string
  sender: string
  /** 广播合并后为「全体」。 */
  recipient: string
  type: string
  content: string
  createdAt: string
  /** 只有关停请求有：按 request_id 找到的回应结果。 */
  shutdown?: ShutdownOutcome
}

/** 后端的关停回应正文以「同意关停：」或「拒绝关停：」开头。 */
function shutdownOutcome(response: TeamMessageResponse | undefined): ShutdownOutcome {
  if (!response) return 'pending'
  if (response.content.startsWith('同意关停')) return 'approved'
  if (response.content.startsWith('拒绝关停')) return 'rejected'
  return 'pending'
}

/**
 * 团队消息按时间排成时间线：同一次广播拆成的多行合并成一条「→ 全体」，
 * 关停请求按 request_id 配上回应，标出已批准 / 已拒绝。
 */
export function buildTeamTimeline(messages: TeamMessageResponse[]): TeamTimelineItem[] {
  const sorted = [...messages].sort((left, right) =>
    left.created_at.localeCompare(right.created_at) || left.id - right.id)
  const responses = new Map<string, TeamMessageResponse>()
  for (const message of sorted) {
    if (message.message_type === 'shutdown_response' && message.request_id) responses.set(message.request_id, message)
  }
  const items: TeamTimelineItem[] = []
  const broadcasts = new Map<string, TeamTimelineItem>()
  for (const message of sorted) {
    if (message.message_type === 'broadcast') {
      // 同一次广播：发送方、正文、发送时间（到秒）都相同。
      const groupKey = `${message.sender}|${message.created_at.slice(0, 19)}|${message.content}`
      const existing = broadcasts.get(groupKey)
      if (existing) continue
      const item: TeamTimelineItem = {
        key: `m-${message.id}`, sender: message.sender, recipient: '全体', type: message.message_type,
        content: message.content, createdAt: message.created_at,
      }
      broadcasts.set(groupKey, item)
      items.push(item)
      continue
    }
    const item: TeamTimelineItem = {
      key: `m-${message.id}`, sender: message.sender, recipient: message.recipient, type: message.message_type,
      content: message.content, createdAt: message.created_at,
    }
    if (message.message_type === 'shutdown_request') {
      item.shutdown = shutdownOutcome(message.request_id ? responses.get(message.request_id) : undefined)
    }
    items.push(item)
  }
  return items
}
