import { computed, ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import type { SkillResponse } from '@/interfaces/skill/model'
import { useAuthStore } from '@/stores/auth'
import { useSkillsStore } from '@/stores/skills'
import { usePermissions } from './usePermissions'

/** skill 写权限：按当前工作区角色判断（规则在 constants/permissions.ts 的 skill）。 */
export function useSkillWritePermission() {
  const authStore = useAuthStore()
  const { can } = usePermissions()
  return computed(() => can('edit', 'skill', {
    operatorRole: authStore.currentWorkspace?.membership_role ?? undefined,
  }).allowed)
}

/** skills 列表页与详情页共用的单项操作：写权限、启停开关、导出、删除确认。 */
export function useSkillActions() {
  const toast = useToast()
  const skillsStore = useSkillsStore()
  const canWrite = useSkillWritePermission()

  const pendingDelete = ref<SkillResponse | null>(null)
  const deleting = ref(false)
  const exportingId = ref<number | null>(null)

  function isToggling(id: number) {
    return skillsStore.state.togglingIds.includes(id)
  }

  /** 开关乐观更新由 store 负责，这里只在失败时提示。 */
  async function toggleEnabled(skill: SkillResponse, enabled: boolean) {
    const error = await skillsStore.toggleEnabled(skill.id, enabled)
    if (error) {
      toast.add({ title: enabled ? '启用失败' : '停用失败', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
    }
  }

  /** 跨域时读不到 Content-Disposition，文件名按接口约定用 {name}.zip。 */
  async function exportBundle(skill: SkillResponse) {
    if (exportingId.value !== null) return
    exportingId.value = skill.id
    const { blob, error } = await skillsStore.exportSkill(skill.id)
    exportingId.value = null
    if (!blob) {
      toast.add({ title: '导出失败', description: error ?? undefined, color: 'error', icon: 'i-lucide-circle-alert' })
      return
    }
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${skill.name}.zip`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function requestDelete(skill: SkillResponse) {
    pendingDelete.value = skill
  }

  function cancelDelete() {
    if (!deleting.value) pendingDelete.value = null
  }

  /** 确认删除；返回 true 表示本地已移除（含服务端已不存在的情况）。 */
  async function confirmDelete(): Promise<boolean> {
    const target = pendingDelete.value
    if (!target || deleting.value) return false
    deleting.value = true
    const { deleted, error } = await skillsStore.removeSkill(target.id)
    deleting.value = false
    if (error) {
      toast.add({ title: '删除失败', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
      return false
    }
    pendingDelete.value = null
    if (deleted) {
      toast.add({ title: `技能「${target.name}」已删除`, color: 'success', icon: 'i-lucide-trash-2' })
    } else {
      toast.add({ title: `技能「${target.name}」已不存在`, description: '列表已刷新。', color: 'warning', icon: 'i-lucide-circle-alert' })
    }
    return true
  }

  return {
    canWrite,
    pendingDelete,
    deleting,
    exportingId,
    isToggling,
    toggleEnabled,
    exportBundle,
    requestDelete,
    cancelDelete,
    confirmDelete,
  }
}
