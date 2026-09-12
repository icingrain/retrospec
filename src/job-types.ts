import type { AnalysisLaunchControls } from "./analysis-launch-controls"
import type { AnalysisScope } from "./analysis-scope"

export type JobId = string

export type JobActor = "retro" | "spec" | "archivist"

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled"

export type JobEventType =
  | "submitted"
  | "started"
  | "checkpoint"
  | "blocker"
  | "error"
  | "completed"
  | "failed"
  | "cancelled"

export type SubmitJobRequest = {
  readonly project_path: string
  readonly actor: JobActor
  readonly category: string
  readonly manifest_path: string
  readonly scope?: AnalysisScope | undefined
  readonly launch_settings?: AnalysisLaunchControls | undefined
  readonly confirm_saved_scope?: boolean | undefined
  readonly write_scope_key?: string | undefined
  readonly replace_existing?: boolean | undefined
  readonly replaces_job_id?: JobId | undefined
}

export type SubmitJobResponse = {
  readonly job_id: JobId
  readonly status: JobStatus
  readonly replaced_job_id?: JobId | undefined
}

export type JobSnapshot = {
  readonly job_id: JobId
  readonly project_path: string
  readonly category: string
  readonly actor: JobActor
  readonly status: JobStatus
  readonly progress_pct: number
  readonly current_step: string | null
  readonly write_scope_key: string
  readonly replaces_job_id: JobId | null
  readonly submitted_at: string
  readonly updated_at: string
}

export type JobLedgerEvent = {
  readonly event_id: string
  readonly job_id: JobId
  readonly event_type: JobEventType
  readonly payload: string
  readonly timestamp: string
}

export type JobDetailResponse = {
  readonly snapshot: JobSnapshot
  readonly ledger: readonly JobLedgerEvent[]
}

export type AwaitJobResponse = {
  readonly job_id: JobId
  readonly status: JobStatus
  readonly timed_out: boolean
  readonly progress_pct: number
}

export type JobListResponse = {
  readonly jobs: readonly JobSnapshot[]
}
