import { Database } from "bun:sqlite"
import { existsSync } from "node:fs"
import { fullAnalysisScope, isPathInScope, normalizeAnalysisScope } from "../analysis-scope"
import { readGlossaryReconciliation } from "../glossary"
import type {
  AnalysisScope,
  EvidenceLabel,
  LanguageSupportLevel,
  ParserExtractionMode,
  ProjectPaths,
} from "../types"
import { requireReadyRetroHandoffs } from "./curator"
import type {
  RetroHandoffSnapshot,
  SpecBatchEntity,
  SpecBatchInput,
  SpecGlossaryMatch,
  SpecMemoryNote,
  SpecPreflightDistribution,
  SpecPreflightSummary,
} from "./types"

type EntityRow = {
  readonly entity_id: string
  readonly entity_type: string
  readonly file_path: string
  readonly symbol_name: string | null
  readonly signature: string | null
  readonly source_category: string
  readonly content_hash: string | null
  readonly parser_backend: string
  readonly parser_mode: ParserExtractionMode
  readonly support_level: LanguageSupportLevel
  readonly evidence_label: EvidenceLabel
  readonly missing_capability: string | null
}

export async function buildSpecBatchInput(
  paths: ProjectPaths,
  categories: readonly string[],
  scope: AnalysisScope = fullAnalysisScope,
): Promise<SpecBatchInput> {
  const analysisScope = normalizeAnalysisScope(scope)
  const handoffs = await requireReadyRetroHandoffs(paths, categories)
  const db = new Database(paths.registryDb, { readonly: true })

  try {
    const entities = readEntities(db, categories, analysisScope)
    return {
      handoffs,
      preflight: buildPreflightSummary(handoffs, entities),
      entities,
      memoryNotes: readMemoryNotes(paths),
      glossaryMatches: readGlossaryMatches(paths),
    }
  } finally {
    db.close()
  }
}

function readGlossaryMatches(paths: ProjectPaths): readonly SpecGlossaryMatch[] {
  if (!existsSync(paths.glossaryDb)) {
    return []
  }

  return readGlossaryReconciliation(paths).entity_matches.map((match) => ({
    entityId: match.entity_id,
    glossaryType: match.glossary_type,
    glossaryKey: match.glossary_key,
    confidence: match.confidence,
  }))
}

function buildPreflightSummary(
  handoffs: readonly RetroHandoffSnapshot[],
  entities: readonly SpecBatchEntity[],
): SpecPreflightSummary {
  const coverage = mergeCoverageSummaries(handoffs)
  const parserModes = distribution(entities.map((entity) => entity.evidence.parser_mode))
  const supportLevels = distribution(entities.map((entity) => entity.evidence.support_level))
  const evidenceLabels = distribution(entities.map((entity) => entity.evidence.evidence_label))
  const missingCapabilities = [
    ...new Set(
      [
        ...handoffs.map((handoff) => handoff.missingCapability),
        ...entities.map((entity) => entity.evidence.missing_capability),
      ].filter(isString),
    ),
  ].toSorted()
  const reviewNeeded =
    parserModes.some((item) => item.value === "generic_ast") ||
    supportLevels.some((item) => item.value !== "high-confidence") ||
    evidenceLabels.some((item) => item.value !== "EXTRACTED") ||
    handoffs.some((handoff) => handoff.supportLevel !== "high-confidence") ||
    handoffs.some((handoff) => handoff.evidenceLabel !== "EXTRACTED") ||
    missingCapabilities.length > 0

  return {
    status: reviewNeeded ? "limited" : "ready",
    reviewNeeded,
    coverageLanguages: coverage.languages,
    coverageModes: coverage.modes,
    parserModes,
    supportLevels,
    evidenceLabels,
    missingCapabilities,
    notes: reviewNeeded
      ? ["Spec analysis can run, but reduced parser coverage requires review."]
      : [],
  }
}

type CoverageSummary = {
  readonly languages: readonly string[]
  readonly modes: readonly string[]
}

function mergeCoverageSummaries(handoffs: readonly RetroHandoffSnapshot[]): CoverageSummary {
  return {
    languages: [...new Set(handoffs.flatMap((handoff) => handoff.coverageLanguages))].toSorted(),
    modes: [...new Set(handoffs.flatMap((handoff) => handoff.coverageModes))].toSorted(),
  }
}

function distribution(values: readonly string[]): readonly SpecPreflightDistribution[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .toSorted((left, right) => left.value.localeCompare(right.value))
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function readEntities(
  db: Database,
  categories: readonly string[],
  scope: AnalysisScope,
): readonly SpecBatchEntity[] {
  const rows = db
    .query<EntityRow, []>(
      `select entity_id, entity_type, file_path, symbol_name, signature, source_category, content_hash,
              parser_backend, parser_mode, support_level, evidence_label, missing_capability
       from entities
       order by source_category, file_path, entity_id`,
    )
    .all()

  return rows
    .filter((row) => categories.includes(row.source_category))
    .filter((row) => isPathInScope(row.file_path, scope))
    .map(toBatchEntity)
}

function toBatchEntity(row: EntityRow): SpecBatchEntity {
  return {
    entityId: row.entity_id,
    entityType: row.entity_type,
    filePath: row.file_path,
    symbolName: row.symbol_name,
    signature: row.signature,
    sourceCategory: row.source_category,
    contentHash: row.content_hash,
    evidence: {
      parser_backend: row.parser_backend,
      parser_mode: row.parser_mode,
      support_level: row.support_level,
      evidence_label: row.evidence_label,
      missing_capability: row.missing_capability,
    },
  }
}

type MemoryNoteRow = {
  readonly memory_id: string
  readonly anchor_type: string
  readonly anchor_id: string
  readonly kind: string
  readonly content: string
}

function readMemoryNotes(paths: ProjectPaths): readonly SpecMemoryNote[] {
  if (!existsSync(paths.specAnalysisDb)) {
    return []
  }

  const db = new Database(paths.specAnalysisDb, { readonly: true })
  try {
    const table = db
      .query<{ readonly name: string }, []>(
        "select name from sqlite_master where type = 'table' and name = 'memory_notes'",
      )
      .get()
    if (table === null) {
      return []
    }

    return db
      .query<MemoryNoteRow, []>(
        `select memory_id, anchor_type, anchor_id, kind, content
         from memory_notes
         where status = 'active'
         order by created_at, memory_id`,
      )
      .all()
      .map(toMemoryNote)
  } finally {
    db.close()
  }
}

function toMemoryNote(row: MemoryNoteRow): SpecMemoryNote {
  return {
    memoryId: row.memory_id,
    anchorType: row.anchor_type,
    anchorId: row.anchor_id,
    kind: row.kind,
    content: row.content,
  }
}
