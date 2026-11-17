import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../http'
import {
  createTeamDefinition,
  deleteTeamDefinition,
  getTeamDefinitionDetail,
  getTeamDefinitionList,
  updateTeamDefinition,
} from '../http/team-definition'
import type { TeamDefinitionResponse } from '../interfaces/team-definition/api'
import { teamSaveError, useTeamsStore } from './teams'

vi.mock('../http/team-definition', () => ({
  createTeamDefinition: vi.fn(),
  deleteTeamDefinition: vi.fn(),
  getTeamDefinitionDetail: vi.fn(),
  getTeamDefinitionList: vi.fn(),
  updateTeamDefinition: vi.fn(),
}))

const team: TeamDefinitionResponse = {
  id: 7,
  workspace_id: 1,
  name: '内容评审组',
  description: null,
  is_enabled: true,
  created_by_user_id: 1,
  members: [
    { agent_id: 3, agent_name: '写手', name: 'writer-a', role: '撰写初稿', sort_order: 0 },
    { agent_id: 3, agent_name: '写手', name: 'writer-b', role: '撰写对比版本', sort_order: 1 },
  ],
  created_at: '2026-11-15T00:00:00Z',
  updated_at: '2026-11-15T00:00:00Z',
}

const createPayload = {
  name: '内容评审组',
  members: [{ agent_id: 3, name: 'writer-a', role: '撰写初稿', sort_order: 0 }],
}

function page(items: TeamDefinitionResponse[], total = items.length, offset = 0) {
  return { items, total, limit: 100, offset }
}

describe('teams store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() })
    setActivePinia(createPinia())
    vi.resetAllMocks()
    vi.mocked(getTeamDefinitionList).mockResolvedValue(page([team]))
  })

  it('列表按 100 一页拉全，失败返回后端信息', async () => {
    const store = useTeamsStore()
    const second = { ...team, id: 8, name: '第二组' }
    vi.mocked(getTeamDefinitionList)
      .mockResolvedValueOnce(page([team], 2))
      .mockResolvedValueOnce(page([second], 2, 1))
    expect(await store.loadTeams()).toBeNull()
    expect(getTeamDefinitionList).toHaveBeenNthCalledWith(1, { limit: 100, offset: 0 })
    expect(getTeamDefinitionList).toHaveBeenNthCalledWith(2, { limit: 100, offset: 1 })
    expect(store.state.items.map((item) => item.id)).toEqual([7, 8])
    expect(store.state.total).toBe(2)

    vi.mocked(getTeamDefinitionList).mockRejectedValueOnce(new ApiError('无权访问该工作区', 'FORBIDDEN', 403))
    expect(await store.loadTeams()).toBe('无权访问该工作区')
    expect(store.state.loading).toBe(false)
  })

  it('只列启用的 Team 供新建会话选择', async () => {
    const store = useTeamsStore()
    vi.mocked(getTeamDefinitionList).mockResolvedValueOnce(page([team, { ...team, id: 9, is_enabled: false }]))
    await store.loadTeams()
    expect(store.enabledTeams.map((item) => item.id)).toEqual([7])
  })

  it('详情只有 404 才算不存在', async () => {
    const store = useTeamsStore()
    vi.mocked(getTeamDefinitionDetail).mockResolvedValueOnce(team)
    expect(await store.loadTeamDetail(7)).toEqual({ status: 'ok', item: team })
    expect(store.state.items).toEqual([team])

    vi.mocked(getTeamDefinitionDetail).mockRejectedValueOnce(new ApiError('Team不存在', 'NOT_FOUND', 404))
    expect(await store.loadTeamDetail(8)).toEqual({ status: 'not-found' })
    vi.mocked(getTeamDefinitionDetail).mockRejectedValueOnce(new ApiError('内部错误', 'ERROR', 500))
    expect(await store.loadTeamDetail(9)).toEqual({ status: 'error', message: '内部错误' })
  })

  it('取名：列表有就用，没有拉详情，404 记为已删除，临时错误不记', async () => {
    const store = useTeamsStore()
    await store.loadTeams()
    expect(store.teamName(7)).toBe('内容评审组')
    expect(store.teamName(8)).toBeUndefined()

    vi.mocked(getTeamDefinitionDetail).mockRejectedValueOnce(new ApiError('Team不存在', 'NOT_FOUND', 404))
    await store.resolveTeamName(8)
    expect(store.teamName(8)).toBeNull()
    // 已知结果不再请求。
    await store.resolveTeamName(8)
    expect(getTeamDefinitionDetail).toHaveBeenCalledTimes(1)

    vi.mocked(getTeamDefinitionDetail).mockRejectedValueOnce(new ApiError('网络请求失败', 'NETWORK_ERROR', 0))
    await store.resolveTeamName(9)
    expect(store.teamName(9)).toBeUndefined()

    vi.mocked(getTeamDefinitionDetail).mockResolvedValueOnce({ ...team, id: 9, name: '另一个组' })
    await store.resolveTeamName(9)
    expect(store.teamName(9)).toBe('另一个组')
  })

  it('新建成功写入列表，失败返回映射后的错误', async () => {
    const store = useTeamsStore()
    vi.mocked(createTeamDefinition).mockResolvedValueOnce(team)
    expect(await store.saveTeam({ create: createPayload })).toEqual({ item: team, error: null })
    expect(createTeamDefinition).toHaveBeenCalledWith(createPayload)
    expect(store.state.items).toEqual([team])

    vi.mocked(createTeamDefinition).mockRejectedValueOnce(new ApiError('Team名称已存在', 'CONFLICT', 409))
    const failed = await store.saveTeam({ create: createPayload })
    expect(failed.item).toBeNull()
    expect(failed.error).toMatchObject({ message: 'Team名称已存在', field: 'name' })
    expect(store.state.saving).toBe(false)
  })

  it('更新走 PATCH 并替换列表里的旧数据', async () => {
    const store = useTeamsStore()
    await store.loadTeams()
    const renamed = { ...team, name: '新名字' }
    vi.mocked(updateTeamDefinition).mockResolvedValueOnce(renamed)
    expect(await store.saveTeam({ id: 7, update: { name: '新名字' } })).toEqual({ item: renamed, error: null })
    expect(updateTeamDefinition).toHaveBeenCalledWith(7, { name: '新名字' })
    expect(store.state.items).toEqual([renamed])
    expect(store.teamName(7)).toBe('新名字')
  })

  it('启停只提交 is_enabled，失败返回后端文案', async () => {
    const store = useTeamsStore()
    await store.loadTeams()
    vi.mocked(updateTeamDefinition).mockResolvedValueOnce({ ...team, is_enabled: false })
    expect(await store.setTeamEnabled(7, false)).toBeNull()
    expect(updateTeamDefinition).toHaveBeenCalledWith(7, { is_enabled: false })
    expect(store.state.items[0]?.is_enabled).toBe(false)

    vi.mocked(updateTeamDefinition).mockRejectedValueOnce(new ApiError('无权执行该工作区操作', 'FORBIDDEN', 403))
    expect(await store.setTeamEnabled(7, true)).toBe('无权执行该工作区操作')
    expect(store.state.items[0]?.is_enabled).toBe(false)
    expect(store.state.togglingIds).toEqual([])
  })

  it('删除后移出列表，名称记为已删除', async () => {
    const store = useTeamsStore()
    await store.loadTeams()
    vi.mocked(deleteTeamDefinition).mockResolvedValueOnce({ deleted: true })
    expect(await store.removeTeam(7)).toBeNull()
    expect(store.state.items).toEqual([])
    expect(store.teamName(7)).toBeNull()

    vi.mocked(deleteTeamDefinition).mockRejectedValueOnce(new ApiError('Team不存在', 'NOT_FOUND', 404))
    expect(await store.removeTeam(8)).toBe('Team不存在')
    expect(store.state.deleting).toBe(false)
  })

  it('重置后丢弃旧工作区的列表响应', async () => {
    const store = useTeamsStore()
    let resolveList!: (value: ReturnType<typeof page>) => void
    vi.mocked(getTeamDefinitionList).mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve }))
    const loading = store.loadTeams()
    store.resetTeams()
    resolveList(page([team]))
    expect(await loading).toBeNull()
    expect(store.state.items).toEqual([])
  })
})

describe('teamSaveError 错误映射', () => {
  it('409 名称冲突落到名称字段', () => {
    expect(teamSaveError(new ApiError('Team名称已存在', 'CONFLICT', 409), '失败')).toEqual({
      message: 'Team名称已存在', field: 'name', memberIndexes: [], memberNames: [], agentIds: [],
    })
  })

  it('404 绑定的 Agent 不存在带上 agent_ids', () => {
    const error = new ApiError('绑定的Agent不存在', 'NOT_FOUND', 404, { agent_ids: [3, 'x', 5] })
    expect(teamSaveError(error, '失败')).toMatchObject({ message: '绑定的Agent不存在', field: 'members', agentIds: [3, 5] })
  })

  it('请求层 422 取第一条校验错误，成员错误带序号', () => {
    const error = new ApiError('参数校验失败', 'HTTP_ERROR', 422, {
      errors: [
        { loc: ['body', 'members', 1, 'name'], msg: 'Value error, 成员名不能是 lead 或 *', type: 'value_error' },
        { loc: ['body', 'name'], msg: 'String should have at least 1 character', type: 'string_too_short' },
      ],
    })
    expect(teamSaveError(error, '失败')).toEqual({
      message: '第 2 个成员：成员名不能是 lead 或 *', field: 'members', memberIndexes: [1], memberNames: [], agentIds: [],
    })
  })

  it('422 整个名单的错误和名称错误', () => {
    const members = new ApiError('参数校验失败', 'HTTP_ERROR', 422, {
      errors: [{ loc: ['body', 'members'], msg: 'Value error, 成员名重复: [\'writer\']' }],
    })
    expect(teamSaveError(members, '失败')).toMatchObject({ message: '成员名重复: [\'writer\']', field: 'members', memberIndexes: [] })

    const name = new ApiError('参数校验失败', 'HTTP_ERROR', 422, {
      errors: [{ loc: ['body', 'name'], msg: 'Value error, Team名称不能为空' }],
    })
    expect(teamSaveError(name, '失败')).toMatchObject({ message: 'Team名称不能为空', field: 'name' })
  })

  it('服务层 422 的保留名和重名带成员名', () => {
    const reserved = new ApiError('成员名不能是 lead 或 *', 'HTTP_ERROR', 422, { name: 'lead' })
    expect(teamSaveError(reserved, '失败')).toMatchObject({ message: '成员名不能是 lead 或 *', field: 'members', memberNames: ['lead'] })

    const duplicated = new ApiError('成员名在Team内必须唯一', 'HTTP_ERROR', 422, { names: ['writer'] })
    expect(teamSaveError(duplicated, '失败')).toMatchObject({ field: 'members', memberNames: ['writer'] })
  })

  it('其他错误只保留文案，非 ApiError 用兜底文案', () => {
    expect(teamSaveError(new ApiError('无权执行该工作区操作', 'FORBIDDEN', 403), '失败')).toMatchObject({ message: '无权执行该工作区操作', field: null })
    expect(teamSaveError(new Error('x'), 'Team 创建失败')).toMatchObject({ message: 'Team 创建失败', field: null })
  })
})
