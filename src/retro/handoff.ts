import { Database } from "bun:sqlite"
import { randomUUID } from "node:crypto"
import {
  type AnalysisScope,
  createScopeFingerprint,
  fullAnalysisScope,
  normalizeAnalysisScope,
} from "../analysis-scope"
import { projectPaths } from "../paths"
import { ensureProjectRegistry } from "../registry"

export type RetroRunMetadata = {
  readonly runId: string
  readonly now: string
  readonly sourceFingerprint: string
  readonly analysisScope: AnalysisScope
  readonly scopeFingerprint: string
}

export type RetroEvidenceMetadata = {
  readonly parserBackend: string
  readonly supportLevel: "high-confidence" | "best-effort" | "unsupported"
  readonly evidenceLabel: "EXTRACTED" | "INFERRED" | "AMBIGUOUS"
  readonly missingCapability: string | null
  readonly coverageSummaryJson: string
}

export type HandoffInput = {
  readonly category: string
  readonly entityCount: number
  readonly run: RetroRunMetadata
  readonly evidence: RetroEvidenceMetadata
}

export type RetroRunInput = {
  readonly category: string
  readonly sourceRoot: string
  readonly run: RetroRunMetadata
  readonly evidence: RetroEvidenceMetadata
}

type FailedHandoffInput = {
  readonly category: string
  readonly errorMessage: string
  readonly now: string
}

export function createRetroRunMetadata(
  sourceFingerprint: string,
  scope: AnalysisScope = fullAnalysisScope,
): RetroRunMetadata {
  const now = new Date().toISOString()
  const analysisScope = normalizeAnalysisScope(scope)
  return {
    runId: `rrun_${now.replaceAll(/[-:.TZ]/g, "").slice(0, 17)}_${randomUUID().replaceAll("-", "").slice(0, 8)}`,
    now,
    sourceFingerprint,
    analysisScope,
    scopeFingerprint: createScopeFingerprint(analysisScope),
  }
}

export function writeRetroRun(db: Database, input: RetroRunInput): void {
  db.query(
    `insert or replace into retro_runs
     (retro_run_id, category, tool_version, skill_version, source_root, source_fingerprint,
      scope_mode, scope_roots_json, scope_fingerprint, parser_backend, support_level, evidence_label,
      missing_capability, started_at, completed_at, status, summary_json)
     values (?, ?, 'retrospec-agent', 'code-inventory-v1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
  ).run(...dbRetroRun(input))
}

export function writeReadyHandoff(db: Database, input: HandoffInput): void {
  db.query(
    `insert into workflow_handoff
	     (category, status, completed_at, entity_count, retro_run_id, source_fingerprint,
	      parser_backend, support_level, evidence_label, missing_capability, coverage_summary_json,
	      scope_mode, scope_roots_json, scope_fingerprint, error_message, updated_at)
	     values (?, 'ready_for_analysis', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?)
     on conflict(category) do update set
       status = excluded.status,
       completed_at = excluded.completed_at,
       entity_count = excluded.entity_count,
       retro_run_id = excluded.retro_run_id,
       source_fingerprint = excluded.source_fingerprint,
       parser_backend = excluded.parser_backend,
       support_level = excluded.support_level,
       evidence_label = excluded.evidence_label,
	       missing_capability = excluded.missing_capability,
	       coverage_summary_json = excluded.coverage_summary_json,
	       scope_mode = excluded.scope_mode,
	       scope_roots_json = excluded.scope_roots_json,
	       scope_fingerprint = excluded.scope_fingerprint,
	       error_message = null,
       updated_at = excluded.updated_at`,
  ).run(...dbHandoff(input), input.run.now)
}

export function writeIncompleteHandoff(db: Database, input: HandoffInput): void {
  db.query(
    `insert into workflow_handoff
	     (category, status, completed_at, entity_count, retro_run_id, source_fingerprint,
	      parser_backend, support_level, evidence_label, missing_capability, coverage_summary_json,
	      scope_mode, scope_roots_json, scope_fingerprint, error_message, updated_at)
	     values (?, 'incomplete', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?)
     on conflict(category) do update set
       status = excluded.status,
       completed_at = excluded.completed_at,
       entity_count = excluded.entity_count,
       retro_run_id = excluded.retro_run_id,
       source_fingerprint = excluded.source_fingerprint,
       parser_backend = excluded.parser_backend,
       support_level = excluded.support_level,
       evidence_label = excluded.evidence_label,
	       missing_capability = excluded.missing_capability,
	       coverage_summary_json = excluded.coverage_summary_json,
	       scope_mode = excluded.scope_mode,
	       scope_roots_json = excluded.scope_roots_json,
	       scope_fingerprint = excluded.scope_fingerprint,
	       error_message = null,
       updated_at = excluded.updated_at`,
  ).run(...dbHandoff(input), input.run.now)
}

export async function writeRetroInventoryFailure(
  projectRoot: string,
  error: Error,
  scope: AnalysisScope = fullAnalysisScope,
): Promise<void> {
  const analysisScope = normalizeAnalysisScope(scope)
  if (analysisScope.mode === "partial") {
    return
  }
  const paths = projectPaths(projectRoot)
  await ensureProjectRegistry(paths)
  const db = new Database(paths.registryDb, { create: true })
  const now = new Date().toISOString()
  try {
    writeFailedHandoff(db, { category: "structure", errorMessage: error.message, now })
    writeFailedHandoff(db, { category: "symbols", errorMessage: error.message, now })
  } finally {
    db.close()
  }
}

function writeFailedHandoff(db: Database, input: FailedHandoffInput): void {
  db.query(
    `insert into workflow_handoff
	     (category, status, completed_at, entity_count, retro_run_id, source_fingerprint,
	      parser_backend, support_level, evidence_label, missing_capability, coverage_summary_json,
	      scope_mode, scope_roots_json, scope_fingerprint, error_message, updated_at)
	     values (?, 'failed', null, 0, ?, '', 'unknown', 'unsupported', 'AMBIGUOUS', 'retro-inventory', '{}', 'full', '[]', '', ?, ?)
     on conflict(category) do update set
       status = excluded.status,
       completed_at = null,
       entity_count = 0,
       retro_run_id = excluded.retro_run_id,
       source_fingerprint = '',
       parser_backend = excluded.parser_backend,
       support_level = excluded.support_level,
       evidence_label = excluded.evidence_label,
	       missing_capability = excluded.missing_capability,
	       coverage_summary_json = excluded.coverage_summary_json,
	       scope_mode = excluded.scope_mode,
	       scope_roots_json = excluded.scope_roots_json,
	       scope_fingerprint = excluded.scope_fingerprint,
       error_message = excluded.error_message,
       updated_at = excluded.updated_at`,
  ).run(input.category, createRetroRunMetadata("").runId, input.errorMessage, input.now)
}

function dbRetroRun(
  input: RetroRunInput,
): readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string | null,
  string,
  string,
  string,
] {
  return [
    input.run.runId,
    input.category,
    input.sourceRoot,
    input.run.sourceFingerprint,
    input.run.analysisScope.mode,
    JSON.stringify(input.run.analysisScope.roots),
    input.run.scopeFingerprint,
    input.evidence.parserBackend,
    input.evidence.supportLevel,
    input.evidence.evidenceLabel,
    input.evidence.missingCapability,
    input.run.now,
    input.run.now,
    input.evidence.coverageSummaryJson,
  ]
}

function dbHandoff(
  input: HandoffInput,
): readonly [
  string,
  string,
  number,
  string,
  string,
  string,
  string,
  string,
  string | null,
  string,
  string,
  string,
  string,
] {
  return [
    input.category,
    input.run.now,
    input.entityCount,
    input.run.runId,
    input.run.sourceFingerprint,
    input.evidence.parserBackend,
    input.evidence.supportLevel,
    input.evidence.evidenceLabel,
    input.evidence.missingCapability,
    input.evidence.coverageSummaryJson,
    input.run.analysisScope.mode,
    JSON.stringify(input.run.analysisScope.roots),
    input.run.scopeFingerprint,
  ]
}
