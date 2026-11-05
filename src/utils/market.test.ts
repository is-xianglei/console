import { describe, expect, it } from 'vitest'
import type {
  MarketInstallPreview,
  MarketInstallReport,
  MarketInstalledTarget,
  MarketListing,
  MarketListingDetail,
  MarketMyListingItem,
  MarketVersion,
} from '../interfaces/market/model'
import {
  buildInstalledQuery,
  buildListingQuery,
  formatByteSize,
  getCategoryLabel,
  getInstallActionState,
  getInstallUnavailableText,
  getInstalledFromLabel,
  getListingDisplayName,
  getPendingVersion,
  getReportGroupVisibility,
  getSkillFileSize,
  getSnapshotName,
  getSnapshotSkills,
  isChangedMarketSkill,
  isMarketWriter,
} from './market'

function listing(overrides: Partial<MarketListing> = {}): MarketListing {
  return {
    id: 1,
    kind: 'agent',
    is_official: false,
    official_key: null,
    publisher_workspace_id: 3,
    source_agent_id: 11,
    source_skill_id: null,
    status: 'listed',
    status_reason: null,
    current_version_number: 1,
    name: '数据分析助手',
    summary: '分析表格数据',
    category: 'data',
    created_by_user_id: 2,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...overrides,
  }
}

function version(id: number, status: MarketVersion['status']): MarketVersion {
  return {
    id,
    listing_id: 1,
    version_number: id,
    name: `数据分析助手 v${id}`,
    status,
    category: 'data',
    release_note: null,
    snapshot_hash: `hash-${id}`,
    submitted_by_user_id: 2,
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_comment: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  }
}

function preview(overrides: Partial<MarketInstallPreview> = {}): MarketInstallPreview {
  return {
    mode: 'install',
    installed_version_number: null,
    target_version_number: 2,
    can_proceed: true,
    blockers: [],
    agent_name_conflict: false,
    report: { bound_tool_keys: [], dropped_tools: [], skills: [] },
    ...overrides,
  }
}

function detail(installPreview: MarketInstallPreview | null): MarketListingDetail {
  return {
    listing: {
      id: 1,
      kind: 'agent',
      name: '数据分析助手',
      summary: null,
      category: 'data',
      is_official: false,
      status: installPreview ? 'listed' : 'delisted',
      status_reason: null,
      current_version_number: 2,
      publisher_name: '个人工作区',
      install_count: 0,
      installed: false,
      installed_version_number: null,
      has_update: false,
      updated_at: '2026-11-01T00:00:00Z',
    },
    status: installPreview ? 'listed' : 'delisted',
    status_reason: null,
    current_version: null,
    install_preview: installPreview,
  }
}

describe('isMarketWriter', () => {
  it('只有工作区所有者和管理员能上架、安装', () => {
    expect(isMarketWriter('owner')).toBe(true)
    expect(isMarketWriter('admin')).toBe(true)
    expect(isMarketWriter('member')).toBe(false)
    expect(isMarketWriter(undefined)).toBe(false)
  })
})

describe('buildListingQuery', () => {
  it('页码换算成 offset，「不限」的条件不传', () => {
    expect(buildListingQuery({ kind: 'all', category: 'all', keyword: '  ', official: false, page: 3, pageSize: 12 })).toEqual({
      limit: 12,
      offset: 24,
    })
  })

  it('带上类型、分类、去掉首尾空白的关键词和仅官方', () => {
    const filters = { kind: 'skill' as const, category: 'coding', keyword: ' 爬虫 ', official: true, page: 1, pageSize: 24 }
    expect(buildListingQuery(filters)).toEqual({
      limit: 24,
      offset: 0,
      kind: 'skill',
      category: 'coding',
      keyword: '爬虫',
      is_official: true,
    })
  })

  it('非法页码按第 1 页处理', () => {
    expect(buildListingQuery({ kind: 'all', category: 'all', keyword: '', official: false, page: 0, pageSize: 12 }).offset).toBe(0)
  })
})

describe('buildInstalledQuery', () => {
  it('「已安装」只传 installed，页码换算成 offset', () => {
    expect(buildInstalledQuery({ onlyUpdates: false, page: 2, pageSize: 12 })).toEqual({
      limit: 12,
      offset: 12,
      installed: true,
    })
  })

  it('「版本更新」只传 has_update，非法页码按第 1 页处理', () => {
    expect(buildInstalledQuery({ onlyUpdates: true, page: 0, pageSize: 24 })).toEqual({
      limit: 24,
      offset: 0,
      has_update: true,
    })
  })
})

describe('getCategoryLabel', () => {
  const categories = [{ key: 'data', label: '数据分析' }]

  it('已知分类显示中文名，未知或未加载时原样显示 key', () => {
    expect(getCategoryLabel(categories, 'data')).toBe('数据分析')
    expect(getCategoryLabel(categories, 'other')).toBe('other')
    expect(getCategoryLabel([], 'data')).toBe('data')
    expect(getCategoryLabel(categories, null)).toBe('')
  })
})

describe('快照解析', () => {
  const skillSnapshot = { name: 'csv-reader', content: '---\nname: csv-reader\n---\n正文', extra_files: {}, skill_hash: 'h1' }

  it('Agent 快照取 agent.name，Skill 列表是它绑定的 Skill', () => {
    const snapshot = {
      agent: { name: '数据分析助手', description: null, system_prompt: '你是助手', tool_keys: ['Read'] },
      skills: [skillSnapshot],
    }
    expect(getSnapshotName(snapshot)).toBe('数据分析助手')
    expect(getSnapshotSkills(snapshot)).toEqual([skillSnapshot])
  })

  it('Skill 快照取 skill.name，Skill 列表就是它自己', () => {
    const snapshot = { skill: skillSnapshot }
    expect(getSnapshotName(snapshot)).toBe('csv-reader')
    expect(getSnapshotSkills(snapshot)).toEqual([skillSnapshot])
  })
})

describe('附带文件大小', () => {
  it('文本按 UTF-8 字节数计算', () => {
    expect(getSkillFileSize({ encoding: 'utf-8', content: 'ab中' })).toBe(5)
  })

  it('base64 按解码后的字节数计算', () => {
    // "hello" 的 base64 是 aGVsbG8=
    expect(getSkillFileSize({ encoding: 'base64', content: 'aGVsbG8=' })).toBe(5)
    expect(getSkillFileSize({ encoding: 'base64', content: 'aGk=' })).toBe(2)
    expect(getSkillFileSize({ encoding: 'base64', content: 'YWJj' })).toBe(3)
  })

  it('格式化为 B / KB / MB', () => {
    expect(formatByteSize(512)).toBe('512 B')
    expect(formatByteSize(2048)).toBe('2.0 KB')
    expect(formatByteSize(3 * 1024 * 1024)).toBe('3.00 MB')
  })
})

describe('我的上架', () => {
  const items: MarketMyListingItem[] = [
    { listing: listing({ id: 1, kind: 'agent', source_agent_id: 11 }), versions: [version(2, 'pending'), version(1, 'approved')] },
    { listing: listing({ id: 2, kind: 'skill', source_agent_id: null, source_skill_id: 11 }), versions: [version(3, 'rejected')] },
  ]

  it('找出待审版本，没有时为空', () => {
    expect(getPendingVersion(items[0].versions)?.id).toBe(2)
    expect(getPendingVersion(items[1].versions)).toBeNull()
  })

  it('条目有名称时用条目名称', () => {
    expect(getListingDisplayName(listing(), [version(2, 'pending'), version(1, 'approved')])).toBe('数据分析助手')
  })

  it('首次审核通过前条目没有名称，用最新版本的名称', () => {
    const unnamed = listing({ name: null, current_version_number: null, status: 'unlisted' })
    expect(getListingDisplayName(unnamed, [version(2, 'pending'), version(1, 'rejected')])).toBe('数据分析助手 v2')
  })

  it('版本被撤回或驳回后同样用最新版本的名称', () => {
    const unnamed = listing({ name: null, current_version_number: null, status: 'unlisted' })
    expect(getListingDisplayName(unnamed, [version(3, 'withdrawn')])).toBe('数据分析助手 v3')
    expect(getListingDisplayName(unnamed, [version(4, 'rejected'), version(3, 'withdrawn')])).toBe('数据分析助手 v4')
  })
})

describe('getInstallActionState', () => {
  it('可以安装时按钮可点', () => {
    expect(getInstallActionState(detail(preview()), true)).toEqual({ label: '安装', disabled: false, reason: '' })
  })

  it('已安装时按钮变为升级到目标版本', () => {
    const state = getInstallActionState(detail(preview({ mode: 'upgrade', installed_version_number: 1 })), true)
    expect(state?.label).toBe('升级到 v2')
    expect(state?.disabled).toBe(false)
  })

  it('有阻断项时禁用，并用后端的说明作为原因', () => {
    const blocked = preview({ can_proceed: false, blockers: ['本工作区已有同名 Agent: 助手', '本工作区已有同名但内容不同的 Skill: csv'] })
    expect(getInstallActionState(detail(blocked), true)).toEqual({
      label: '安装',
      disabled: true,
      reason: '本工作区已有同名 Agent: 助手；本工作区已有同名但内容不同的 Skill: csv',
    })
  })

  it('没有写权限时禁用，优先提示权限', () => {
    const blocked = preview({ can_proceed: false, blockers: ['本工作区已有同名 Agent: 助手'] })
    const state = getInstallActionState(detail(blocked), false)
    expect(state?.disabled).toBe(true)
    expect(state?.reason).toBe('仅工作区所有者或管理员可以安装或升级')
  })

  it('已是最新版本时按钮直接说明状态', () => {
    const latest = preview({ mode: 'upgrade', installed_version_number: 2, target_version_number: 2, can_proceed: false, blockers: ['已是最新版本'] })
    expect(getInstallActionState(detail(latest), true)).toEqual({ label: '已是最新版本', disabled: true, reason: '' })
  })

  it('没有预览（条目不是已上架状态）时不显示安装、升级按钮', () => {
    expect(getInstallActionState(detail(null), true)).toBeNull()
  })
})

describe('getInstallUnavailableText', () => {
  it('作者下架和平台下架都提示已下架', () => {
    expect(getInstallUnavailableText('delisted')).toBe('条目已下架，不能安装或升级')
    expect(getInstallUnavailableText('removed')).toBe('条目已下架，不能安装或升级')
  })

  it('还没上架过的条目提示未上架', () => {
    expect(getInstallUnavailableText('unlisted')).toBe('条目未上架，不能安装或升级')
  })
})

describe('getInstalledFromLabel', () => {
  function target(overrides: Partial<MarketInstalledTarget> = {}): MarketInstalledTarget {
    return {
      listing_id: 7,
      listing_name: '数据分析助手',
      listing_status: 'listed',
      installed_version_number: 2,
      installed_with_agent: false,
      ...overrides,
    }
  }

  it('直接安装的对象显示来源条目名称', () => {
    expect(getInstalledFromLabel(target())).toBe('来自应用市场：数据分析助手')
  })

  it('随 Agent 装来的托管 Skill 说明是跟着哪个 Agent 来的', () => {
    expect(getInstalledFromLabel(target({ installed_with_agent: true }))).toBe('来自应用市场：随 Agent「数据分析助手」安装')
  })
})

function report(overrides: Partial<MarketInstallReport> = {}): MarketInstallReport {
  return { bound_tool_keys: [], dropped_tools: [], skills: [], ...overrides }
}

describe('isChangedMarketSkill', () => {
  it('只有覆盖和解绑算改动了本地已有的 Skill', () => {
    expect(isChangedMarketSkill({ name: 'csv', action: 'overwrite', skill_id: 1 })).toBe(true)
    expect(isChangedMarketSkill({ name: 'csv', action: 'unbind', skill_id: 1 })).toBe(true)
    expect(isChangedMarketSkill({ name: 'csv', action: 'create', skill_id: null })).toBe(false)
    expect(isChangedMarketSkill({ name: 'csv', action: 'reuse', skill_id: 1 })).toBe(false)
  })
})

describe('getReportGroupVisibility', () => {
  it('Agent 只有覆盖类 Skill 时不显示空的「Skill」分组', () => {
    const onlyOverwrite = report({ skills: [{ name: 'csv', action: 'overwrite', skill_id: 1 }] })
    expect(getReportGroupVisibility(onlyOverwrite, 'agent')).toEqual({ tools: true, skills: false, changedSkills: true })
  })

  it('Agent 只有解绑类 Skill 时同样不显示「Skill」分组', () => {
    const onlyUnbind = report({ skills: [{ name: 'csv', action: 'unbind', skill_id: 1 }] })
    expect(getReportGroupVisibility(onlyUnbind, 'agent')).toEqual({ tools: true, skills: false, changedSkills: true })
  })

  it('两类 Skill 都有时两个分组都显示', () => {
    const mixed = report({
      skills: [
        { name: 'csv', action: 'overwrite', skill_id: 1 },
        { name: 'pdf', action: 'create', skill_id: null },
      ],
    })
    expect(getReportGroupVisibility(mixed, 'agent')).toEqual({ tools: true, skills: true, changedSkills: true })
  })

  it('Agent 一个 Skill 都没有时保留「Skill」分组，内容显示「无」', () => {
    expect(getReportGroupVisibility(report(), 'agent')).toEqual({ tools: true, skills: true, changedSkills: false })
  })

  it('Agent 的工具组总是显示：有绑定、只有丢弃、都没有（显示「无」）', () => {
    const bound = report({ bound_tool_keys: ['web_search'] })
    const dropped = report({ dropped_tools: [{ tool_key: 'shell', reason: 'not_found', message: '本平台没有该工具' }] })
    expect(getReportGroupVisibility(bound, 'agent').tools).toBe(true)
    expect(getReportGroupVisibility(dropped, 'agent').tools).toBe(true)
    expect(getReportGroupVisibility(report(), 'agent').tools).toBe(true)
  })

  it('Skill 条目没有工具组；只有覆盖时只显示「被覆盖或解绑的 Skill」', () => {
    const overwrite = report({ skills: [{ name: 'csv', action: 'overwrite', skill_id: 1 }] })
    expect(getReportGroupVisibility(overwrite, 'skill')).toEqual({ tools: false, skills: false, changedSkills: true })
  })

  it('Skill 条目新建时只显示「Skill」分组', () => {
    const created = report({ skills: [{ name: 'csv', action: 'create', skill_id: null }] })
    expect(getReportGroupVisibility(created, 'skill')).toEqual({ tools: false, skills: true, changedSkills: false })
  })
})
