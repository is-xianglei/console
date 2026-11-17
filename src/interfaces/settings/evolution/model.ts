/** 记忆开关与当前长期记忆条数（/v1/memories/settings）。 */
export interface MemorySettings {
  memory_enabled: boolean
  memory_write_enabled: boolean
  memory_count: number
}

/** 进化机制：记忆生长 / 技能沉淀 / 编排修正。 */
export type EvolutionMechanism = 'memory' | 'skill' | 'workflow'

/** 当前用户的进化偏好（/v1/evolution/prefs）。 */
export interface EvolutionPrefs {
  enabled: boolean
  mechanisms: EvolutionMechanism[]
  /** 同一做法至少重复多少次才会被整理成能力候选，2-20。 */
  min_support: number
  auto_approve_low_risk: boolean
}

export type EvolutionTargetKind = 'memory' | 'skill' | 'workflow' | 'prompt'

export type EvolutionCandidateStatus =
  | 'draft'
  | 'replay_passed'
  | 'shadow'
  | 'canary'
  | 'active'
  | 'retired'
  | 'rejected'
  | 'rolled_back'

export type EvolutionOperation = 'new' | 'create' | 'patch' | 'update' | 'reweight' | 'deprecate' | 'merge'

export type EvolutionRiskTier = 'low' | 'medium' | 'high'

/** 由本账号对话促成的一个能力候选。 */
export interface EvolutionContributionItem {
  candidate_id: string
  target_kind: EvolutionTargetKind
  summary: string
  status: EvolutionCandidateStatus
  risk_tier: EvolutionRiskTier
  your_episodes: number
  total_evidence: number
  created_at?: string | null
}

export interface EvolutionContributions {
  episodes: number
  contributed_episodes: number
  private_episodes: number
  memory_written: number
  candidates: EvolutionContributionItem[]
}

export interface MemoryOperation {
  operation: EvolutionOperation
  text: string
  reason: string
}

/** 批准后具体会发生的变更。 */
export type EvolutionChangePreview =
  | {
    type: 'skill_document'
    display_name: string
    description: string
    allowed_tools: string[]
    content: string
  }
  | {
    type: 'skill_sequence'
    display_name: string
    description: string
    allowed_tools: string[]
    steps: string[]
  }
  | {
    type: 'memory_ops'
    operations: MemoryOperation[]
  }

export type EvolutionCandidateAction = 'install_skill' | 'apply_memory'

/** 主要来自本人对话、本人可自行决定的候选。 */
export interface MyEvolutionCandidate {
  candidate_id: string
  target_kind: 'skill' | 'memory'
  operation: EvolutionOperation
  summary: string
  status: EvolutionCandidateStatus
  risk_tier: EvolutionRiskTier
  your_episodes: number
  total_evidence: number
  tool_sequence: string[]
  action: EvolutionCandidateAction
  action_label: string
  action_effect: string
  change: EvolutionChangePreview
  created_at?: string | null
}
