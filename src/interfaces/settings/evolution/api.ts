import type {
  EvolutionContributions,
  EvolutionPrefs,
  MemorySettings,
  MyEvolutionCandidate,
} from './model'

/** GET /v1/memories/settings */
export type GetMemorySettingsResponse = MemorySettings

/** PATCH /v1/memories/settings：只传改动字段。 */
export type UpdateMemorySettingsRequest = Partial<Pick<MemorySettings, 'memory_enabled' | 'memory_write_enabled'>>

/** GET /v1/evolution/prefs */
export interface GetEvolutionPrefsResponse {
  prefs: EvolutionPrefs
}

/** PATCH /v1/evolution/prefs：只传改动字段，返回保存后的完整偏好。 */
export type UpdateEvolutionPrefsRequest = Partial<EvolutionPrefs>
export type UpdateEvolutionPrefsResponse = EvolutionPrefs

/** GET /v1/evolution/contributions */
export type GetEvolutionContributionsResponse = EvolutionContributions

/** GET /v1/evolution/my-candidates */
export interface GetMyEvolutionCandidatesResponse {
  candidates: MyEvolutionCandidate[]
  own_evidence_threshold: number
}

/** POST /v1/evolution/my-candidates/{id}/approve */
export interface ApproveMyEvolutionCandidateResponse {
  skill_id: string
  scope: string
  tools: string[]
}
