import { Database } from "bun:sqlite"
import {
  type AnalysisLaunchControls,
  type AnalysisLaunchControlsInput,
  normalizeAnalysisLaunchControls,
} from "./analysis-launch-controls"
import { ensureProjectRegistry } from "./registry"
import type { ProjectPaths } from "./types"

export type AnalysisLaunchSettings = AnalysisLaunchControls & {
  readonly updated_at: string
}

type AnalysisLaunchSettingsRow = {
  readonly scope_mode: "full" | "partial"
  readonly scope_roots_json: string
  readonly exclude_folders_json: string
  readonly exclude_extensions_json: string
  readonly batch_size: number
  readonly worker_count: number
  readonly updated_at: string
}

const analysisLaunchSettingsKey = "default"

export async function writeAnalysisLaunchSettings(
  paths: ProjectPaths,
  input: AnalysisLaunchControlsInput,
): Promise<AnalysisLaunchSettings> {
  await ensureProjectRegistry(paths)
  const normalized = normalizeAnalysisLaunchControls(input)
  const updatedAt = new Date().toISOString()
  const db = new Database(paths.registryDb, { create: true })
  try {
    db.query(
      `insert into analysis_launch_settings
         (settings_key, scope_mode, scope_roots_json, exclude_folders_json, exclude_extensions_json, batch_size, worker_count, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(settings_key) do update set
         scope_mode = excluded.scope_mode,
         scope_roots_json = excluded.scope_roots_json,
         exclude_folders_json = excluded.exclude_folders_json,
         exclude_extensions_json = excluded.exclude_extensions_json,
         batch_size = excluded.batch_size,
         worker_count = excluded.worker_count,
         updated_at = excluded.updated_at`,
    ).run(
      analysisLaunchSettingsKey,
      normalized.scope.mode,
      JSON.stringify(normalized.scope.roots),
      JSON.stringify(normalized.excludeFolders),
      JSON.stringify(normalized.excludeExtensions),
      normalized.batchSize,
      normalized.workerCount,
      updatedAt,
    )
  } finally {
    db.close()
  }
  return { ...normalized, updated_at: updatedAt }
}

export async function readAnalysisLaunchSettings(
  paths: ProjectPaths,
): Promise<AnalysisLaunchSettings | null> {
  await ensureProjectRegistry(paths)
  const db = new Database(paths.registryDb, { readonly: true })
  try {
    const row = db
      .query<AnalysisLaunchSettingsRow, [string]>(
        `select scope_mode, scope_roots_json, exclude_folders_json, exclude_extensions_json,
                batch_size, worker_count, updated_at
         from analysis_launch_settings
         where settings_key = ?`,
      )
      .get(analysisLaunchSettingsKey)
    if (row === null) {
      return null
    }
    return {
      ...normalizeAnalysisLaunchControls({
        scope: { mode: row.scope_mode, roots: parseStringArray(row.scope_roots_json) },
        excludeFolders: parseStringArray(row.exclude_folders_json),
        excludeExtensions: parseStringArray(row.exclude_extensions_json),
        batchSize: row.batch_size,
        workerCount: row.worker_count,
      }),
      updated_at: row.updated_at,
    }
  } finally {
    db.close()
  }
}

function parseStringArray(valueJson: string): readonly string[] {
  const parsed = JSON.parse(valueJson) as unknown
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed.filter((value): value is string => typeof value === "string")
}
