import { computed, onBeforeUnmount, ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import type { TeamDefinitionResponse } from '@/interfaces/team-definition/api'
import { useAgentsStore } from '@/stores/agents'
import { useTeamsStore } from '@/stores/teams'
import { useListUrlState } from './useListUrlState'

/** 启用状态筛选值（与 URL 里 enabled 字段共用）。 */
export type TeamEnabledFilter = 'all' | 'enabled' | 'disabled'

const DEFAULT_PAGE_SIZE = 20

/** 成员的 Agent 被删除后 agent_name 为 null，Team 需要重新编辑才能用来新建会话。 */
export function hasDeletedTeamAgent(team: TeamDefinitionResponse): boolean {
  return team.members.some((member) => member.agent_name == null)
}

/** 列表与详情共用的单项操作：启停、删除确认。 */
export function useTeamActions() {
  const toast = useToast()
  const teamsStore = useTeamsStore()

  const pendingDelete = ref<TeamDefinitionResponse | null>(null)
  const deleting = ref(false)

  function isToggling(id: number) {
    return teamsStore.state.togglingIds.includes(id)
  }

  async function toggleEnabled(team: TeamDefinitionResponse, enabled: boolean) {
    const error = await teamsStore.setTeamEnabled(team.id, enabled)
    if (error) {
      toast.add({ title: enabled ? '启用失败' : '停用失败', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
    }
  }

  function requestDelete(team: TeamDefinitionResponse) {
    pendingDelete.value = team
  }

  function cancelDelete() {
    if (!deleting.value) pendingDelete.value = null
  }

  /** 确认删除；返回 true 表示已删除。 */
  async function confirmDelete(): Promise<boolean> {
    const target = pendingDelete.value
    if (!target || deleting.value) return false
    deleting.value = true
    const error = await teamsStore.removeTeam(target.id)
    deleting.value = false
    if (error === undefined) return false
    if (error) {
      toast.add({ title: '删除失败', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
      return false
    }
    pendingDelete.value = null
    toast.add({ title: `${target.name} 已删除`, color: 'success', icon: 'i-lucide-trash-2' })
    return true
  }

  return { pendingDelete, deleting, isToggling, toggleEnabled, requestDelete, cancelDelete, confirmDelete }
}

/** Teams 列表页：全量拉取后在前端筛选、分页，筛选与分页写进 URL。 */
export function useTeamManager() {
  const teamsStore = useTeamsStore()
  const agentsStore = useAgentsStore()

  const { state, reset, isDefault } = useListUrlState({
    defaults: {
      keyword: '',
      enabled: 'all' as TeamEnabledFilter,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    },
    resetPageOn: ['keyword', 'enabled', 'pageSize'],
  })

  const loadingError = ref('')
  let loadRequest = 0

  const teams = computed(() => teamsStore.state.items)
  const loading = computed(() => teamsStore.state.loading)

  const filteredTeams = computed(() => {
    const query = state.keyword.trim().toLowerCase()
    return teams.value.filter((team) => {
      const enabledMatches = state.enabled === 'all' || (state.enabled === 'enabled' ? team.is_enabled : !team.is_enabled)
      if (!enabledMatches) return false
      if (!query) return true
      const searchText = [
        team.id,
        team.name,
        team.description ?? '',
        ...team.members.flatMap((member) => [member.name, member.role, member.agent_name ?? '']),
      ].join(' ').toLowerCase()
      return searchText.includes(query)
    })
  })

  const total = computed(() => filteredTeams.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, state.pageSize))))
  const clampedPage = computed(() => Math.min(Math.max(1, state.page), pageCount.value))
  const pagedItems = computed(() => {
    const start = (clampedPage.value - 1) * state.pageSize
    return filteredTeams.value.slice(start, start + state.pageSize)
  })

  /** Team 列表与 Agent 目录一起刷新：表单和成员列需要 Agent 名称。 */
  async function loadAll() {
    const request = ++loadRequest
    const [teamsError] = await Promise.all([teamsStore.loadTeams(), agentsStore.loadAgents()])
    if (request === loadRequest) loadingError.value = teamsError ?? ''
  }

  function resetView() {
    loadRequest += 1
    reset()
    loadingError.value = ''
  }

  onBeforeUnmount(() => { loadRequest += 1 })

  return {
    state,
    isDefault,
    teams,
    loading,
    loadingError,
    filteredTeams,
    total,
    pageCount,
    clampedPage,
    pagedItems,
    loadAll,
    resetView,
  }
}
