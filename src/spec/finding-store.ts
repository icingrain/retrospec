import { Database } from "bun:sqlite"
import type { ProjectPaths } from "../types"
import { ensureSpecAnalysisStore } from "./schema"
import type {
  MigrationFindingInput,
  MigrationGroupInput,
  RiskFindingInput,
  SpecSourceAnchor,
  SummarySectionInput,
} from "./types"

export async function writeMigrationGroups(
  paths: ProjectPaths,
  analysisRunId: string,
  groups: readonly MigrationGroupInput[],
): Promise<void> {
  await ensureSpecAnalysisStore(paths)
  const createdAt = new Date().toISOString()
  const db = new Database(paths.specAnalysisDb, { create: true })

  try {
    const insert = db.query(
      `insert or replace into migration_groups
       (group_id, analysis_run_id, title, priority, summary, evidence_label, confidence, source_anchor_json, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    for (const group of groups) {
      insert.run(
        group.groupId,
        analysisRunId,
        group.title,
        group.priority,
        group.summary,
        group.evidenceLabel ?? "INFERRED",
        group.confidence ?? null,
        stringifySourceAnchor(group.sourceAnchor),
        createdAt,
      )
    }
  } finally {
    db.close()
  }
}

export async function writeMigrationFindings(
  paths: ProjectPaths,
  analysisRunId: string,
  findings: readonly MigrationFindingInput[],
): Promise<void> {
  await ensureSpecAnalysisStore(paths)
  const createdAt = new Date().toISOString()
  const db = new Database(paths.specAnalysisDb, { create: true })

  try {
    const insert = db.query(
      `insert or replace into migration_findings
       (finding_id, analysis_run_id, entity_id, file_path, group_id, migration_type, priority, summary, recommendation, evidence_label, confidence, source_anchor_json, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    for (const finding of findings) {
      insert.run(
        finding.findingId,
        analysisRunId,
        finding.entityId ?? null,
        finding.filePath ?? null,
        finding.groupId ?? null,
        finding.migrationType,
        finding.priority,
        finding.summary,
        finding.recommendation,
        finding.evidenceLabel ?? "INFERRED",
        finding.confidence ?? null,
        stringifySourceAnchor(finding.sourceAnchor),
        createdAt,
      )
    }
  } finally {
    db.close()
  }
}

export async function writeSummarySections(
  paths: ProjectPaths,
  analysisRunId: string,
  sections: readonly SummarySectionInput[],
): Promise<void> {
  await ensureSpecAnalysisStore(paths)
  const createdAt = new Date().toISOString()
  const db = new Database(paths.specAnalysisDb, { create: true })

  try {
    const insert = db.query(
      `insert or replace into summary_sections
       (section_id, analysis_run_id, entity_id, file_path, title, body, rank, evidence_label, confidence, source_anchor_json, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    for (const section of sections) {
      insert.run(
        section.sectionId,
        analysisRunId,
        section.entityId ?? null,
        section.filePath ?? null,
        section.title,
        section.body,
        section.rank,
        section.evidenceLabel ?? "INFERRED",
        section.confidence ?? null,
        stringifySourceAnchor(section.sourceAnchor),
        createdAt,
      )
    }
  } finally {
    db.close()
  }
}

export async function writeRiskFindings(
  paths: ProjectPaths,
  analysisRunId: string,
  findings: readonly RiskFindingInput[],
): Promise<void> {
  await ensureSpecAnalysisStore(paths)
  const createdAt = new Date().toISOString()
  const db = new Database(paths.specAnalysisDb, { create: true })

  try {
    const insert = db.query(
      `insert or replace into risk_findings
       (finding_id, analysis_run_id, entity_id, severity, risk_type, summary, evidence, recommendation, evidence_label, finding_status, memory_notes, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    for (const finding of findings) {
      insert.run(
        finding.findingId,
        analysisRunId,
        finding.entityId,
        finding.severity,
        finding.riskType,
        finding.summary,
        finding.evidence,
        finding.recommendation,
        finding.evidenceLabel ?? "INFERRED",
        finding.findingStatus ?? "needs_review",
        JSON.stringify(finding.memoryNotes ?? []),
        createdAt,
      )
    }
  } finally {
    db.close()
  }
}

function stringifySourceAnchor(sourceAnchor: SpecSourceAnchor | undefined): string {
  return JSON.stringify(sourceAnchor ?? {})
}
