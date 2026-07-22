import { computed, reactive, ref, watch, type Ref } from 'vue'
import type { ResourcePage, ResourceRow, ResourceStatus } from '../../../data/platformCatalog'

export type ResourceFormMode = 'create' | 'edit' | 'duplicate'
export type ResourceSort = 'name' | 'owner' | 'status'

const STATUS_ORDER: Record<ResourceStatus, number> = {
  error: 0,
  warning: 1,
  nominal: 2,
  idle: 3,
}

const RESOURCE_PREFIX: Record<string, string> = {
  agents: 'AGT',
  teams: 'TEAM',
  models: 'MODEL',
  skills: 'SKILL',
  mcp: 'MCP',
}

function cloneRows(rows: ResourceRow[]) {
  return rows.map((row) => ({ ...row, values: [...row.values], tags: [...row.tags] }))
}

function emptyDraft(page: ResourcePage): ResourceRow {
  return {
    id: '',
    name: '',
    status: 'nominal',
    values: page.columns.map(() => ''),
    description: '',
    tags: [],
    owner: 'AI 平台组',
  }
}

export function useBuildResourceManager(page: Ref<ResourcePage>) {
  const catalog = reactive<Record<string, ResourceRow[]>>({})
  const search = ref('')
  const statusFilter = ref<ResourceStatus | 'all'>('all')
  const ownerFilter = ref('all')
  const sortBy = ref<ResourceSort>('name')
  const selectedId = ref('')
  const selectedIds = ref<Set<string>>(new Set())
  const pageNumber = ref(1)
  const pageSize = 6
  const formOpen = ref(false)
  const formMode = ref<ResourceFormMode>('create')
  const editingId = ref('')
  const draft = ref<ResourceRow>(emptyDraft(page.value))
  const pendingDeleteIds = ref<string[]>([])
  const toast = ref('')
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  const rows = computed(() => catalog[page.value.key] ?? [])
  const owners = computed(() => [...new Set(rows.value.map((row) => row.owner))].sort((a, b) => a.localeCompare(b, 'zh-CN')))
  const filteredRows = computed(() => {
    const query = search.value.trim().toLowerCase()
    return rows.value
      .filter((row) => {
        const matchesStatus = statusFilter.value === 'all' || row.status === statusFilter.value
        const matchesOwner = ownerFilter.value === 'all' || row.owner === ownerFilter.value
        const searchable = [row.name, row.id, row.description, row.owner, ...row.values, ...row.tags].join(' ').toLowerCase()
        return matchesStatus && matchesOwner && (!query || searchable.includes(query))
      })
      .sort((a, b) => {
        if (sortBy.value === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        return a[sortBy.value].localeCompare(b[sortBy.value], 'zh-CN')
      })
  })
  const totalPages = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize)))
  const visibleRows = computed(() => filteredRows.value.slice((pageNumber.value - 1) * pageSize, pageNumber.value * pageSize))
  const selectedRow = computed(() => rows.value.find((row) => row.id === selectedId.value) ?? null)
  const allVisibleSelected = computed(() => visibleRows.value.length > 0 && visibleRows.value.every((row) => selectedIds.value.has(row.id)))
  const hasFilters = computed(() => Boolean(search.value) || statusFilter.value !== 'all' || ownerFilter.value !== 'all')
  const deleteTitle = computed(() => pendingDeleteIds.value.length > 1 ? `删除 ${pendingDeleteIds.value.length} 项资源` : '删除资源')

  function ensureRows() {
    if (!catalog[page.value.key]) catalog[page.value.key] = cloneRows(page.value.rows)
  }

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
    selectedId.value = ''
    selectedIds.value = new Set()
    pageNumber.value = 1
  }

  function toggleRow(id: string) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
  }

  function toggleAllVisible() {
    const next = new Set(selectedIds.value)
    if (allVisibleSelected.value) visibleRows.value.forEach((row) => next.delete(row.id))
    else visibleRows.value.forEach((row) => next.add(row.id))
    selectedIds.value = next
  }

  function openCreate() {
    formMode.value = 'create'
    editingId.value = ''
    draft.value = emptyDraft(page.value)
    formOpen.value = true
  }

  function openEdit(row: ResourceRow) {
    formMode.value = 'edit'
    editingId.value = row.id
    draft.value = cloneRows([row])[0]!
    formOpen.value = true
  }

  function openDuplicate(row: ResourceRow) {
    formMode.value = 'duplicate'
    editingId.value = ''
    draft.value = { ...cloneRows([row])[0]!, id: '', name: `${row.name} 副本`, status: 'idle' }
    formOpen.value = true
  }

  function nextId() {
    const prefix = RESOURCE_PREFIX[page.value.key] ?? 'RES'
    const numericIds = rows.value.map((row) => Number(row.id.match(/\d+/)?.[0] ?? 0))
    return `${prefix}-${String(Math.max(0, ...numericIds) + 1).padStart(4, '0')}`
  }

  function saveDraft() {
    const current = catalog[page.value.key]
    if (!current || !draft.value.name.trim()) return
    const normalized = {
      ...draft.value,
      name: draft.value.name.trim(),
      description: draft.value.description.trim(),
      owner: draft.value.owner.trim() || '未分配',
      tags: draft.value.tags.map((tag) => tag.trim()).filter(Boolean),
      values: draft.value.values.map((value) => value.trim() || '未配置'),
    }
    if (formMode.value === 'edit') {
      const index = current.findIndex((row) => row.id === editingId.value)
      if (index >= 0) current[index] = { ...normalized, id: editingId.value }
      selectedId.value = editingId.value
      showToast(`${normalized.name} 已更新`)
    } else {
      const created = { ...normalized, id: nextId() }
      current.unshift(created)
      selectedId.value = created.id
      showToast(`${created.name} 已创建`)
    }
    formOpen.value = false
  }

  function requestDelete(ids: string[]) {
    pendingDeleteIds.value = ids
  }

  function confirmDelete() {
    const current = catalog[page.value.key]
    if (!current) return
    const targets = new Set(pendingDeleteIds.value)
    const count = targets.size
    catalog[page.value.key] = current.filter((row) => !targets.has(row.id))
    if (targets.has(selectedId.value)) selectedId.value = ''
    selectedIds.value = new Set([...selectedIds.value].filter((id) => !targets.has(id)))
    pendingDeleteIds.value = []
    showToast(`已删除 ${count} 项资源`)
  }

  function updateStatus(ids: string[], status: ResourceStatus) {
    const targets = new Set(ids)
    rows.value.forEach((row) => { if (targets.has(row.id)) row.status = status })
    selectedIds.value = new Set()
    showToast(`已更新 ${targets.size} 项资源状态`)
  }

  function exportCsv() {
    const header = ['ID', '名称', '状态', '负责人', ...page.value.columns, '描述', '标签']
    const lines = filteredRows.value.map((row) => [row.id, row.name, row.status, row.owner, ...row.values, row.description, row.tags.join(' | ')])
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${page.value.key}-resources.csv`
    link.click()
    URL.revokeObjectURL(url)
    showToast(`已导出 ${filteredRows.value.length} 项资源`)
  }

  watch(() => page.value.key, () => {
    ensureRows()
    resetView()
    draft.value = emptyDraft(page.value)
  }, { immediate: true })
  watch([search, statusFilter, ownerFilter, sortBy], () => { pageNumber.value = 1 })
  watch(totalPages, (total) => { if (pageNumber.value > total) pageNumber.value = total })

  return {
    search, statusFilter, ownerFilter, sortBy, selectedId, selectedIds, pageNumber, pageSize,
    formOpen, formMode, draft, pendingDeleteIds, toast, rows, owners, filteredRows, totalPages,
    visibleRows, selectedRow, allVisibleSelected, hasFilters, deleteTitle, showToast, resetView,
    toggleRow, toggleAllVisible, openCreate, openEdit, openDuplicate, saveDraft, requestDelete,
    confirmDelete, updateStatus, exportCsv,
  }
}
