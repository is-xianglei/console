import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/http'
import { createTeamDefinition, getTeamDefinitionDetail, updateTeamDefinition } from '@/http/team-definition'
import type { TeamDefinitionResponse } from '@/interfaces/team-definition/api'
import type { TeamFormModel } from '@/interfaces/team-definition/model'
import { teamSaveError } from '@/stores/teams'
import {
  buildTeamCreatePayload,
  buildTeamUpdatePayload,
  emptyTeamForm,
  suggestMemberName,
  teamResponseToForm,
  teamSaveErrorRows,
  useTeamEditor,
  validateTeamForm,
} from './useTeamEditor'

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}))
const toastAdd = vi.fn()
vi.mock('@nuxt/ui/composables', () => ({
  useToast: () => ({ add: toastAdd }),
}))
const auth = { currentWorkspaceId: 1, currentWorkspace: { membership_role: 'owner' as string } }
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/http/team-definition', () => ({
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
  description: '评审稿件',
  is_enabled: true,
  created_by_user_id: 1,
  members: [
    { agent_id: 3, agent_name: '写手', name: 'writer-a', role: '撰写初稿', sort_order: 0 },
    { agent_id: 4, agent_name: '审校', name: 'reviewer', role: '审校', sort_order: 1 },
  ],
  created_at: '2026-11-15T00:00:00Z',
  updated_at: '2026-11-15T00:00:00Z',
}

/** 名称 + 一个填好的成员，能通过校验。 */
function validForm(): TeamFormModel {
  const form = emptyTeamForm()
  form.name = ' 内容评审组 '
  Object.assign(form.members[0]!, { agentId: 3, agentName: '写手', name: ' writer ', role: ' 撰写初稿 ' })
  return form
}

describe('Team 表单校验', () => {
  it('新建草稿默认启用，带一行空成员', () => {
    const form = emptyTeamForm()
    expect(form).toMatchObject({ id: null, name: '', isEnabled: true })
    expect(form.members).toHaveLength(1)
    expect(validateTeamForm(validForm())).toEqual([])
  })

  it('名称必填、至少一个成员', () => {
    const form = validForm()
    form.name = '  '
    form.members = []
    expect(validateTeamForm(form).map((issue) => issue.message)).toEqual(['请输入 Team 名称', '至少需要 1 个成员'])
  })

  it('成员行：Agent、成员名、角色必填，Agent 已删除要重选', () => {
    const form = validForm()
    form.members.push({ key: 'x', agentId: null, agentName: null, name: '', role: '' })
    form.members.push({ key: 'y', agentId: 9, agentName: null, name: 'old', role: '旧成员' })
    const issues = validateTeamForm(form)
    expect(issues.map((issue) => [issue.memberIndex, issue.memberField])).toEqual([
      [1, 'agent'], [1, 'name'], [1, 'role'], [2, 'agent'],
    ])
    expect(issues[3]?.message).toBe('第 3 个成员的 Agent 已删除，请重新选择')
  })

  it('成员名不能重复，也不能是 lead 或 *；同一个 Agent 可以出现多次', () => {
    const form = validForm()
    form.members.push({ key: 'b', agentId: 3, agentName: '写手', name: 'writer', role: '另一位写手' })
    form.members.push({ key: 'c', agentId: 3, agentName: '写手', name: 'lead', role: '冒充 lead' })
    form.members.push({ key: 'd', agentId: 3, agentName: '写手', name: '*', role: '广播' })
    const issues = validateTeamForm(form)
    expect(issues.map((issue) => issue.memberIndex)).toEqual([0, 1, 2, 3])
    expect(issues[0]?.message).toBe('第 1 个成员的成员名「writer」重复')
    expect(issues[2]?.message).toBe('第 3 个成员的成员名不能是 lead 或 *')
  })

  it('长度上限：名称 128，成员名、角色 120', () => {
    const form = validForm()
    form.name = 'a'.repeat(129)
    form.members[0]!.name = 'n'.repeat(121)
    form.members[0]!.role = 'r'.repeat(121)
    expect(validateTeamForm(form).map((issue) => issue.memberField ?? issue.field)).toEqual(['name', 'name', 'role'])
  })
})

describe('成员名预填', () => {
  it('用 Agent 名，重名或撞保留名时加 -2、-3', () => {
    expect(suggestMemberName(' 写手 ', [])).toBe('写手')
    expect(suggestMemberName('写手', ['写手'])).toBe('写手-2')
    expect(suggestMemberName('写手', ['写手', '写手-2'])).toBe('写手-3')
    expect(suggestMemberName('lead', [])).toBe('lead-2')
    expect(suggestMemberName('x'.repeat(130), ['x'.repeat(120)])).toBe(`${'x'.repeat(118)}-2`)
  })
})

describe('载荷', () => {
  it('新建：去首尾空格，数组下标写进 sort_order，空描述传 null', () => {
    const form = validForm()
    form.members.push({ key: 'b', agentId: 4, agentName: '审校', name: 'reviewer', role: '审校' })
    expect(buildTeamCreatePayload(form)).toEqual({
      name: '内容评审组',
      description: null,
      is_enabled: true,
      members: [
        { agent_id: 3, name: 'writer', role: '撰写初稿', sort_order: 0 },
        { agent_id: 4, name: 'reviewer', role: '审校', sort_order: 1 },
      ],
    })
  })

  it('更新只带改动的字段；描述清空传 null，成员有变化才整体替换', () => {
    const form = teamResponseToForm(team)
    expect(buildTeamUpdatePayload(form, team)).toEqual({})

    form.description = ''
    form.isEnabled = false
    expect(buildTeamUpdatePayload(form, team)).toEqual({ description: null, is_enabled: false })

    form.members.reverse()
    expect(buildTeamUpdatePayload(form, team).members).toEqual([
      { agent_id: 4, name: 'reviewer', role: '审校', sort_order: 0 },
      { agent_id: 3, name: 'writer-a', role: '撰写初稿', sort_order: 1 },
    ])
  })

  it('后端错误定位到成员行：loc 下标、成员名、Agent id', () => {
    const form = teamResponseToForm(team)
    const byIndex = teamSaveError(new ApiError('参数校验失败', 'HTTP_ERROR', 422, { errors: [{ loc: ['body', 'members', 1, 'role'], msg: 'x' }] }), '失败')
    expect(teamSaveErrorRows(byIndex, form)).toEqual([1])
    const byName = teamSaveError(new ApiError('成员名在Team内必须唯一', 'HTTP_ERROR', 422, { names: ['writer-a'] }), '失败')
    expect(teamSaveErrorRows(byName, form)).toEqual([0])
    const byAgent = teamSaveError(new ApiError('绑定的Agent不存在', 'NOT_FOUND', 404, { agent_ids: [4] }), '失败')
    expect(teamSaveErrorRows(byAgent, form)).toEqual([1])
    expect(teamSaveErrorRows(teamSaveError(new ApiError('Team名称已存在', 'CONFLICT', 409), '失败'), form)).toEqual([])
  })
})

describe('useTeamEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    auth.currentWorkspace.membership_role = 'owner'
  })

  it('只有 owner / admin 能写', () => {
    expect(useTeamEditor().canManage.value).toBe(true)
    auth.currentWorkspace.membership_role = 'member'
    expect(useTeamEditor().canManage.value).toBe(false)
  })

  it('有校验问题时不提交', async () => {
    const editor = useTeamEditor()
    await editor.openCreate()
    expect(await editor.save()).toBe(false)
    expect(createTeamDefinition).not.toHaveBeenCalled()
  })

  it('新建成功后进详情', async () => {
    vi.mocked(createTeamDefinition).mockResolvedValueOnce(team)
    const editor = useTeamEditor()
    await editor.openCreate()
    editor.draft.value = validForm()
    const onSaved = vi.fn()
    expect(await editor.save({ onSaved })).toBe(true)
    expect(onSaved).toHaveBeenCalledOnce()
    expect(routerPush).toHaveBeenCalledWith({ name: 'team-detail', params: { id: '7' } })
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: '内容评审组 已保存' }))
  })

  it('复制已有 Team 作为草稿', async () => {
    vi.mocked(getTeamDefinitionDetail).mockResolvedValueOnce(team)
    const editor = useTeamEditor()
    expect(await editor.openCreate(7)).toBe(true)
    expect(editor.draft.value).toMatchObject({ id: null, name: '内容评审组 副本' })
    expect(editor.draft.value.members.map((member) => member.name)).toEqual(['writer-a', 'reviewer'])
  })

  it('编辑：没有改动不发请求，有改动只 PATCH 改动字段', async () => {
    vi.mocked(getTeamDefinitionDetail).mockResolvedValue(team)
    const editor = useTeamEditor()
    expect(await editor.openEdit(7)).toBe(true)
    expect(await editor.save()).toBe(true)
    expect(updateTeamDefinition).not.toHaveBeenCalled()
    expect(routerPush).toHaveBeenLastCalledWith({ name: 'team-detail', params: { id: '7' } })

    editor.draft.value.name = '改名后'
    vi.mocked(updateTeamDefinition).mockResolvedValueOnce({ ...team, name: '改名后' })
    expect(await editor.save()).toBe(true)
    expect(updateTeamDefinition).toHaveBeenCalledWith(7, { name: '改名后' })
  })

  it('保存失败保留后端定位信息', async () => {
    vi.mocked(getTeamDefinitionDetail).mockResolvedValueOnce(team)
    vi.mocked(updateTeamDefinition).mockRejectedValueOnce(new ApiError('Team名称已存在', 'CONFLICT', 409))
    const editor = useTeamEditor()
    await editor.openEdit(7)
    editor.draft.value.name = '重名'
    expect(await editor.save()).toBe(false)
    expect(editor.error.value).toBe('Team名称已存在')
    expect(editor.saveError.value?.field).toBe('name')
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('详情 404 标记不存在，其他错误给出原因', async () => {
    const editor = useTeamEditor()
    vi.mocked(getTeamDefinitionDetail).mockRejectedValueOnce(new ApiError('Team不存在', 'NOT_FOUND', 404))
    expect(await editor.openEdit(8)).toBe(false)
    expect(editor.notFound.value).toBe(true)
    vi.mocked(getTeamDefinitionDetail).mockRejectedValueOnce(new ApiError('内部错误', 'ERROR', 500))
    await editor.openEdit(8)
    expect(editor.notFound.value).toBe(false)
    expect(editor.loadError.value).toBe('内部错误')
  })
})
