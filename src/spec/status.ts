import { Database } from "bun:sqlite"
import { existsSync } from "node:fs"
import type { ProjectPaths, SpecRunStatus } from "../types"

type SpecRunStatusRow = {
  readonly analysis_run_id: string
  readonly analysis_type: string
  readonly status: string
  readonly provider_mode: string
  readonly model: string
  readonly prompt_version: string
  readonly retro_handoff_snapshot: string
  readonly scope_mode: "full" | "partial"
  readonly scope_roots_json: string
  readonly scope_fingerprint: string
  readonly broker_run_id: string | null
  readonly partial_result: string | null
  readonly error_message: string | null
}

type ColumnRow = {
  readonly name: string
}

type SnapshotPreflight = {
  readonly status?: unknown
  readonly reviewNeeded?: unknown
  readonly coverageLanguages?: unknown
  readonly coverageModes?: unknown
  readonly missingCapabilities?: unknown
}

export function readSpecStatuses(paths: ProjectPaths): readonly SpecRunStatus[] {
  if (!existsSync(paths.specAnalysisDb)) {
    return []
  }

  const db = new Database(paths.specAnalysisDb, { readonly: true })
  try {
    const columns = new Set(
      db
        .query<ColumnRow, []>("pragma table_info(analysis_runs)")
        .all()
        .map((column) => column.name),
    )
    return db
      .query<SpecRunStatusRow, []>(
        `select analysis_run_id, analysis_type, status,
                ${scopeSelect(columns, "provider_mode", "'deterministic'")},
                model, prompt_version, retro_handoff_snapshot,
                ${scopeSelect(columns, "scope_mode", "'full'")},
                ${scopeSelect(columns, "scope_roots_json", "'[]'")},
                ${scopeSelect(columns, "scope_fingerprint", "''")},
                ${scopeSelect(columns, "broker_run_id", "null")},
                ${scopeSelect(columns, "partial_result", "null")},
                ${scopeSelect(columns, "error_message", "null")}
         from analysis_runs
         order by started_at desc`,
      )
      .all()
      .map(toSpecRunStatus)
  } finally {
    db.close()
  }
}

function scopeSelect(columns: ReadonlySet<string>, column: string, fallback: string): string {
  return columns.has(column) ? column : `${fallback} as ${column}`
}

function toSpecRunStatus(row: SpecRunStatusRow): SpecRunStatus {
  const preflight = parsePreflight(row.retro_handoff_snapshot)
  return {
    analysis_run_id: row.analysis_run_id,
    analysis_type: row.analysis_type,
    status: row.status,
    provider_mode: row.provider_mode,
    model: row.model,
    prompt_version: row.prompt_version,
    preflight_status: preflight.status,
    review_needed: preflight.reviewNeeded,
    coverage_languages: preflight.coverageLanguages,
    coverage_modes: preflight.coverageModes,
    missing_capabilities: preflight.missingCapabilities,
    scope_mode: row.scope_mode,
    scope_roots_json: row.scope_roots_json,
    scope_fingerprint: row.scope_fingerprint,
    broker_run_id: row.broker_run_id,
    partial_result: row.partial_result,
    error_message: row.error_message,
  }
}

function parsePreflight(snapshot: string): {
  readonly status: "ready" | "limited" | null
  readonly reviewNeeded: boolean
  readonly coverageLanguages: readonly string[]
  readonly coverageModes: readonly string[]
  readonly missingCapabilities: readonly string[]
} {
  const parsed = JSON.parse(snapshot) as { readonly preflight?: SnapshotPreflight }
  const preflight = parsed.preflight
  const status =
    preflight?.status === "ready" || preflight?.status === "limited" ? preflight.status : null
  return {
    status,
    reviewNeeded: preflight?.reviewNeeded === true,
    coverageLanguages: Array.isArray(preflight?.coverageLanguages)
      ? preflight.coverageLanguages.filter(isString).toSorted()
      : [],
    coverageModes: Array.isArray(preflight?.coverageModes)
      ? preflight.coverageModes.filter(isString).toSorted()
      : [],
    missingCapabilities: Array.isArray(preflight?.missingCapabilities)
      ? preflight.missingCapabilities.filter(isString).toSorted()
      : [],
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}
