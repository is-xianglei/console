import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { SkillDetailResponse } from '@/interfaces/skill/model'
import { useSnapshotDirty } from '@/hooks/useFormHelpers'
import { useSkillsStore } from '@/stores/skills'

/**
 * skills 编辑页 hook（B-10 / B-12）。
 *
 * 后端无 skills 字段写接口（http/skill.ts 仅 getSkillList/getSkillDetail/createSkill(覆盖上传)/
 * validateSkill/deleteSkill，无 PATCH/update），因此「编辑」落地为：
 * - 元数据只读展示（名称/作用域/版本/时间）；
 * - 修改说明（patchNote）仅供本地记录意图，真正的修改需重新上传 zip 覆盖（复用 createSkill）。
 * —— 接口化 TODO：后端提供字段更新接口后，改为字段编辑 + 保存接口，移除 patchNote 占位。
 */
export function useSkillEditor() {
  const route = useRoute()
  const skillsStore = useSkillsStore()

  const skillName = computed(() => {
    const value = route.params.name
    return String(Array.isArray(value) ? value[0] : value)
  })

  const detail = computed<SkillDetailResponse | null>(() => skillsStore.state.skillDetail)
  const loading = computed(() => skillsStore.state.skillDetailLoading)
  const error = ref('')

  /** 修改说明（本地意图占位，不落库）。 */
  const patchNote = ref('')
  const { dirty, reset } = useSnapshotDirty(() => patchNote.value)

  async function openEdit(): Promise<boolean> {
    if (!skillName.value) {
      error.value = '技能名缺失，无法加载。'
      return false
    }
    // 列表项在编辑路由下可能尚未加载，先补齐用于高亮回跳。
    if (!skillsStore.state.skills.length) await skillsStore.loadSkills()
    error.value = ''
    const message = await skillsStore.selectSkill(skillName.value)
    if (message) {
      error.value = message
      return false
    }
    if (!skillsStore.state.skillDetail) {
      error.value = '技能详情加载失败，未进入编辑模式。请刷新后重试。'
      return false
    }
    patchNote.value = ''
    reset()
    return true
  }

  /** 保存：编辑模式下走后端覆盖上传（见文件头 TODO）。由页面层在拿到 zip 后调用。 */
  function saveDraft(file: File): Promise<{ highlight?: string; error?: string } | null> {
    return skillsStore.uploadSkill(file)
  }

  function markSaved() {
    reset()
  }

  return {
    skillName,
    detail,
    loading,
    error,
    patchNote,
    dirty,
    openEdit,
    saveDraft,
    markSaved,
  }
}
