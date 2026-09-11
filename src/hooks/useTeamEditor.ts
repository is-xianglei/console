import { computed, ref, watch } from 'vue'
import type { ResourceStatus } from '@/interfaces/platform/model'
import { useTeamsStore, validateTeam } from '@/stores/teams'
import type { TeamFormModel, TeamValidationIssue } from '@/interfaces/platform-team/model'

const DEFAULT_PAGE_SIZE = 20
const STATUS_ORDER: Record<ResourceStatus, number> = { error: 0, warning: 1, nominal: 2, idle: 3 }

/** 编辑页草稿的加载状态，供页面区分「加载中」与「未找到」。 */
export function useTeamEditor() {
  const store = useTeamsStore()
  const route = { module: 'build', resource: 'teams' } as const
  const draft = ref<TeamFormModel>(store.createDraft())
  const baseline = ref<TeamFormModel | null>(null)
  const loadingDetail = ref(false)
  const notFound = ref(false)
  const saving = ref(false)
  const error = ref('')
  const issues = ref<TeamValidationIssue[]>([])

  const isEdit = computed(() => Boolean(baseline.value))

  const sectionLabels: Record<TeamValidationIssue['section'], string> = {
    basic: '基本信息',
    members: '成员 Agent',
    runtime: '运行策略',
  }
  const groupedIssues = computed(() =>
    (['basic', 'members', 'runtime'] as const)
      .map((section) => ({
        section,
        label: sectionLabels[section],
        messages: issues.value.filter((issue) => issue.section === section).map((issue) => issue.message),
      }))
      .filter((group) => group.messages.length > 0),
  )

  function reset(to: TeamFormModel) {
    draft.value = to
    issues.value = []
    error.value = ''
  }

  function openCreate(duplicateId?: string) {
    notFound.value = false
    const source = duplicateId ? store.findTeam(duplicateId) : null
    reset(source ? store.duplicateDraft(source) : store.createDraft())
    baseline.value = null
  }

  async function openEdit(id: string) {
    loadingDetail.value = true
    notFound.value = false
    try {
      const found = store.findTeam(id)
      if (!found) {
        notFound.value = true
        return
      }
      reset({ ...found, members: found.members.map((member) => ({ ...member })), tags: [...found.tags] })
      baseline.value = found
    } finally {
      loadingDetail.value = false
    }
  }

  /** 保存前跑一遍校验，把问题写进 issues 供 Builder 定位。 */
  async function saveDraft(): Promise<boolean> {
    const found = validateTeam(draft.value)
    issues.value = found
    if (found.length) {
      error.value = `还有 ${found.length} 项需要修正`
      return false
    }
    saving.value = true
    try {
      store.upsert(draft.value)
      baseline.value = store.findTeam(draft.value.id)
      error.value = ''
      return true
    } finally {
      saving.value = false
    }
  }

  return {
    route, draft, baseline, isEdit, loadingDetail, notFound, saving, error, issues, groupedIssues,
    openCreate, openEdit, saveDraft, reset,
  }
}

/**
 * Teams 列表的视图状态。
 *
 * 与 useBuildResourceManager 的差异：行数据直接来自 teams store（编辑页写入的
 * 结果会立刻反映到列表），且 pageSize 是真正的 ref、删除文案带对象名。
 */
export function useTeamList() {
  const store = useTeamsStore()
  const search = ref('')
  const statusFilter = ref<ResourceStatus | 'all'>('all')
  const ownerFilter = ref('all')
  const sortBy = ref<'name' | 'status' | 'owner'>('name')
  const selectedIds = ref<Set<string>>(new Set())
  const pageNumber = ref(1)
  const pageSize = ref(DEFAULT_PAGE_SIZE)
  const pendingDeleteIds = ref<string[]>([])
  const toast = ref('')
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  const rows = computed(() => {
    store.ensureLoaded()
    return store.state.items
  })
  const owners = computed(() => [...new Set(rows.value.map((row) => row.owner))].sort((a, b) => a.localeCompare(b, 'zh-CN')))
  const filteredRows = computed(() => {
    const query = search.value.trim().toLowerCase()
    return rows.value
      .filter((row) => {
        const matchesStatus = statusFilter.value === 'all' || row.status === statusFilter.value
        const matchesOwner = ownerFilter.value === 'all' || row.owner === ownerFilter.value
        const searchable = [row.id, row.name, row.description, row.owner, ...row.tags].join(' ').toLowerCase()
        return matchesStatus && matchesOwner && (!query || searchable.includes(query))
      })
      .slice()
      .sort((a, b) => {
        if (sortBy.value === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        return a[sortBy.value].localeCompare(b[sortBy.value], 'zh-CN')
      })
  })
  const totalPages = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value)))
  const visibleRows = computed(() => filteredRows.value.slice((pageNumber.value - 1) * pageSize.value, pageNumber.value * pageSize.value))
  const selectedCount = computed(() => selectedIds.value.size)
  const hasFilters = computed(() => Boolean(search.value) || statusFilter.value !== 'all' || ownerFilter.value !== 'all')
  const deleteTitle = computed(() => {
    if (pendingDeleteIds.value.length === 1) {
      const target = store.findTeam(pendingDeleteIds.value[0]!)
      if (target) return `删除 ${target.name}？`
    }
    return pendingDeleteIds.value.length > 1 ? `删除 ${pendingDeleteIds.value.length} 个 Team？` : '删除 Team？'
  })

  function showToast(message: string) {
    toast.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, 2400)
  }

  function resetView() {
    search.value = ''
    statusFilter.value = 'all'
    ownerFilter.value = 'all'
    sortBy.value = 'name'
    selectedIds.value = new Set()
    pageNumber.value = 1
  }

  function requestDelete(ids: string[]) {
    pendingDeleteIds.value = ids
  }

  function cancelDelete() {
    pendingDeleteIds.value = []
  }

  /** 单条删除带上对象名，多条给数量，与 agents/plans 的文案一致。 */
  function confirmDelete() {
    const targets = pendingDeleteIds.value.slice()
    const names = targets.map((id) => store.findTeam(id)?.name).filter((name): name is string => Boolean(name))
    targets.forEach((id) => store.removeTeam(id))
    selectedIds.value = new Set([...selectedIds.value].filter((id) => !targets.includes(id)))
    pendingDeleteIds.value = []
    showToast(names.length === 1 ? `${names[0]} 已删除` : `已删除 ${targets.length} 个 Team`)
  }

  function updateStatus(ids: string[], status: ResourceStatus) {
    ids.forEach((id) => store.setStatus(id, status))
    showToast(`已更新 ${ids.length} 个 Team 的状态`)
  }

  function exportCsv() {
    const header = ['ID', '名称', '状态', '编排模式', '入口 Agent', '成员数', '负责人', '描述', '标签']
    const lines = filteredRows.value.map((row) => [
      row.id, row.name, row.status,
      row.members.length ? `${row.members.length} Agents` : '0 Agents',
      row.members[row.entryIndex]?.agentName ?? row.members[0]?.agentName ?? '未指定',
      String(row.members.length), row.owner, row.description, row.tags.join(' | '),
    ])
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'teams.csv'
    link.click()
    URL.revokeObjectURL(url)
    showToast(`已导出 ${filteredRows.value.length} 个 Team`)
  }

  watch([search, statusFilter, ownerFilter, sortBy], () => { pageNumber.value = 1 })
  watch(totalPages, (total) => { if (pageNumber.value > total) pageNumber.value = total })

  return {
    search, statusFilter, ownerFilter, sortBy, selectedIds, pageNumber, pageSize,
    pendingDeleteIds, toast, rows, owners, filteredRows, totalPages, visibleRows,
    selectedCount, hasFilters, deleteTitle,
    showToast, resetView, requestDelete, cancelDelete, confirmDelete, updateStatus, exportCsv,
  }
}
