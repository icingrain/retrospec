import { Database } from "bun:sqlite"
import { join } from "node:path"
import { ensureProjectRegistry } from "./registry"
import { ensureRetroCategoryStore } from "./retro-schema"
import {
  type RetroEvidenceMetadata,
  createRetroRunMetadata,
  writeReadyHandoff,
  writeRetroRun,
} from "./retro/handoff"
import type { ProjectPaths } from "./types"

export const CALL_CONFIDENCE_LABELS = ["EXTRACTED", "INFERRED", "AMBIGUOUS"] as const

export type CallConfidenceLabel = (typeof CALL_CONFIDENCE_LABELS)[number]

export type CallGraphEdge = {
  readonly caller_entity_id: string
  readonly callee_entity_id: string | null
  readonly callee_name: string
  readonly file_path: string
  readonly line: number
  readonly confidence: number
  readonly confidence_label: CallConfidenceLabel
}

export type SequenceCandidate = {
  readonly sequence_id: string
  readonly root_entity_id: string
  readonly participant_entity_ids: readonly string[]
  readonly call_path: readonly string[]
  readonly confidence: number
  readonly reason: string | null
}

export type CallGraphInput = {
  readonly sourceFingerprint: string
  readonly calls: readonly CallGraphEdge[]
  readonly sequenceCandidates: readonly SequenceCandidate[]
}

const callGraphEvidence: RetroEvidenceMetadata = {
  parserBackend: "tree-sitter",
  supportLevel: "high-confidence",
  evidenceLabel: "EXTRACTED",
  missingCapability: null,
  coverageSummaryJson: "{}",
}

export async function writeCallGraph(paths: ProjectPaths, input: CallGraphInput): Promise<void> {
  await ensureCallGraphStore(paths)
  await ensureProjectRegistry(paths)
  const run = createRetroRunMetadata(input.sourceFingerprint)
  const db = new Database(callGraphDbPath(paths), { create: true })

  try {
    writeRetroRun(db, {
      category: "call_graph",
      sourceRoot: paths.projectRoot,
      run,
      evidence: callGraphEvidence,
    })
    db.exec(
      "delete from calls; delete from sequence_candidates; delete from graph_communities; delete from usage_metrics",
    )
    writeCalls(db, input.calls, run.runId)
    writeSequenceCandidates(db, input.sequenceCandidates, run.runId)
  } finally {
    db.close()
  }

  const registry = new Database(paths.registryDb, { create: true })
  try {
    writeReadyHandoff(registry, {
      category: "call_graph",
      entityCount: input.calls.length,
      run,
      evidence: callGraphEvidence,
    })
  } finally {
    registry.close()
  }
}

function writeCalls(db: Database, calls: readonly CallGraphEdge[], retroRunId: string): void {
  const insert = db.query(
    `insert into calls
     (call_id, retro_run_id, caller_entity_id, callee_entity_id, callee_name, file_path, line,
      confidence, confidence_label, evidence_label, parser_backend, resolution_status, reason)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  for (const call of calls) {
    const resolutionStatus = call.callee_entity_id === null ? "ambiguous" : "resolved"
    insert.run(
      `${call.caller_entity_id}:${call.file_path}:${call.line}:${call.callee_name}`,
      retroRunId,
      call.caller_entity_id,
      call.callee_entity_id,
      call.callee_name,
      call.file_path,
      call.line,
      call.confidence,
      call.confidence_label,
      call.confidence_label,
      callGraphEvidence.parserBackend,
      resolutionStatus,
      resolutionStatus === "resolved" ? null : "callee target unresolved",
    )
  }
}

function writeSequenceCandidates(
  db: Database,
  candidates: readonly SequenceCandidate[],
  retroRunId: string,
): void {
  const insert = db.query(
    `insert into sequence_candidates
     (sequence_id, retro_run_id, root_entity_id, participant_entity_ids, participant_entity_ids_json,
      call_path, call_path_json, confidence, evidence_label, reason)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  for (const candidate of candidates) {
    const participantEntityIds = JSON.stringify(candidate.participant_entity_ids)
    const callPath = JSON.stringify(candidate.call_path)
    insert.run(
      candidate.sequence_id,
      retroRunId,
      candidate.root_entity_id,
      participantEntityIds,
      participantEntityIds,
      callPath,
      callPath,
      candidate.confidence,
      callGraphEvidence.evidenceLabel,
      candidate.reason,
    )
  }
}

async function ensureCallGraphStore(paths: ProjectPaths): Promise<void> {
  ensureRetroCategoryStore(paths, "call_graph")
}

function callGraphDbPath(paths: ProjectPaths): string {
  return join(paths.stateDir, "retro", "call_graph.db")
}
