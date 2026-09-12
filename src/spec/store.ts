import { Database } from "bun:sqlite"
import {
  createScopeFingerprint,
  fullAnalysisScope,
  normalizeAnalysisScope,
} from "../analysis-scope"
import type { ProjectPaths } from "../types"
import { createSpecAnalysisRunId } from "./ids"
import { ensureSpecAnalysisStore } from "./schema"
import type {
  SpecAnalysisFailureMetadata,
  SpecAnalysisRunCompletion,
  SpecAnalysisRunInput,
  SpecAnalysisRunMetadata,
} from "./types"

export {
  writeMigrationFindings,
  writeMigrationGroups,
  writeRiskFindings,
  writeSummarySections,
} from "./finding-store"

export async function beginSpecAnalysisRun(
  paths: ProjectPaths,
  input: SpecAnalysisRunInput,
): Promise<SpecAnalysisRunMetadata> {
  await ensureSpecAnalysisStore(paths)
  const startedAt = new Date().toISOString()
  const analysisScope = normalizeAnalysisScope(input.analysisScope ?? fullAnalysisScope)
  const run = { analysisRunId: createSpecAnalysisRunId(startedAt), startedAt }
  const db = new Database(paths.specAnalysisDb, { create: true })

  try {
    db.query(
      `insert into analysis_runs
	       (analysis_run_id, analysis_type, template_id, provider_mode, input_categories, model, prompt_version, retro_handoff_snapshot,
	        scope_mode, scope_roots_json, scope_fingerprint, input_retro_runs_json, started_at, completed_at, status)
	       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, 'running')`,
    ).run(
      run.analysisRunId,
      input.analysisType,
      input.templateId ?? `${input.analysisType}.v1`,
      input.providerMode ?? "deterministic",
      JSON.stringify(input.inputCategories),
      input.model,
      input.promptVersion,
      input.retroHandoffSnapshot,
      analysisScope.mode,
      JSON.stringify(analysisScope.roots),
      createScopeFingerprint(analysisScope),
      JSON.stringify(input.inputRetroRuns ?? []),
      run.startedAt,
    )
  } finally {
    db.close()
  }

  return run
}

export async function completeSpecAnalysisRun(
  paths: ProjectPaths,
  analysisRunId: string,
  completion: SpecAnalysisRunCompletion = {},
): Promise<void> {
  await ensureSpecAnalysisStore(paths)
  const completedAt = new Date().toISOString()
  const db = new Database(paths.specAnalysisDb, { create: true })

  try {
    db.query(
      `update analysis_runs
       set status = 'completed', completed_at = ?, prompt_tokens = ?, completion_tokens = ?, total_tokens = ?, cost_usd = ?, broker_run_id = ?
       where analysis_run_id = ?`,
    ).run(
      completedAt,
      completion.usage?.promptTokens ?? null,
      completion.usage?.completionTokens ?? null,
      completion.usage?.totalTokens ?? null,
      completion.usage?.costUsd ?? null,
      completion.brokerRunId ?? null,
      analysisRunId,
    )
  } finally {
    db.close()
  }
}

export async function failSpecAnalysisRun(
  paths: ProjectPaths,
  analysisRunId: string,
  failure: SpecAnalysisFailureMetadata,
): Promise<void> {
  await ensureSpecAnalysisStore(paths)
  const completedAt = new Date().toISOString()
  const db = new Database(paths.specAnalysisDb, { create: true })

  try {
    db.query(
      `update analysis_runs
       set status = 'failed', completed_at = ?, prompt_tokens = ?, completion_tokens = ?, total_tokens = ?, cost_usd = ?, broker_run_id = ?, partial_result = ?, error_message = ?
       where analysis_run_id = ?`,
    ).run(
      completedAt,
      failure.usage.promptTokens,
      failure.usage.completionTokens,
      failure.usage.totalTokens,
      failure.usage.costUsd,
      failure.brokerRunId ?? null,
      failure.partialResult,
      failure.errorMessage,
      analysisRunId,
    )
  } finally {
    db.close()
  }
}
