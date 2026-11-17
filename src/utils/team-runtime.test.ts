import { describe, expect, it } from 'vitest'
import type { TeamActivationResponse, TeamMemberResponse, TeamMessageResponse } from '../interfaces/console/runtime'
import {
  buildTeamTimeline,
  inboxHeadingText,
  isTeamInboxText,
  latestActivation,
  memberDisplayStatus,
  parseTeamInbox,
} from './team-runtime'

function member(overrides: Partial<TeamMemberResponse> = {}): TeamMemberResponse {
  return {
    id: 1, session_id: 42, team_id: 3, name: 'writer', role: '撰写初稿', status: 'idle',
    agent_type: null, agent_id: 9, prompt: null, activation_id: null,
    created_at: '2026-11-15T00:00:00Z', updated_at: '2026-11-15T00:00:00Z',
    ...overrides,
  }
}

function activation(overrides: Partial<TeamActivationResponse> = {}): TeamActivationResponse {
  return {
    id: 'a-1', session_id: 42, member_id: 1, status: 'running', error_message: null,
    created_at: '2026-11-15T00:00:00Z', finished_at: null,
    ...overrides,
  }
}

function message(overrides: Partial<TeamMessageResponse> = {}): TeamMessageResponse {
  return {
    id: 1, session_id: 42, sender: 'lead', recipient: 'writer', message_type: 'message', content: '开始写',
    request_id: null, read_at: null, created_at: '2026-11-15T01:00:00Z',
    ...overrides,
  }
}

describe('解析 <team-inbox> 消息', () => {
  const inbox = '<team-inbox>\n[消息来自 reviewer] 第二节有两处事实需要核对\n\n[writer 已转为空闲] 初稿已完成\n共 3 节\n</team-inbox>\n以上是队友发来的消息。需要回复或分派时用 SendMessage；队友都已完成时直接给出结论。'

  it('按方括号标头切成条目，只取两个标签之间的正文', () => {
    expect(isTeamInboxText(inbox)).toBe(true)
    expect(parseTeamInbox(inbox)).toEqual([
      { heading: '消息来自 reviewer', body: '第二节有两处事实需要核对' },
      { heading: 'writer 已转为空闲', body: '初稿已完成\n共 3 节' },
    ])
  })

  it('不是团队消息时返回 null；切不出标头时整段作为一条', () => {
    expect(parseTeamInbox('帮我写一份周报')).toBeNull()
    expect(parseTeamInbox('<team-inbox>\n没有标头的正文\n</team-inbox>')).toEqual([{ heading: '', body: '没有标头的正文' }])
  })

  it('关停请求的标头去掉 request_id', () => {
    expect(inboxHeadingText('关停请求来自 lead，request_id=6f1c')).toBe('关停请求来自 lead')
    expect(inboxHeadingText('writer 已转为空闲')).toBe('writer 已转为空闲')
  })
})

describe('成员状态文案', () => {
  it('working 有运行中的激活为运行中，没有为排队中', () => {
    expect(memberDisplayStatus(member({ status: 'working' }), activation()).label).toBe('运行中')
    expect(memberDisplayStatus(member({ status: 'working' }), activation({ status: 'completed' })).label).toBe('排队中')
    expect(memberDisplayStatus(member({ status: 'working' }), null).label).toBe('排队中')
  })

  it('idle 为空闲，shutdown 为已关停，最近一次激活失败时带上原因', () => {
    expect(memberDisplayStatus(member(), null)).toEqual({ tone: 'idle', label: '空闲', error: null })
    expect(memberDisplayStatus(member({ status: 'shutdown' }), null).label).toBe('已关停')
    expect(memberDisplayStatus(member(), activation({ status: 'failed', error_message: 'Agent已停用' })).error).toBe('Agent已停用')
  })

  it('最近一次激活优先按成员上的 activation_id 找，找不到时取该成员最新的一条', () => {
    const list = [activation({ id: 'a-3', member_id: 2 }), activation({ id: 'a-2' }), activation({ id: 'a-1' })]
    expect(latestActivation(member({ activation_id: 'a-1' }), list)?.id).toBe('a-1')
    expect(latestActivation(member({ activation_id: 'gone' }), list)?.id).toBe('a-2')
  })
})

describe('团队消息时间线', () => {
  it('按时间排序，同一次广播合并成一条「→ 全体」', () => {
    const items = buildTeamTimeline([
      message({ id: 3, sender: 'writer', recipient: 'lead', message_type: 'idle_notification', content: '初稿已完成', created_at: '2026-11-15T01:05:00Z' }),
      message({ id: 1, message_type: 'broadcast', recipient: 'writer', content: '开工', created_at: '2026-11-15T01:00:00.100Z' }),
      message({ id: 2, message_type: 'broadcast', recipient: 'reviewer', content: '开工', created_at: '2026-11-15T01:00:00.200Z' }),
    ])
    expect(items.map((item) => [item.sender, item.recipient, item.type])).toEqual([
      ['lead', '全体', 'broadcast'],
      ['writer', 'lead', 'idle_notification'],
    ])
  })

  it('关停请求按 request_id 配上回应，标出已批准、已拒绝、等待回应', () => {
    const items = buildTeamTimeline([
      message({ id: 1, message_type: 'shutdown_request', recipient: 'writer', request_id: 'r-1', content: '收工' }),
      message({ id: 2, sender: 'writer', recipient: 'lead', message_type: 'shutdown_response', request_id: 'r-1', content: '同意关停：已完成', created_at: '2026-11-15T01:01:00Z' }),
      message({ id: 3, message_type: 'shutdown_request', recipient: 'reviewer', request_id: 'r-2', content: '收工', created_at: '2026-11-15T01:02:00Z' }),
      message({ id: 4, sender: 'reviewer', recipient: 'lead', message_type: 'shutdown_response', request_id: 'r-2', content: '拒绝关停：还在核对', created_at: '2026-11-15T01:03:00Z' }),
      message({ id: 5, message_type: 'shutdown_request', recipient: 'editor', request_id: 'r-3', content: '收工', created_at: '2026-11-15T01:04:00Z' }),
    ])
    expect(items.filter((item) => item.type === 'shutdown_request').map((item) => item.shutdown)).toEqual(['approved', 'rejected', 'pending'])
  })
})
