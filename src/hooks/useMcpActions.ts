import { ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import type { McpServerResponse } from '@/interfaces/mcp/api'
import { useMcpStore } from '@/stores/mcp'

/** MCP 列表卡片与详情页共用的单项操作：启停、删除确认。 */
export function useMcpActions() {
  const toast = useToast()
  const mcpStore = useMcpStore()

  const pendingDelete = ref<McpServerResponse | null>(null)
  const deleting = ref(false)

  function isToggling(id: number) {
    return mcpStore.state.togglingIds.includes(id)
  }

  async function toggleEnabled(server: McpServerResponse, enabled: boolean) {
    const error = await mcpStore.setServerEnabled(server.id, enabled)
    if (error) {
      toast.add({ title: enabled ? '启用失败' : '停用失败', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
    }
  }

  function requestDelete(server: McpServerResponse) {
    pendingDelete.value = server
  }

  function cancelDelete() {
    if (!deleting.value) pendingDelete.value = null
  }

  /** 确认删除；返回 true 表示已删除。 */
  async function confirmDelete(): Promise<boolean> {
    const target = pendingDelete.value
    if (!target || deleting.value) return false
    deleting.value = true
    const error = await mcpStore.removeServer(target.id)
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

  return {
    pendingDelete,
    deleting,
    isToggling,
    toggleEnabled,
    requestDelete,
    cancelDelete,
    confirmDelete,
  }
}
