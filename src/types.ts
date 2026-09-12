import type { AnalysisScope } from "./analysis-scope"
import type { ProjectWatcherSummary } from "./watchers"
export type { AnalysisScope } from "./analysis-scope"
export type { AnalysisLaunchControls } from "./analysis-launch-controls"

export type Port = number
export type AuthToken = string
export type ProjectId = string

export type RuntimePaths = {
  readonly homeDir: string
  readonly runtimeDir: string
  readonly portFile: string
  readonly tokenFile: string
  readonly projectsDb: string
}

export type ProjectPaths = {
  readonly projectRoot: string
  readonly stateDir: string
  readonly registryDb: string
  readonly jobsDir: string
  readonly jobsDb: string
  readonly specDir: string
  readonly specAnalysisDb: string
  readonly exportsDir: string
  readonly uploadsDir: string
  readonly glossaryDir: string
  readonly glossaryDb: string
}

export type DaemonEndpoint = {
  readonly port: Port
  readonly token: AuthToken
  readonly baseUrl: string
}

export type HealthResponse = {
  readonly ok: true
  readonly version: string
  readonly started_at: string
  readonly watchers: ProjectWatcherSummary
}

export type ProjectRecord = {
  readonly project_id: ProjectId
  readonly project_path: string
  readonly first_seen: string
  readonly last_active: string
  readonly active_jobs: number
}

export type RegisterProjectResponse = {
  readonly project_id: ProjectId
  readonly project_path: string
}

export type AnalysisStatusResponse = {
  readonly retro: readonly AnalysisCategoryStatus[]
  readonly spec: readonly SpecRunStatus[]
}

export type AnalysisCategoryStatus = {
  readonly category: string
  readonly status: string
  readonly entity_count: number
  readonly completed_at: string | null
  readonly parser_backend: string
  readonly support_level: LanguageSupportLevel
  readonly evidence_label: EvidenceLabel
  readonly missing_capability: string | null
  readonly coverage_summary_json: string
  readonly scope_mode: "full" | "partial"
  readonly scope_roots_json: string
  readonly scope_fingerprint: string
}

export type SpecRunStatus = {
  readonly analysis_run_id: string
  readonly analysis_type: string
  readonly status: string
  readonly provider_mode: string
  readonly model: string
  readonly prompt_version: string
  readonly preflight_status: "ready" | "limited" | null
  readonly review_needed: boolean
  readonly coverage_languages: readonly string[]
  readonly coverage_modes: readonly string[]
  readonly missing_capabilities: readonly string[]
  readonly scope_mode: "full" | "partial"
  readonly scope_roots_json: string
  readonly scope_fingerprint: string
  readonly broker_run_id: string | null
  readonly partial_result: string | null
  readonly error_message: string | null
}

export type CategoryEvidenceMetadata = {
  readonly parser_backend: string
  readonly parser_mode: ParserExtractionMode
  readonly support_level: LanguageSupportLevel
  readonly evidence_label: EvidenceLabel
  readonly missing_capability: string | null
}

export type RouterSummary = {
  readonly daemon: HealthResponse
  readonly project: RegisterProjectResponse
  readonly dashboardUrl: string
  readonly hasRetrospecState: boolean
  readonly retroStatuses: readonly AnalysisCategoryStatus[]
  readonly specStatuses: readonly SpecRunStatus[]
  readonly nextAction: string
}

export type {
  AwaitJobResponse,
  JobActor,
  JobDetailResponse,
  JobEventType,
  JobId,
  JobLedgerEvent,
  JobListResponse,
  JobSnapshot,
  JobStatus,
  SubmitJobRequest,
  SubmitJobResponse,
} from "./job-types"

export type GeneratedValidationStatus = "approved" | "blocked"

export type GeneratedValidationResponse = {
  readonly status: GeneratedValidationStatus
  readonly manifest_path: string
  readonly generation_contract_path: string
  readonly validation_report_path: string
  readonly entrypoint_path: string
  readonly blockers: readonly string[]
}

export type ExportFileRecord = {
  readonly file_id: string
  readonly file_name: string
  readonly format: string
  readonly size_bytes: number
  readonly created_at: string
  readonly download_url: string
  readonly category?: RetroExportCategory
  readonly input_db_paths?: readonly string[]
  readonly source_fingerprint?: string | null
  readonly analysis_run_id?: string | null
  readonly glossary_reconciliation?: {
    readonly term_count: number
    readonly entity_match_count: number
    readonly unmatched_entities: number
  }
}

export type RetroExportFormat = "csv" | "xlsx"

export type RetroExportType = RetroExportFormat | "markdown-tree"

export type RetroExportCategory = "structure" | "symbols"

export type LanguageSupportLevel = "high-confidence" | "best-effort" | "unsupported"

export type EvidenceLabel = "EXTRACTED" | "INFERRED" | "AMBIGUOUS"

export type ParserExtractionMode = "ast" | "generic_ast" | "regex" | "config" | "partial"

export type SourceExtractionEvidence = {
  readonly parserBackend: string
  readonly parserMode: ParserExtractionMode
  readonly supportLevel: LanguageSupportLevel
  readonly evidenceLabel: EvidenceLabel
  readonly missingCapability: string | null
}

export type TabularExport = {
  readonly category: RetroExportCategory
  readonly columns: readonly string[]
  readonly rows: readonly Record<string, string | number | null>[]
}

export type GenerateRetroExportsOptions = {
  readonly format: RetroExportFormat
}

export type UploadGlossaryResponse = {
  readonly upload_id: string
  readonly status: "staged"
  readonly stored_path: string
}

export type RetroFileRecord = {
  readonly entity_id: string
  readonly file_path: string
  readonly language: string
  readonly loc: number
  readonly size_bytes: number
  readonly module_name: string | null
  readonly content_hash: string
  readonly evidence?: SourceExtractionEvidence
}

export type RetroSymbolRecord = {
  readonly entity_id: string
  readonly parent_entity_id: string | null
  readonly symbol_type: string
  readonly name: string
  readonly signature: string | null
  readonly start_line: number
  readonly end_line: number
  readonly visibility: string | null
  readonly file_path: string
  readonly evidence?: SourceExtractionEvidence
}

export type RetroInventory = {
  readonly files: readonly RetroFileRecord[]
  readonly symbols: readonly RetroSymbolRecord[]
  readonly sourceFingerprint: string
  readonly analysisScope?: AnalysisScope
  readonly coverageSummaryJson?: string
}

export type FileFingerprintCandidate = {
  readonly relativePath: string
  readonly contentHash: string
  readonly sizeBytes: number
}

export type FileFingerprintSelection<T extends FileFingerprintCandidate> = {
  readonly changedFiles: readonly T[]
  readonly unchangedFiles: readonly T[]
}

export type RecordFileFingerprintsInput<T extends FileFingerprintCandidate> = {
  readonly retroRunId: string
  readonly analyzedAt: string
  readonly files: readonly T[]
}

export type OtherFallbackRecord = {
  readonly language: string
  readonly category: string
  readonly supportLevel: LanguageSupportLevel
  readonly evidenceLabel: EvidenceLabel
  readonly missingCapability: string
  readonly filePath: string
  readonly reason: string
}

export type OtherAnalysisInput = {
  readonly sourceFingerprint: string
  readonly records: readonly OtherFallbackRecord[]
}
