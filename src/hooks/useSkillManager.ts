import { computed, onBeforeUnmount, ref } from 'vue'
import { useSkillsStore } from '@/stores/skills'
import { useListUrlState } from './useListUrlState'

/**
 * skills 列表页：筛选/分页状态写入 URL（useListUrlState）。
 *
 * 后端当前无搜索/分页接口（见 prd 非目标），列表：前端过滤 + 内存分页兜底。
 * —— 接口化 TODO：后端提供 /skills 搜索与分页参数后，改由服务端 query 驱动，
 *     移除 filteredSkills 的 slice/过滤逻辑并改为请求分页接口。
 */
export function useSkillManager() {
  const skillsStore = useSkillsStore()

  const { state, apply, reset, isDefault } = useListUrlState({
    defaults: {
      keyword: '',
      scope: 'all' as string,
      page: 1,
      pageSize: 10,
    },
    resetPageOn: ['keyword', 'scope', 'pageSize'],
  })

  const loadError = ref('')
  let loadRequest = 0

  const skills = computed(() => skillsStore.state.skills)
  const loading = computed(() => skillsStore.state.skillsLoading)
  const hasActiveFilter = computed(
    () => state.keyword.trim() !== '' || state.scope !== 'all',
  )
  /** 从已加载数据中提取可用作用域选项（数据模型无 type 字段，用 scope 兜底——B-9/B-12 注释）。 */
  const scopeOptions = computed(() => {
    const valueSet = new Set<string>()
    for (const skill of skills.value) {
      if (skill.scope) valueSet.add(skill.scope)
    }
    return [{ value: 'all', label: '全部作用域' }].concat(
      [...valueSet].map((value) => ({ value, label: value })),
    )
  })

  /** 前端过滤：关键字匹配名称/描述，scope 精确匹配。 ——接口化 TODO（见文件头）。 */
  const filteredSkills = computed(() => {
    const query = state.keyword.trim().toLowerCase()
    return skills.value.filter((skill) => {
      const keywordMatches = !query
        || [skill.name, skill.description].some((value) => value?.toLowerCase().includes(query))
      const scopeMatches = state.scope === 'all' || skill.scope === state.scope
      return keywordMatches && scopeMatches
    })
  })

  const total = computed(() => filteredSkills.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, state.pageSize))))
  const clampedPage = computed(() => Math.min(Math.max(1, state.page), pageCount.value))
  /** 当前页切片（前端分页兜底）。 */
  const pagedItems = computed(() => {
    const start = (clampedPage.value - 1) * state.pageSize
    return filteredSkills.value.slice(start, start + state.pageSize)
  })

  /** 过滤后全部技能名（删除邻项/高亮用）。 */
  const filteredSkillNames = computed(() => filteredSkills.value.map((skill) => skill.name))

  async function load() {
    const request = ++loadRequest
    loadError.value = ''
    const error = await skillsStore.loadSkills()
    if (request === loadRequest) loadError.value = error ?? ''
  }

  void load()

  // 文件名/scope 变化由 useListUrlState 复位 page；此处仅监听 route 外部触发的列表变化时重拉。
  // 前端过滤兜底下无需防抖请求，变更即时计算 pagedItems。

  function resetFilters() {
    reset()
  }

  function onRetry() {
    void load()
  }

  onBeforeUnmount(() => {
    loadRequest += 1
  })

  return {
    state,
    apply,
    reset,
    isDefault,
    skills,
    total,
    pageCount,
    clampedPage,
    pagedItems,
    filteredSkillNames,
    loading,
    loadError,
    hasActiveFilter,
    scopeOptions,
    load,
    resetFilters,
    onRetry,
  }
}
