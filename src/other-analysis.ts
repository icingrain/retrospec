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
import type { OtherAnalysisInput, OtherFallbackRecord, ProjectPaths } from "./types"

const otherEvidence: RetroEvidenceMetadata = {
  parserBackend: "fallback-registry",
  supportLevel: "best-effort",
  evidenceLabel: "AMBIGUOUS",
  missingCapability: null,
  coverageSummaryJson: "{}",
}

export async function writeOtherAnalysis(
  paths: ProjectPaths,
  input: OtherAnalysisInput,
): Promise<void> {
  await ensureOtherStore(paths)
  await ensureProjectRegistry(paths)
  const run = createRetroRunMetadata(input.sourceFingerprint)
  const db = new Database(otherDbPath(paths), { create: true })

  try {
    writeRetroRun(db, {
      category: "other",
      sourceRoot: paths.projectRoot,
      run,
      evidence: otherEvidence,
    })
    replaceFallbackEvidence(db, input.records, run.runId)
  } finally {
    db.close()
  }

  const registry = new Database(paths.registryDb, { create: true })
  try {
    writeReadyHandoff(registry, {
      category: "other",
      entityCount: input.records.length,
      run,
      evidence: otherEvidence,
    })
  } finally {
    registry.close()
  }
}

function replaceFallbackEvidence(
  db: Database,
  records: readonly OtherFallbackRecord[],
  retroRunId: string,
): void {
  const recordedAt = new Date().toISOString()
  const insert = db.query(
    `insert into fallback_evidence
     (fallback_id, retro_run_id, language, category, support_level, evidence_label,
      missing_capability, file_path, start_line, end_line, reason, recorded_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, null, null, ?, ?)`,
  )

  db.exec("begin immediate transaction")
  try {
    db.exec("delete from fallback_evidence")
    records.forEach((record, index) => {
      insert.run(
        `fallback_${retroRunId}_${index}`,
        retroRunId,
        record.language,
        record.category,
        record.supportLevel,
        record.evidenceLabel,
        record.missingCapability,
        record.filePath,
        record.reason,
        recordedAt,
      )
    })
    db.exec("commit")
  } catch (error) {
    db.exec("rollback")
    throw error
  }
}

async function ensureOtherStore(paths: ProjectPaths): Promise<void> {
  ensureRetroCategoryStore(paths, "other")
}

function otherDbPath(paths: ProjectPaths): string {
  return join(paths.stateDir, "retro", "other.db")
}
