import { computed, reactive, ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import { ApiError } from '@/http'
import {
  approveMyEvolutionCandidate,
  getEvolutionContributions,
  getEvolutionPrefs,
  getMemorySettings,
  getMyEvolutionCandidates,
  updateEvolutionPrefs,
  updateMemorySettings,
} from '@/http/settings/evolution'
import type {
  EvolutionContributions,
  EvolutionMechanism,
  EvolutionPrefs,
  MemorySettings,
  MyEvolutionCandidate,
} from '@/interfaces/settings/evolution/model'

export type MemoryToggleKey = 'memory_enabled' | 'memory_write_enabled'
type PrefsKey = keyof EvolutionPrefs

export const MECHANISM_REQUIRED_MESSAGE = '至少保留一项进化机制；如需完全停止，请关闭「启动进化」'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback
}

/** 设置页「自进化」模块：记忆开关、进化偏好、待我批准的候选。开关与数值即时保存、乐观更新、失败回滚。 */
export function useSettingsEvolution() {
  const toast = useToast()

  const memory = ref<MemorySettings | null>(null)
  const prefs = ref<EvolutionPrefs | null>(null)
  const candidates = ref<MyEvolutionCandidate[]>([])
  const loadError = reactive({ memory: '', prefs: '', candidates: '' })

  const savingMemory = reactive<Record<MemoryToggleKey, boolean>>({
    memory_enabled: false,
    memory_write_enabled: false,
  })
  const savingPrefs = reactive<Record<PrefsKey, boolean>>({
    enabled: false,
    mechanisms: false,
    min_support: false,
    auto_approve_low_risk: false,
  })
  const approvingId = ref('')

  /** 启动进化关闭或正在切换时，其余进化控件不可操作。 */
  const prefsLocked = computed(() => !prefs.value?.enabled || savingPrefs.enabled)

  async function loadMemory() {
    loadError.memory = ''
    try {
      memory.value = await getMemorySettings()
    } catch (error) {
      loadError.memory = errorMessage(error, '记忆设置加载失败')
    }
  }

  async function loadPrefs() {
    loadError.prefs = ''
    try {
      prefs.value = (await getEvolutionPrefs()).prefs
    } catch (error) {
      loadError.prefs = errorMessage(error, '进化配置加载失败')
    }
  }

  async function loadCandidates() {
    loadError.candidates = ''
    try {
      candidates.value = (await getMyEvolutionCandidates()).candidates
    } catch (error) {
      loadError.candidates = errorMessage(error, '能力候选加载失败')
    }
  }

  async function load() {
    await Promise.all([loadMemory(), loadPrefs(), loadCandidates()])
  }

  async function setMemoryToggle(key: MemoryToggleKey, value: boolean) {
    if (!memory.value || savingMemory[key] || memory.value[key] === value) return
    const previous = memory.value[key]
    memory.value[key] = value
    savingMemory[key] = true
    try {
      const saved = await updateMemorySettings({ [key]: value })
      memory.value[key] = saved[key]
      memory.value.memory_count = saved.memory_count
    } catch (error) {
      memory.value[key] = previous
      toast.add({ title: errorMessage(error, '记忆设置更新失败'), color: 'error' })
    } finally {
      savingMemory[key] = false
    }
  }

  /** 只提交改动的字段；失败只回滚该字段，不影响其他并行中的修改。 */
  async function patchPrefs<K extends PrefsKey>(key: K, value: EvolutionPrefs[K]) {
    if (!prefs.value || savingPrefs[key]) return
    const previous = prefs.value[key]
    prefs.value[key] = value
    savingPrefs[key] = true
    try {
      const saved = await updateEvolutionPrefs({ [key]: value })
      prefs.value[key] = saved[key]
    } catch (error) {
      prefs.value[key] = previous
      toast.add({ title: errorMessage(error, '配置保存失败'), color: 'error' })
    } finally {
      savingPrefs[key] = false
    }
  }

  function setEnabled(value: boolean) {
    if (prefs.value?.enabled === value) return
    return patchPrefs('enabled', value)
  }

  /** 接收多选框组给出的完整勾选结果。 */
  function setMechanisms(selected: EvolutionMechanism[]) {
    if (!prefs.value) return
    const current = prefs.value.mechanisms
    const next = [...new Set(selected)]
    if (next.length === current.length && next.every((item) => current.includes(item))) return
    // 后端拒绝空选择：全关等于悄悄停掉进化，这里直接说明该怎么做。
    if (next.length === 0) {
      toast.add({ title: MECHANISM_REQUIRED_MESSAGE, color: 'warning' })
      return
    }
    return patchPrefs('mechanisms', next)
  }

  function setMinSupport(value: number | null) {
    if (value == null || !Number.isFinite(value) || value === prefs.value?.min_support) return
    return patchPrefs('min_support', value)
  }

  function setAutoApprove(value: boolean) {
    if (prefs.value?.auto_approve_low_risk === value) return
    return patchPrefs('auto_approve_low_risk', value)
  }

  async function approve(candidate: MyEvolutionCandidate) {
    if (approvingId.value) return
    approvingId.value = candidate.candidate_id
    try {
      await approveMyEvolutionCandidate(candidate.candidate_id)
      candidates.value = candidates.value.filter((item) => item.candidate_id !== candidate.candidate_id)
      toast.add({
        title: candidate.action === 'apply_memory' ? '已应用该记忆调整' : '已为你启用该能力，可在「技能」中查看',
        color: 'success',
      })
      // 记忆调整会改变长期记忆条数，静默刷新卡片 A 的计数。
      if (candidate.action === 'apply_memory') void loadMemory()
    } catch (error) {
      toast.add({ title: errorMessage(error, '操作失败，请稍后重试'), color: 'error' })
    } finally {
      approvingId.value = ''
    }
  }

  return {
    memory,
    prefs,
    candidates,
    loadError,
    savingMemory,
    savingPrefs,
    prefsLocked,
    approvingId,
    load,
    loadMemory,
    loadPrefs,
    loadCandidates,
    setMemoryToggle,
    setEnabled,
    setMechanisms,
    setMinSupport,
    setAutoApprove,
    approve,
  }
}

/** 「查看进化详情」弹窗：每次打开重新拉取本账号促成的能力进化。 */
export function useEvolutionContributions() {
  const data = ref<EvolutionContributions | null>(null)
  const loading = ref(false)
  const error = ref('')
  let requestId = 0

  async function load() {
    const current = ++requestId
    loading.value = true
    error.value = ''
    try {
      const result = await getEvolutionContributions()
      if (current === requestId) data.value = result
    } catch (err) {
      if (current === requestId) error.value = errorMessage(err, '进化详情暂时无法加载')
    } finally {
      if (current === requestId) loading.value = false
    }
  }

  return { data, loading, error, load }
}
