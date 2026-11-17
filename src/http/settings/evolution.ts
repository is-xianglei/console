import {
  MIN_SUPPORT_RANGE,
  MOCK_CONTRIBUTIONS,
  MOCK_DELAY_MS,
  MOCK_EVOLUTION_PREFS,
  MOCK_MEMORY_SETTINGS,
  MOCK_MY_CANDIDATES,
} from '@/constants/settings/evolution'
import type {
  ApproveMyEvolutionCandidateResponse,
  GetEvolutionContributionsResponse,
  GetEvolutionPrefsResponse,
  GetMemorySettingsResponse,
  GetMyEvolutionCandidatesResponse,
  UpdateEvolutionPrefsRequest,
  UpdateEvolutionPrefsResponse,
  UpdateMemorySettingsRequest,
} from '@/interfaces/settings/evolution/api'
import { ApiError } from '../index'

// 模拟实现：接口形态与后端约定一致（GET/PATCH /v1/memories/settings、/v1/evolution/*）。
// 后端就绪后把函数体换成 request<T>(...)，调用方无需改动。
// 写操作修改下面这份内存副本，刷新页面即恢复初始数据。
const db = {
  memory: structuredClone(MOCK_MEMORY_SETTINGS),
  prefs: structuredClone(MOCK_EVOLUTION_PREFS),
  candidates: structuredClone(MOCK_MY_CANDIDATES),
  contributions: structuredClone(MOCK_CONTRIBUTIONS),
}

function respond<T>(data: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(data)), MOCK_DELAY_MS))
}

function reject(message: string, status = 422): Promise<never> {
  return new Promise((_, rejectFn) => setTimeout(
    () => rejectFn(new ApiError(message, 'validation_error', status)),
    MOCK_DELAY_MS,
  ))
}

/** GET /v1/memories/settings */
export async function getMemorySettings(): Promise<GetMemorySettingsResponse> {
  return respond(db.memory)
}

/** PATCH /v1/memories/settings */
export async function updateMemorySettings(payload: UpdateMemorySettingsRequest): Promise<GetMemorySettingsResponse> {
  Object.assign(db.memory, payload)
  return respond(db.memory)
}

/** GET /v1/evolution/prefs */
export async function getEvolutionPrefs(): Promise<GetEvolutionPrefsResponse> {
  return respond({ prefs: db.prefs })
}

/** PATCH /v1/evolution/prefs：只传改动字段，返回保存后的完整偏好。 */
export async function updateEvolutionPrefs(patch: UpdateEvolutionPrefsRequest): Promise<UpdateEvolutionPrefsResponse> {
  if (patch.mechanisms && patch.mechanisms.length === 0) {
    return reject('至少保留一项进化机制')
  }
  if (patch.min_support != null
    && (patch.min_support < MIN_SUPPORT_RANGE.min || patch.min_support > MIN_SUPPORT_RANGE.max)) {
    return reject(`沉淀门槛需在 ${MIN_SUPPORT_RANGE.min}-${MIN_SUPPORT_RANGE.max} 之间`)
  }
  Object.assign(db.prefs, patch)
  return respond(db.prefs)
}

/** GET /v1/evolution/contributions */
export async function getEvolutionContributions(): Promise<GetEvolutionContributionsResponse> {
  return respond(db.contributions)
}

/** GET /v1/evolution/my-candidates */
export async function getMyEvolutionCandidates(): Promise<GetMyEvolutionCandidatesResponse> {
  return respond({ candidates: db.candidates, own_evidence_threshold: 0.6 })
}

/** POST /v1/evolution/my-candidates/{id}/approve */
export async function approveMyEvolutionCandidate(candidateId: string): Promise<ApproveMyEvolutionCandidateResponse> {
  const index = db.candidates.findIndex((item) => item.candidate_id === candidateId)
  if (index < 0) return reject('该候选已处理或不存在', 404)
  const [candidate] = db.candidates.splice(index, 1)
  const change = candidate!.change
  if (change.type === 'memory_ops') {
    const created = change.operations.filter((op) => op.operation === 'create' || op.operation === 'new').length
    const removed = change.operations.filter((op) => op.operation === 'deprecate').length
    db.memory.memory_count += created - removed
  }
  return respond({
    skill_id: change.type === 'memory_ops' ? '' : `skill-${candidateId}`,
    scope: 'personal',
    tools: change.type === 'memory_ops' ? [] : change.allowed_tools,
  })
}
