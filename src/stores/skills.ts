import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ApiError } from '../http'
import { createSkill, deleteSkill, getSkillDetail, getSkillList, validateSkill } from '../http/skill'
import type { SkillDetailResponse, SkillResponse } from '../interfaces/skill/model'

interface SkillsState {
  skills: SkillResponse[]
  skillsLoading: boolean
  skillDetail: SkillDetailResponse | null
  skillDetailLoading: boolean
  selectedSkillName: string
  skillUploading: boolean
}

export const useSkillsStore = defineStore('skills', () => {
  let dataGeneration = 0

  const state = reactive<SkillsState>({
    skills: [],
    skillsLoading: false,
    skillDetail: null,
    skillDetailLoading: false,
    selectedSkillName: '',
    skillUploading: false,
  })

  /** 清空工作区绑定数据，并让旧工作区的异步响应失效。 */
  function resetSkills() {
    dataGeneration += 1
    state.skills = []
    state.skillsLoading = false
    state.skillDetail = null
    state.skillDetailLoading = false
    state.selectedSkillName = ''
    state.skillUploading = false
  }

  /** 拉取 skill 列表；失败置空，不打断页面交互。 */
  async function loadSkills() {
    const generation = dataGeneration
    state.skillsLoading = true
    try {
      const skills = await getSkillList()
      if (generation === dataGeneration) state.skills = skills
    } catch {
      if (generation === dataGeneration) state.skills = []
    } finally {
      if (generation === dataGeneration) state.skillsLoading = false
    }
  }

  /** 选中并加载某个 skill 的详情；失败清空详情，不打断页面交互。 */
  async function selectSkill(name: string) {
    const generation = dataGeneration
    state.selectedSkillName = name
    state.skillDetail = null
    state.skillDetailLoading = true
    try {
      const detail = await getSkillDetail(name)
      if (generation === dataGeneration && state.selectedSkillName === name) {
        state.skillDetail = detail
      }
    } catch {
      if (generation === dataGeneration && state.selectedSkillName === name) {
        state.skillDetail = null
      }
    } finally {
      if (generation === dataGeneration && state.selectedSkillName === name) {
        state.skillDetailLoading = false
      }
    }
  }

  /** 上传 skill 包。成功返回 null，失败返回可直接展示的错误信息。 */
  async function uploadSkillAction(file: File): Promise<string | null> {
    if (state.skillUploading) return null
    const generation = dataGeneration
    state.skillUploading = true
    try {
      const validation = await validateSkill(file)
      if (generation !== dataGeneration) return null
      if (!validation.ok) {
        return validation.errors.length
          ? `校验失败：${validation.errors.join('；')}`
          : '校验失败：Skill 包不符合要求'
      }
      const created = await createSkill(file)
      if (generation !== dataGeneration) return null
      await loadSkills()
      await selectSkill(created.name)
      return null
    } catch (error) {
      if (error instanceof ApiError) return error.message
      return '上传失败:未知错误'
    } finally {
      if (generation === dataGeneration) state.skillUploading = false
    }
  }

  /** 软删除 skill；若删除当前项，同时清空详情。 */
  async function removeSkillAction(name: string) {
    const generation = dataGeneration
    try {
      await deleteSkill(name)
      if (generation !== dataGeneration) return
      state.skills = state.skills.filter((skill) => skill.name !== name)
      if (state.selectedSkillName === name) {
        state.selectedSkillName = ''
        state.skillDetail = null
      }
    } catch {
      // 删除失败时保留列表，避免前后端状态不一致。
    }
  }

  return {
    state,
    resetSkills,
    loadSkills,
    selectSkill,
    uploadSkill: uploadSkillAction,
    removeSkill: removeSkillAction,
  }
})
