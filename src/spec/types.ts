import type { AnalysisScope } from "../analysis-scope"
import type { CategoryEvidenceMetadata } from "../types"

export type SpecAnalysisRunInput = {
  readonly analysisType: SpecAnalysisType
  readonly templateId?: string | undefined
  readonly providerMode?: SpecProviderMode | undefined
  readonly inputCategories: readonly string[]
  readonly model: string
  readonly promptVersion: string
  readonly retroHandoffSnapshot: string
  readonly analysisScope?: AnalysisScope | undefined
  readonly inputRetroRuns?: readonly string[] | undefined
}

export type SpecAnalysisType = "risk" | "migration" | "summary"

export type SpecProviderMode = "deterministic" | "env-provider" | "opencode-broker"

export type SpecUsageMetadata = {
  readonly promptTokens: number
  readonly completionTokens: number
  readonly totalTokens: number
  readonly costUsd: number
}

export type SpecAnalysisFailureMetadata = {
  readonly findings: readonly RiskFindingInput[]
  readonly partialResult: string
  readonly usage: SpecUsageMetadata
  readonly errorMessage: string
  readonly brokerRunId?: string
}

export type SpecAnalysisRunCompletion = {
  readonly usage?: SpecUsageMetadata
  readonly brokerRunId?: string
}

export type SpecAnalysisRunMetadata = {
  readonly analysisRunId: string
  readonly startedAt: string
}

export type RetroHandoffSnapshot = {
  readonly category: string
  readonly status: string
  readonly entityCount: number
  readonly retroRunId: string
  readonly sourceFingerprint: string
  readonly completedAt: string | null
  readonly parserBackend: string
  readonly supportLevel: string
  readonly evidenceLabel: string
  readonly missingCapability: string | null
  readonly coverageLanguages: readonly string[]
  readonly coverageModes: readonly string[]
}

export type SpecPreflightDistribution = {
  readonly value: string
  readonly count: number
}

export type SpecPreflightSummary = {
  readonly status: "ready" | "limited"
  readonly reviewNeeded: boolean
  readonly coverageLanguages: readonly string[]
  readonly coverageModes: readonly string[]
  readonly parserModes: readonly SpecPreflightDistribution[]
  readonly supportLevels: readonly SpecPreflightDistribution[]
  readonly evidenceLabels: readonly SpecPreflightDistribution[]
  readonly missingCapabilities: readonly string[]
  readonly notes: readonly string[]
}

export type SpecMemoryNote = {
  readonly memoryId: string
  readonly anchorType: string
  readonly anchorId: string
  readonly kind: string
  readonly content: string
}

export type SpecGlossaryMatch = {
  readonly entityId: string
  readonly glossaryType: string
  readonly glossaryKey: string
  readonly confidence: number
}

export type SpecBatchEntity = {
  readonly entityId: string
  readonly entityType: string
  readonly filePath: string
  readonly symbolName: string | null
  readonly signature: string | null
  readonly sourceCategory: string
  readonly contentHash: string | null
  readonly evidence: CategoryEvidenceMetadata
}

export type SpecBatchInput = {
  readonly handoffs: readonly RetroHandoffSnapshot[]
  readonly preflight: SpecPreflightSummary
  readonly entities: readonly SpecBatchEntity[]
  readonly memoryNotes: readonly SpecMemoryNote[]
  readonly glossaryMatches: readonly SpecGlossaryMatch[]
}

export type SpecEvidenceLabel = "EXTRACTED" | "INFERRED" | "AMBIGUOUS"

export type SpecFindingStatus = "open" | "needs_review" | "unresolved"

export type RiskFindingInput = {
  readonly findingId: string
  readonly entityId: string
  readonly severity: string
  readonly riskType: string
  readonly summary: string
  readonly evidence: string
  readonly recommendation: string
  readonly evidenceLabel?: SpecEvidenceLabel
  readonly findingStatus?: SpecFindingStatus
  readonly memoryNotes?: readonly string[]
}

export type SpecSourceAnchor = Readonly<Record<string, string | number | boolean | null>>

export type MigrationGroupInput = {
  readonly groupId: string
  readonly title: string
  readonly priority: string
  readonly summary: string
  readonly evidenceLabel?: SpecEvidenceLabel
  readonly confidence?: number
  readonly sourceAnchor?: SpecSourceAnchor
}

export type MigrationFindingInput = {
  readonly findingId: string
  readonly entityId?: string
  readonly filePath?: string
  readonly groupId?: string
  readonly migrationType: string
  readonly priority: string
  readonly summary: string
  readonly recommendation: string
  readonly evidenceLabel?: SpecEvidenceLabel
  readonly confidence?: number
  readonly sourceAnchor?: SpecSourceAnchor
}

export type SummarySectionInput = {
  readonly sectionId: string
  readonly title: string
  readonly body: string
  readonly rank: number
  readonly entityId?: string
  readonly filePath?: string
  readonly evidenceLabel?: SpecEvidenceLabel
  readonly confidence?: number
  readonly sourceAnchor?: SpecSourceAnchor
}

export type SpecAnalysisResult = {
  readonly analysisRunId: string
  readonly findingCount: number
}
