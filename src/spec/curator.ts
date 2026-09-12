import { Database } from "bun:sqlite"
import { ensureProjectRegistry } from "../registry"
import type { ProjectPaths } from "../types"
import type { RetroHandoffSnapshot } from "./types"

type HandoffRow = {
  readonly category: string
  readonly status: string
  readonly entity_count: number
  readonly retro_run_id: string
  readonly source_fingerprint: string
  readonly completed_at: string | null
  readonly parser_backend: string
  readonly support_level: string
  readonly evidence_label: string
  readonly missing_capability: string | null
  readonly coverage_summary_json: string
}

export class RetroHandoffNotReadyError extends Error {
  constructor(readonly category: string) {
    super(`retro handoff is not ready: ${category}`)
    this.name = "RetroHandoffNotReadyError"
  }
}

export async function requireReadyRetroHandoffs(
  paths: ProjectPaths,
  categories: readonly string[],
): Promise<readonly RetroHandoffSnapshot[]> {
  await ensureProjectRegistry(paths)
  const db = new Database(paths.registryDb, { readonly: true })

  try {
    return categories.map((category) => readySnapshot(category, findHandoff(db, category)))
  } finally {
    db.close()
  }
}

function findHandoff(db: Database, category: string): HandoffRow | null {
  return db
    .query<HandoffRow, [string]>(
      `select category, status, entity_count, retro_run_id, source_fingerprint, completed_at,
              parser_backend, support_level, evidence_label, missing_capability, coverage_summary_json
       from workflow_handoff
       where category = ?`,
    )
    .get(category)
}

function readySnapshot(category: string, row: HandoffRow | null): RetroHandoffSnapshot {
  if (row?.status !== "ready_for_analysis") {
    throw new RetroHandoffNotReadyError(category)
  }

  return {
    category: row.category,
    status: row.status,
    entityCount: row.entity_count,
    retroRunId: row.retro_run_id,
    sourceFingerprint: row.source_fingerprint,
    completedAt: row.completed_at,
    parserBackend: row.parser_backend,
    supportLevel: row.support_level,
    evidenceLabel: row.evidence_label,
    missingCapability: row.missing_capability,
    ...parseCoverageSummary(row.coverage_summary_json),
  }
}

function parseCoverageSummary(value: string): {
  readonly coverageLanguages: readonly string[]
  readonly coverageModes: readonly string[]
} {
  const parsed = JSON.parse(value) as { readonly languages?: unknown; readonly modes?: unknown }
  return {
    coverageLanguages: Array.isArray(parsed.languages)
      ? parsed.languages.filter(isString).toSorted()
      : [],
    coverageModes: Array.isArray(parsed.modes) ? parsed.modes.filter(isString).toSorted() : [],
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}
