import { ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import type { AgentResponse } from '@/interfaces/agent/api'
import { useAgentsStore } from '@/stores/agents'

/** agents 列表卡片与详情页共用的单项操作：启停开关、删除确认。 */
export function useAgentActions() {
  const toast = useToast()
  const agentsStore = useAgentsStore()

  const pendingDelete = ref<AgentResponse | null>(null)
  const deleting = ref(false)

  function isToggling(id: number) {
    return agentsStore.state.togglingIds.includes(id)
  }

  /** 乐观更新与回滚由 store 负责，这里只在失败时提示。 */
  async function toggleEnabled(agent: AgentResponse, enabled: boolean) {
    const error = await agentsStore.setAgentEnabled(agent.id, enabled)
    if (error) {
      toast.add({ title: enabled ? '启用失败' : '停用失败', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
    }
  }

  function requestDelete(agent: AgentResponse) {
    pendingDelete.value = agent
  }

  function cancelDelete() {
    if (!deleting.value) pendingDelete.value = null
  }

  /** 确认删除；返回 true 表示已删除。 */
  async function confirmDelete(): Promise<boolean> {
    const target = pendingDelete.value
    if (!target || deleting.value) return false
    deleting.value = true
    const error = await agentsStore.removeAgent(target.id)
    deleting.value = false
    // undefined：请求期间切换了工作区，结果作废。
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
