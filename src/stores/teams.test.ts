import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { MAX_CONCURRENCY, MIN_TEAM_MEMBERS } from '../interfaces/platform-team/model'
import { MAX_TEAM_TIMEOUT_SECONDS, MIN_TEAM_TIMEOUT_SECONDS, toRow, useTeamsStore, validateTeam } from './teams'

describe('teams store 播种与转换', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('首次访问用目录数据播种，且只播种一次', () => {
    const store = useTeamsStore()
    store.ensureLoaded()
    const first = store.state.items.length
    expect(first).toBeGreaterThan(0)

    store.ensureLoaded()
    expect(store.state.items.length).toBe(first)
  })

  it('从目录行转换出的成员数与该行的「N Agents」一致', () => {
    const store = useTeamsStore()
    store.ensureLoaded()
    // 目录里三个 Team 分别是 5 / 4 / 6 个成员。
    expect(store.state.items.map((item) => item.members.length).sort((a, b) => a - b)).toEqual([4, 5, 6])
  })

  it('未指派的成员留空 agentName，不编造占位名', () => {
    const store = useTeamsStore()
    store.ensureLoaded()
    const team = store.state.items.find((item) => item.members.length > 1)!
    // 目录只有入口 Agent 的实名，其余成员保持未指派。
    expect(team.members[0]!.agentName).not.toBe('')
    expect(team.members.slice(1).every((member) => member.agentName === '')).toBe(true)
  })

  it('toRow 把编辑结果回写成列表可用的展示值', () => {
    const store = useTeamsStore()
    const draft = store.createDraft()
    draft.name = '回归测试 Team'
    draft.mode = 'pipeline'
    draft.members = [
      { agentId: '1', agentName: '甲 Agent', duty: '', isEntry: true },
      { agentId: '2', agentName: '乙 Agent', duty: '', isEntry: false },
    ]
    draft.entryIndex = 1

    const row = toRow(draft)
    expect(row.values[0]).toBe('流水线')
    expect(row.values[1]).toBe('乙 Agent')
    expect(row.values[2]).toBe('2 Agents')
  })

  it('setStatus 只改动目标 Team', () => {
    const store = useTeamsStore()
    store.ensureLoaded()
    const [first, second] = store.state.items
    store.setStatus(first!.id, 'error')
    expect(first!.status).toBe('error')
    expect(second!.status).not.toBe('error')
  })
})

describe('validateTeam 校验', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function draftWithMembers(count: number) {
    const store = useTeamsStore()
    const draft = store.createDraft()
    draft.name = '校验用 Team'
    draft.members = Array.from({ length: count }, (_, index) => ({
      agentId: String(index + 1),
      agentName: `Agent ${index + 1}`,
      duty: '',
      isEntry: index === 0,
    }))
    draft.entryIndex = count ? 0 : -1
    return draft
  }

  it('名称非空且成员达标时通过', () => {
    expect(validateTeam(draftWithMembers(MIN_TEAM_MEMBERS))).toHaveLength(0)
  })

  it('成员不足时给出 members 区块问题', () => {
    const issues = validateTeam(draftWithMembers(1))
    expect(issues.some((issue) => issue.section === 'members')).toBe(true)
  })

  it('重名成员被拒', () => {
    const draft = draftWithMembers(2)
    draft.members[1]!.agentName = draft.members[0]!.agentName
    expect(validateTeam(draft).some((issue) => issue.message.includes('重复'))).toBe(true)
  })

  it('未指定入口时给出提示', () => {
    const draft = draftWithMembers(2)
    draft.entryIndex = -1
    expect(validateTeam(draft).some((issue) => issue.message.includes('入口'))).toBe(true)
  })

  it('并发上限越界归到 runtime 区块', () => {
    const draft = draftWithMembers(2)
    draft.concurrency = MAX_CONCURRENCY + 1
    const issues = validateTeam(draft)
    expect(issues.some((issue) => issue.section === 'runtime')).toBe(true)
  })

  it('每条 issue 都带 field，且 field 与 section 对应（不靠消息文本区分）', () => {
    const draft = draftWithMembers(0)
    draft.name = ''
    draft.concurrency = MAX_CONCURRENCY + 1
    draft.timeoutSeconds = MAX_TEAM_TIMEOUT_SECONDS + 1
    const pairs = validateTeam(draft).map((issue) => `${issue.section}:${issue.field}`)
    expect(pairs).toEqual(['basic:name', 'members:members', 'runtime:concurrency', 'runtime:timeoutSeconds'])
  })

  it('超时边界值通过校验，越界给出 timeoutSeconds 问题', () => {
    const draft = draftWithMembers(2)
    draft.timeoutSeconds = MIN_TEAM_TIMEOUT_SECONDS
    expect(validateTeam(draft)).toHaveLength(0)
    draft.timeoutSeconds = MIN_TEAM_TIMEOUT_SECONDS - 1
    expect(validateTeam(draft).map((issue) => issue.field)).toEqual(['timeoutSeconds'])
  })
})
