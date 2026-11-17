import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@nuxt/ui/composables'
import type { McpServerResponse } from '@/interfaces/mcp/api'
import type { McpFormModel, McpValidationIssue } from '@/interfaces/mcp/model'
import { useAuthStore } from '@/stores/auth'
import { useMcpStore } from '@/stores/mcp'
import {
  buildMcpCreatePayload,
  buildMcpUpdatePayload,
  emptyMcpForm,
  mcpResponseToForm,
  validateMcpForm,
} from '@/utils/mcp'

export interface McpSaveOptions {
  /** 保存成功、跳转之前调用；页面用它重置脏检查快照。 */
  onSaved?: () => void
}

/** 新建 / 编辑 MCP server：保存成功后进入详情页查看探测到的工具。 */
export function useMcpEditor() {
  const router = useRouter()
  const toast = useToast()
  const mcpStore = useMcpStore()
  const authStore = useAuthStore()

  /** 工作区 owner / admin 才能建共享 server，其余成员只能建私有 server。 */
  const canManageShared = computed(() => {
    const role = authStore.currentWorkspace?.membership_role
    return role === 'owner' || role === 'admin'
  })

  const draft = ref<McpFormModel>(emptyMcpForm(canManageShared.value))
  const loadingDetail = ref(false)
  const saving = ref(false)
  const error = ref('')
  const notFound = ref(false)
  const loadError = ref('')
  /** 没有写权限的成员打开编辑页时为 true。 */
  const readOnly = ref(false)

  const issues = computed<McpValidationIssue[]>(() => validateMcpForm(draft.value))

  function goToList() {
    void router.push({ name: 'platform-resource', params: { module: 'build', resource: 'mcp' } })
  }

  function openCreate() {
    error.value = ''
    notFound.value = false
    loadError.value = ''
    readOnly.value = false
    draft.value = emptyMcpForm(canManageShared.value)
  }

  async function openEdit(id: number): Promise<boolean> {
    draft.value = emptyMcpForm(canManageShared.value)
    loadingDetail.value = true
    error.value = ''
    notFound.value = false
    loadError.value = ''
    readOnly.value = false
    const result = await mcpStore.loadServerDetail(id)
    loadingDetail.value = false
    if (result === undefined) return false
    if (result.status === 'not-found') {
      notFound.value = true
      return false
    }
    if (result.status === 'error') {
      loadError.value = result.message
      return false
    }
    readOnly.value = !result.item.writable
    draft.value = mcpResponseToForm(result.item)
    return true
  }

  async function persist(enabled: boolean): Promise<McpServerResponse | null> {
    if (validateMcpForm(draft.value).length) return null
    const current = draft.value
    const result = current.id == null
      ? await mcpStore.saveServer({ create: buildMcpCreatePayload(current, enabled) })
      : await mcpStore.saveServer({ id: current.id, update: buildMcpUpdatePayload(current, enabled) })
    if (result.error) {
      error.value = result.error
      return null
    }
    error.value = ''
    return result.item
  }

  async function commit(enabled: boolean, verb: string, options?: McpSaveOptions): Promise<boolean> {
    if (saving.value) return false
    saving.value = true
    try {
      const saved = await persist(enabled)
      if (!saved) return false
      options?.onSaved?.()
      toast.add({ title: `${saved.name} 已${verb}`, color: 'success' })
      await router.push({ name: 'mcp-detail', params: { id: String(saved.id) } })
      return true
    } finally {
      saving.value = false
    }
  }

  /** 「保存」：按表单当前 isEnabled 保存（新建默认停用）。 */
  function saveDraft(options?: McpSaveOptions) {
    return commit(draft.value.isEnabled, '保存', options)
  }

  /** 「保存并启用」：强制启用。 */
  function publish(options?: McpSaveOptions) {
    return commit(true, '保存并启用', options)
  }

  return {
    draft,
    issues,
    canManageShared,
    loadingDetail,
    saving,
    error,
    notFound,
    loadError,
    readOnly,
    openCreate,
    openEdit,
    saveDraft,
    publish,
    goToList,
  }
}
